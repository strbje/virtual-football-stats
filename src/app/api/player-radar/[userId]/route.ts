// src/app/api/player-radar/[userId]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// -----------------------------
// УТИЛЫ
// -----------------------------
const toJSON = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (_, val) => (typeof val === "bigint" ? Number(val) : val))
  );

const safeNum = (v: any, d = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : d;

function pctRank(values: number[], x: number): number | null {
  const arr = values.filter((v) => Number.isFinite(v));
  const n = arr.length;
  if (!n) return null;
  let cnt = 0;
  for (const v of arr) if (v <= x) cnt++;
  const pct = Math.round((cnt / n) * 100);
  return Math.max(0, Math.min(100, pct));
}

// -----------------------------
// КЛАСТЕРЫ И РОЛИ
// -----------------------------
const CLUSTERS = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВРТ"],
} as const;
type ClusterKey = keyof typeof CLUSTERS;
type RoleCode = (typeof CLUSTERS)[ClusterKey][number];

const RADAR_BY_CLUSTER: Record<ClusterKey, string[]> = {
  FW: ["goal_contrib", "xg_delta", "shots_on_target_pct", "creation", "dribble_pct", "pressing"],
  AM: ["xa_avg", "pxa", "goal_contrib", "pass_acc", "dribble_pct", "pressing"],
  FM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct", "crosses", "goal_contrib"],
  CM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct"],
  CB: ["safety_coef", "def_actions", "tackle_success", "clearances", "pass_acc", "attack_participation", "aerial_pct", "beaten_rate"],
  GK: ["saves_pct", "saves_avg", "intercepts", "passes", "clean_sheets_pct", "prevented_xg"],
};

function resolveClusterByRole(role: string): ClusterKey | null {
  // TS не вывозит тип элемента из CLUSTERS[k], подскажем явно
  for (const k of Object.keys(CLUSTERS) as ClusterKey[]) {
    const roles = CLUSTERS[k] as readonly string[]; // 
    if (roles.includes(role)) return k;
  }
  return null;
}

const XG_EXPR = "ums.goals_expected";

// -----------------------------
// ФИЛЬТР ОФИЦИАЛЬНЫХ ТУРНИРОВ (>=18 сезона)
// -----------------------------
const OFFICIAL_FILTER = `
  AND REGEXP_LIKE(t.name, '\\\\([0-9]+ сезон\\\\)')
  AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= 18
`;

// -----------------------------
// ТЕКУЩЕЕ АМПЛУА (из твоего эндпоинта /api/player-roles)
// -----------------------------
async function fetchCurrentRole(userId: number): Promise<string | null> {
  try {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3000");
    const r = await fetch(`${base}/api/player-roles?userId=${userId}`, { cache: "no-store" });
    const j = await r.json();
    return j?.currentRoleLast30 ?? null;
  } catch {
    return null;
  }
}

// -----------------------------
// SQL ДЛЯ КЛАСТЕРОВ (кроме GK)
// -----------------------------
function buildCohortSQLCommon(roleCodesSQL: string) {
  return `
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
      INNER JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE sp.short_name IN (${roleCodes})
        ${OFFICIAL_FILTER}
    ),
    per_user AS (
      SELECT
        user_id,
        CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
        SUM(goals) AS goals, SUM(assists) AS assists,
        SUM(goals_expected) AS xg,
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
      HAVING COUNT(*) >= 30
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
      (crosses / NULLIF(matches,0)) * 1.0                    AS crosses,
      (0.5*(completedpasses/NULLIF(allpasses,0))
        +0.3*(completedstockes/NULLIF(allstockes,0))
        +0.15*(duels_air_win/NULLIF(duels_air,0))
        +0.05*(selection/NULLIF(allselection,0))) * 1.0      AS safety_coef,
      (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
      (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
      ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
    FROM per_user
    LIMIT 20000
  `;
}

// -----------------------------
// SQL ДЛЯ GK
// -----------------------------
const COHORT_SQL = `
  WITH base AS (
    SELECT
      ums.user_id,
      ums.match_id,
      ums.team_id,

      /* xG соперника в этом матче: ровно один агрегат → одна колонка */
      COALESCE((
        SELECT SUM(${XG_EXPR})
        FROM tbl_users_match_stats u2
        WHERE u2.match_id = ums.match_id
          AND u2.team_id <> ums.team_id
      ), 0) AS opp_xg,

      /* события вратаря */
      ums.saved,                  -- сейвы
      ums.scored,                 -- пропущенные (голы соперника)
      ums.intercepts,             -- перехваты
      ums.allpasses,              -- пасы (все)
      ums.dry                     -- сухой матч (0/1)
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN tournament t        ON tm.tournament_id = t.id
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    WHERE sp.short_name IN ('ВРТ')
      ${OFFICIAL_FILTER}
  ),
  per_user AS (
    SELECT
      user_id,
      CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
      SUM(opp_xg)   AS opp_xg,
      SUM(scored)   AS conceded,
      SUM(saved)    AS saved,
      SUM(intercepts) AS intercepts,
      SUM(allpasses)  AS allpasses,
      SUM(dry)      AS dry_matches
    FROM base
    GROUP BY user_id
  )
  SELECT
    user_id,
    (matches * 1.0) AS matches,

    /* % сейвов = saved / (saved + conceded) */
    (saved / NULLIF(saved + conceded, 0)) * 1.0 AS save_pct,

    /* кол-во сейвов за матч */
    (saved / NULLIF(matches, 0)) * 1.0          AS saves_avg,

    /* перехваты за матч */
    (intercepts / NULLIF(matches, 0)) * 1.0      AS intercepts,

    /* пасы за матч */
    (allpasses / NULLIF(matches, 0)) * 1.0       AS passes,

    /* % сухих матчей */
    (dry_matches / NULLIF(matches, 0)) * 1.0     AS clean_sheets_pct,

    /* предотвращённый xG за матч (может быть < 0) */
    ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0 AS prevented_xg
  FROM per_user
  WHERE matches >= 30  /* пул для перцентилей: только 30+ матчей */
  LIMIT 20000
`;

