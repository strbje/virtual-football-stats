import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB";

// Кластеры — по РАСШИРЕННЫМ амплуа (fp.code)
const CLUSTERS: Record<ClusterKey, readonly string[]> = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЦП", "ЛЦП", "ПЦП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
} as const;

// Наборы метрик для радара по кластерам
const RADAR_BY_CLUSTER = {
  FW: ["goal_contrib", "xg_delta", "shots_on_target_pct", "creation", "dribble_pct", "pressing"],
  AM: ["xa", "pxa", "goal_contrib", "pass_acc", "dribble_pct", "pressing"],
  CM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct"],
  FM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct", "crosses", "goal_contrib"],
  CB: ["safety_coef", "def_actions", "tackle_success", "clearances", "pass_acc", "attack_participation", "aerial_pct", "beaten_rate"],
} as const;

// Метрики, где МЕНЬШЕ — ЛУЧШЕ (перцентиль считаем инвертированно)
const LOWER_IS_BETTER = new Set<string>([
  "beaten_rate",
  "pxa", // «пасы на 0.5 xA» — меньше лучше
]);

const LABELS: Record<string, string> = {
  goal_contrib: "Гол+пас",
  xg_delta: "Реализация xG",
  shots_on_target_pct: "Удары в створ %",
  creation: "Созидание",
  dribble_pct: "Дриблинг %",
  pressing: "Прессинг",
  xa: "xA",
  pxa: "pXA (пасы/0.5 xA)",
  passes: "Пасы",
  pass_acc: "Точность пасов %",
  def_actions: "Защитные действия",
  beaten_rate: "Beaten Rate ↓",
  aerial_pct: "Верховые %",
  crosses: "Навесы (успеш.)",
  safety_coef: "Кэф безопасности",
  tackle_success: "% удачных отборов",
  clearances: "Выносы",
  attack_participation: "Участие в атаке",
};

const SEASON_MIN = 18;
const XG_EXPR = "ums.goals_expected"; // подтвержденное поле

type Params = { params: { userId: string } };

function clusterOf(roleCode: string | null | undefined): ClusterKey | null {
  if (!roleCode) return null;
  for (const k of Object.keys(CLUSTERS) as ClusterKey[]) {
    if (CLUSTERS[k].includes(roleCode)) return k;
  }
  return null;
}

