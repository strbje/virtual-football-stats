import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB";

// Кластеры — ПО РАСШИРЕННЫМ АМПЛУА (fp.code)
const CLUSTERS: Record<ClusterKey, readonly string[]> = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЦП", "ЛЦП", "ПЦП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
} as const;

const RADAR_BY_CLUSTER = {
  FW: ["goal_contrib", "xg_delta", "shots_on_target_pct", "creation", "dribble_pct", "pressing"],
  AM: ["xa", "pxa", "goal_contrib", "pass_acc", "dribble_pct", "pressing"],
  CM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct"],
  FM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct", "crosses", "goal_contrib"],
  CB: ["safety_coef", "def_actions", "tackle_success", "clearances", "pass_acc", "attack_participation", "aerial_pct", "beaten_rate"],
} as const;

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
const XG_EXPR = "ums.goals_expected"; // ты подтвердил правильное имя поля

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

    // 2) фильтр по кластеру — ВАЖНО: по fp.code (расширенные амплуа)
    const roleCodes = CLUSTERS[cluster].map((c) => `'${c}'`).join(",");

    // 3) только официальные турниры (сезон из имени турнира)
    const OFFICIAL_FILTER = `AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}`;

    // 4) основной аггрегирующий запрос
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
          COUNT(DISTINCT match_id) AS matches,
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
        matches,

        (goals + assists) / NULLIF(matches,0)                        AS goal_contrib,
        (goals - xg) / NULLIF(matches,0)                             AS xg_delta,
        kickedin / NULLIF(kicked,0)                                  AS shots_on_target_pct,
        (pregoals + ipasses + 2*xa) / NULLIF(matches,0)              AS creation,
        completedstockes / NULLIF(allstockes,0)                      AS dribble_pct,
        (intercepts + selection) / NULLIF(matches,0)                 AS pressing,

        xa / NULLIF(matches,0)                                       AS xa_avg,
        0.5 * allpasses / NULLIF(xa,0)                               AS pxa,

        allpasses / NULLIF(matches,0)                                AS passes,
        completedpasses / NULLIF(allpasses,0)                        AS pass_acc,

        (intercepts + selection + completedtackles + blocks) / NULLIF(matches,0) AS def_actions,
        (beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)  AS beaten_rate,
        duels_air_win / NULLIF(duels_air,0)                          AS aerial_pct,

        crosses / NULLIF(matches,0)                                  AS crosses_avg,

        0.5*(completedpasses/NULLIF(allpasses,0))
        +0.3*(completedstockes/NULLIF(allstockes,0))
        +0.15*(duels_air_win/NULLIF(duels_air,0))
        +0.05*(selection/NULLIF(allselection,0))                     AS safety_coef,

        selection / NULLIF(allselection,0)                           AS tackle_success,
        outs / NULLIF(matches,0)                                     AS clearances,
        (ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0) AS attack_participation
      FROM agg
    `;

    const agg: any[] = await prisma.$queryRawUnsafe(AGG_SQL);
    const A = agg[0] ?? {};
    const matchesCluster = Number(A?.matches ?? 0);

    // 5) список турниров (для дебага/отображения)
    const TOURS_SQL = `
      SELECT
        t.name AS name,
        CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) AS season,
        COUNT(DISTINCT ums.match_id) AS matches
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
    const tours: Array<{ name: string; season: number | null; matches: number }> = await prisma.$queryRawUnsafe(TOURS_SQL);
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

    const keys = RADAR_BY_CLUSTER[cluster];
    const radar = keys.map((k) => {
      const rawKey = k === "xa" ? "xa_avg" : k === "crosses" ? "crosses_avg" : k;
      const raw = Number(A?.[rawKey] ?? 0);
      return { key: k, label: LABELS[k], raw, pct: null };
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
      } : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