// -----------------------------
// ХЭНДЛЕР
// -----------------------------
export async function GET(_: Request, { params }: { params: { userId: string } }) {
  try {
    const userIdNum = Number(params.userId);
    if (!Number.isFinite(userIdNum)) {
      return NextResponse.json({ ok: false, error: "Bad userId" }, { status: 400 });
    }

    // 1) Берём текущее амплуа из готового эндпоинта
    const currentRole = (await fetchCurrentRole(userIdNum)) as RoleCode | null;
    const cluster: ClusterKey | null = currentRole ? resolveClusterByRole(currentRole) : null;

    if (!currentRole || !cluster) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole: currentRole ?? null,
        cluster: cluster ?? null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: "Не удалось определить амплуа для построения радара",
      });
    }

    // 2) Строим SQL под кластер
    const roleCodesSQL =
      "(" + CLUSTERS[cluster].map((c) => `'${c}'`).join(",") + ")";

    // 3) Весь пул кластера (≥30 матчей)
    const cohortRows = toJSON(await prisma.$queryRawUnsafe(COHORT_SQL)) as any[];

    // 4) Находим нашего игрока внутри пула
    const playerAgg = cohortRows.find((r) => Number(r.user_id) === userIdNum) || null;
    const matchesCluster = safeNum(playerAgg?.matches, 0);

    if (!matchesCluster || matchesCluster < 30) {
      // Подчистим список турниров, только «официальные»
      const tournaments = toJSON(await prisma.$queryRawUnsafe(`
        SELECT t.name,
               CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) AS season,
               COUNT(DISTINCT tm.id) AS matches
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t ON tm.tournament_id = t.id
        WHERE ums.user_id = ${userIdNum}
          ${OFFICIAL_FILTER}
        GROUP BY t.name
        ORDER BY season ASC
      `)) as any[];

      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster: 0,
        tournamentsUsed: tournaments.map((t: any) => t.name),
        reason: "Недостаточно матчей в кластере (< 30), радар недоступен",
        debug: {
          seasonMin: 18,
          officialFilterApplied: true,
        },
      });
    }

    // 5) Соберём лучи радара
    const keys = RADAR_BY_CLUSTER[cluster];
    const cohortByKey: Record<string, number[]> = {};
    for (const k of keys) cohortByKey[k] = [];

    for (const row of cohortRows) {
      for (const k of keys) {
        if (row[k] != null) cohortByKey[k].push(Number(row[k]));
      }
    }

    const radar = keys.map((k) => {
      const raw = safeNum(playerAgg?.[k], 0);
      const pct = pctRank(cohortByKey[k] ?? [], raw);
      const label = k
        .replace("goal_contrib", "Гол+пас")
        .replace("xg_delta", "Реализация xG")
        .replace("shots_on_target_pct", "Удары в створ %")
        .replace("creation", "Созидание")
        .replace("dribble_pct", "Дриблинг %")
        .replace("pressing", "Прессинг")
        .replace("xa_avg", "xA")
        .replace("pxa", "pXA (пасы/0.5 xA)")
        .replace("passes", "Пасы")
        .replace("pass_acc", "Точность пасов %")
        .replace("def_actions", "Защитные действия")
        .replace("beaten_rate", "Beaten Rate ↓")
        .replace("aerial_pct", "Верховые %")
        .replace("crosses", "Навесы")
        .replace("safety_coef", "Кэф безопасности")
        .replace("tackle_success", "% удачных отборов")
        .replace("clearances", "Выносы")
        .replace("attack_participation", "Участие в атаке")
        // GK:
        .replace("saves_pct", "% сейвов")
        .replace("saves_avg", "Сейвы/матч")
        .replace("intercepts", "Перехваты/матч")
        .replace("passes", "Пасы/матч")
        .replace("clean_sheets_pct", "% сухих матчей")
        .replace("prevented_xg", "Предотвращённый xG/матч");

      return { key: k, label, raw, pct };
    });

    // 6) Какие турниры реально попали
    const tournamentsUsed = toJSON(await prisma.$queryRawUnsafe(`
      SELECT t.name
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE ums.user_id = ${userIdNum}
        AND fp.code IN ${roleCodesSQL}
        ${OFFICIAL_FILTER}
      GROUP BY t.name
      ORDER BY MIN(tm.timestamp) ASC
    `)).map((x: any) => x.name);

    return NextResponse.json({
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed,
      radar,
      // можно включать для проверки:
      // debug: { sample: playerAgg, keys, cohortSizes: Object.fromEntries(keys.map(k=>[k,cohortByKey[k].length])) }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