function originFrom(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

// Нормализация чисел из БД: bigint/Decimal/строки -> number
function toNum(v: any, def = 0): number {
  if (v == null) return def;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Быстрый расчёт перцентиля по массиву значений
function percentileOf(value: number, sample: number[], lowerIsBetter: boolean): number {
  if (!sample.length) return 0;
  const n = sample.length;
  let rank: number;
  if (lowerIsBetter) {
    // чем меньше — тем лучше → перцентиль = доля значений >= value
    const betterEq = sample.filter(v => v >= value).length;
    rank = (betterEq / n) * 100;
  } else {
    // чем больше — тем лучше → перцентиль = доля значений <= value
    const betterEq = sample.filter(v => v <= value).length;
    rank = (betterEq / n) * 100;
  }
  // аккуратная «стрижка» в 0..100 и округление до целого
  if (!Number.isFinite(rank)) return 0;
  const clipped = Math.max(0, Math.min(100, rank));
  return Math.round(clipped);
}

export async function GET(req: Request, { params }: Params) {
  try {
    const userIdNum = Number(params.userId);
    if (!Number.isFinite(userIdNum)) {
      return NextResponse.json({ ok: false, error: "bad userId" }, { status: 400 });
    }
    const wantDebug = new URL(req.url).searchParams.get("debug") === "1";

    // 1) текущая роль/кластер через уже рабочую ручку
    const base = originFrom(req);
    const rolesRes = await fetch(`${base}/api/player-roles?userId=${encodeURIComponent(String(userIdNum))}`, { cache: "no-store" });
    if (!rolesRes.ok) {
      const t = await rolesRes.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `player-roles failed: ${rolesRes.status} ${t}` }, { status: 502 });
    }
    const rolesJson: any = await rolesRes.json();
    const currentRole: string | null = rolesJson?.currentRoleLast30 ?? null;
    const cluster = clusterOf(currentRole);
    if (!cluster) {
      return NextResponse.json({ ok: true, ready: false, currentRole, reason: "Не удалось определить кластер" });
    }

    // 2) фильтр по кластеру — по fp.code (расширенные амплуа)
    const roleCodes = CLUSTERS[cluster].map((c) => `'${c}'`).join(",");

    // 3) только официальные турниры: в названии ДОЛЖНО быть слово "сезон", а номер сезона >= 18
    const OFFICIAL_FILTER = `
      AND t.name REGEXP 'сезон'
      AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}
    `;

    // 4) агрегат по игроку (сырьё для радара)
    const AGG_SQL = `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,
          ${XG_EXPR} AS goal_expected,
          ums.goals, ums.assists,
          ums.kicked, ums.kickedin,
          ums.passes        AS xa_part,
          ums.allpasses, ums.completedpasses, ums.passes_rate,
          ums.ipasses, ums.pregoal_passes,
          ums.allstockes, ums.completedstockes,
          ums.intercepts,
          ums.allselection, ums.selection,
          ums.completedtackles,
          ums.blocks,
          ums.outs,
          ums.outplayed, ums.penalised_fails,
          ums.duels_air, ums.duels_air_win,
          ums.crosses,
          t.name AS tournament_name
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t ON tm.tournament_id = t.id
        LEFT  JOIN skills_positions sp ON ums.skill_id = sp.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE ums.user_id = ${userIdNum}
          AND fp.code IN (${roleCodes})
          ${OFFICIAL_FILTER}
      ),
      agg AS (
        SELECT
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
          SUM(goals) AS goals, SUM(assists) AS assists,
          SUM(goal_expected) AS xg,
          SUM(kicked) AS kicked, SUM(kickedin) AS kickedin,
          SUM(xa_part) AS xa,
          SUM(allpasses) AS allpasses, SUM(completedpasses) AS completedpasses,
          SUM(ipasses) AS ipasses, SUM(pregoal_passes) AS pregoals,
          SUM(allstockes) AS allstockes, SUM(completedstockes) AS completedstockes,
          SUM(intercepts) AS intercepts,
          SUM(allselection) AS allselection, SUM(selection) AS selection,
          SUM(completedtackles) AS completedtackles,
          SUM(blocks) AS blocks,
          SUM(outs) AS outs,
          SUM(outplayed) + SUM(penalised_fails) AS beaten,
          SUM(duels_air) AS duels_air, SUM(duels_air_win) AS duels_air_win,
          SUM(crosses) AS crosses
        FROM base
      )
      SELECT
        (matches * 1.0)                                        AS matches,

        ((goals + assists) / NULLIF(matches,0)) * 1.0          AS goal_contrib,
        ((goals - xg) / NULLIF(matches,0)) * 1.0               AS xg_delta,
        (kickedin / NULLIF(kicked,0)) * 1.0                    AS shots_on_target_pct,
        ((pregoals + ipasses + 2*xa) / NULLIF(matches,0)) * 1.0 AS creation,
        (completedstockes / NULLIF(allstockes,0)) * 1.0        AS dribble_pct,
        ((intercepts + selection) / NULLIF(matches,0)) * 1.0   AS pressing,

        (xa / NULLIF(matches,0)) * 1.0                         AS xa_avg,
        (0.5 * allpasses / NULLIF(xa,0)) * 1.0                 AS pxa,

        (allpasses / NULLIF(matches,0)) * 1.0                  AS passes,
        (completedpasses / NULLIF(allpasses,0)) * 1.0          AS pass_acc,

        ((intercepts + selection + completedtackles + blocks) / NULLIF(matches,0)) * 1.0  AS def_actions,
        ((beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)) * 1.0   AS beaten_rate,
        (duels_air_win / NULLIF(duels_air,0)) * 1.0            AS aerial_pct,

        (crosses / NULLIF(matches,0)) * 1.0                    AS crosses_avg,

        (0.5*(completedpasses/NULLIF(allpasses,0))
        +0.3*(completedstockes/NULLIF(allstockes,0))
        +0.15*(duels_air_win/NULLIF(duels_air,0))
        +0.05*(selection/NULLIF(allselection,0))) * 1.0        AS safety_coef,

        (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
        (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
        ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
      FROM agg
    `;

    const agg: any[] = await prisma.$queryRawUnsafe(AGG_SQL);
    const A = agg[0] ?? {};
    const matchesCluster = toNum(A?.matches, 0);

    // 5) турниры (для диагностики)
    const TOURS_SQL = `
      SELECT
        t.name AS name,
        CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) AS season,
        CAST(COUNT(DISTINCT ums.match_id) AS UNSIGNED) AS matches
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE ums.user_id = ${userIdNum}
        AND fp.code IN (${roleCodes})
        ${OFFICIAL_FILTER}
      GROUP BY t.name
      ORDER BY season DESC, name ASC
      LIMIT 200
    `;
    const toursRaw: any[] = await prisma.$queryRawUnsafe(TOURS_SQL);
    const tours = toursRaw.map(r => ({
      name: String(r?.name ?? ""),
      season: toNum(r?.season, null as any),
      matches: toNum(r?.matches, 0)
    }));
    const tournamentsUsed = tours.map(t => t.name);

    if (!matchesCluster || matchesCluster < 30) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed,
        reason: "Недостаточно матчей в кластере (< 30)",
        debug: wantDebug ? {
          seasonMin: SEASON_MIN,
          officialFilterApplied: true,
          tournaments: tours,
        } : undefined,
      });
    }

    // 6) Радар по игроку — сырьё
    const keys = RADAR_BY_CLUSTER[cluster];
    const playerRaw: Record<string, number> = {};
    for (const k of keys) {
      const rawKey = k === "xa" ? "xa_avg" : k === "crosses" ? "crosses_avg" : k;
      playerRaw[k] = toNum((A as any)?.[rawKey], 0);
    }

    // 7) Коhортa по кластеру: та же фильтрация, те же расчёты, но GROUP BY user_id
    const COHORT_SQL = `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,
          ${XG_EXPR} AS goal_expected,
          ums.goals, ums.assists,
          ums.kicked, ums.kickedin,
          ums.passes        AS xa_part,
          ums.allpasses, ums.completedpasses, ums.passes_rate,
          ums.ipasses, ums.pregoal_passes,
          ums.allstockes, ums.completedstockes,
          ums.intercepts,
          ums.allselection, ums.selection,
          ums.completedtackles,
          ums.blocks,
          ums.outs,
          ums.outplayed, ums.penalised_fails,
          ums.duels_air, ums.duels_air_win,
          ums.crosses
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE fp.code IN (${roleCodes})
          ${OFFICIAL_FILTER}
      ),
      per_user AS (
        SELECT
          user_id,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
          SUM(goals) AS goals, SUM(assists) AS assists,
          SUM(goal_expected) AS xg,
          SUM(kicked) AS kicked, SUM(kickedin) AS kickedin,
          SUM(xa_part) AS xa,
          SUM(allpasses) AS allpasses, SUM(completedpasses) AS completedpasses,
          SUM(ipasses) AS ipasses, SUM(pregoal_passes) AS pregoals,
          SUM(allstockes) AS allstockes, SUM(completedstockes) AS completedstockes,
          SUM(intercepts) AS intercepts,
          SUM(allselection) AS allselection, SUM(selection) AS selection,
          SUM(completedtackles) AS completedtackles,
          SUM(blocks) AS blocks,
          SUM(outs) AS outs,
          SUM(outplayed) + SUM(penalised_fails) AS beaten,
          SUM(duels_air) AS duels_air, SUM(duels_air_win) AS duels_air_win,
          SUM(crosses) AS crosses
        FROM base
        GROUP BY user_id
      )
      SELECT
        user_id,
        (matches * 1.0)                                        AS matches,
        ((goals + assists) / NULLIF(matches,0)) * 1.0          AS goal_contrib,
        ((goals - xg) / NULLIF(matches,0)) * 1.0               AS xg_delta,
        (kickedin / NULLIF(kicked,0)) * 1.0                    AS shots_on_target_pct,
        ((pregoals + ipasses + 2*xa) / NULLIF(matches,0)) * 1.0 AS creation,
        (completedstockes / NULLIF(allstockes,0)) * 1.0        AS dribble_pct,
        ((intercepts + selection) / NULLIF(matches,0)) * 1.0   AS pressing,
        (xa / NULLIF(matches,0)) * 1.0                         AS xa_avg,
        (0.5 * allpasses / NULLIF(xa,0)) * 1.0                 AS pxa,
        (allpasses / NULLIF(matches,0)) * 1.0                  AS passes,
        (completedpasses / NULLIF(allpasses,0)) * 1.0          AS pass_acc,
        ((intercepts + selection + completedtackles + blocks) / NULLIF(matches,0)) * 1.0  AS def_actions,
        ((beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)) * 1.0   AS beaten_rate,
        (duels_air_win / NULLIF(duels_air,0)) * 1.0            AS aerial_pct,
        (crosses / NULLIF(matches,0)) * 1.0                    AS crosses_avg,
        (0.5*(completedpasses/NULLIF(allpasses,0))
        +0.3*(completedstockes/NULLIF(allstockes,0))
        +0.15*(duels_air_win/NULLIF(duels_air,0))
        +0.05*(selection/NULLIF(allselection,0))) * 1.0        AS safety_coef,
        (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
        (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
        ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
      FROM per_user
      WHERE matches >= 1
      LIMIT 20000
    `;

    const cohortRaw: any[] = await prisma.$queryRawUnsafe(COHORT_SQL);

    // выборка только по тем игрокам, у кого есть матчи (на всякий)
    const cohort = cohortRaw.filter(r => toNum(r?.matches, 0) > 0);

    // Подготовим по каждой метрике массив значений коhорта
    const series: Record<string, number[]> = {};
    for (const k of keys) {
      const rawKey = k === "xa" ? "xa_avg" : k === "crosses" ? "crosses_avg" : k;
      series[k] = cohort.map(r => toNum(r?.[rawKey], 0)).filter(v => Number.isFinite(v));
    }

    // Считаем перцентили по выбранным метрикам
    const radar = keys.map((k) => {
      const raw = playerRaw[k] ?? 0;
      const arr = series[k] ?? [];
      const pct = percentileOf(raw, arr, LOWER_IS_BETTER.has(k));
      return { key: k, label: LABELS[k], raw, pct };
    });

    return NextResponse.json({
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed,
      radar,
      debug: wantDebug ? {
        seasonMin: SEASON_MIN,
        officialFilterApplied: true,
        tournaments: tours,
        cohortSize: cohort.length,
        metrics: keys,
      } : undefined,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
