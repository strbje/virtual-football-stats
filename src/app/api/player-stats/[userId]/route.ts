// src/app/api/player-stats/[userId]/route.ts
// Полная статистика игрока по официальным турнирам (с 18 сезона)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SEASON_MIN = 18;

// тот же OFFICIAL_FILTER, что и в радаре
const OFFICIAL_FILTER = `
  t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
  AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}
`;

// утилита для BigInt -> number
function toJSON<T = any>(x: unknown): T {
  return JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}

type Totals = {
  matches: number;

  // атака
  goals: number;
  assists: number;
  goal_contrib: number;
  xg: number;
  xg_delta: number;
  shots: number;
  shots_on_target_pct: number | null;
  shots_per_goal: number | null;

  // созидание / пасы
  passes_xa: number;
  key_passes: number;
  pre_assists: number;
  allpasses: number;
  completedpasses: number;
  pass_acc: number | null;
  pxa: number | null;

  // дриблинг
  allstockes: number;
  completedstockes: number;
  dribble_pct: number | null;

  // оборона
  intercepts: number;
  selection: number;
  completedtackles: number;
  blocks: number;
  allselection: number;
  def_actions: number;
  beaten_rate: number | null;

  // дуэли / выносы
  outs: number;
  duels_air: number;
  duels_air_win: number;
  aerial_pct: number | null;
  duels_off_win: number;
  duels_off_lose: number;
  off_duels_total: number;
  off_duels_win_pct: number | null;

  // навесы
  crosses: number;
  allcrosses: number;
  cross_acc: number | null;
};

const EMPTY_TOTALS: Totals = {
  matches: 0,

  goals: 0,
  assists: 0,
  goal_contrib: 0,
  xg: 0,
  xg_delta: 0,
  shots: 0,
  shots_on_target_pct: null,
  shots_per_goal: null,

  passes_xa: 0,
  key_passes: 0,
  pre_assists: 0,
  allpasses: 0,
  completedpasses: 0,
  pass_acc: null,
  pxa: null,

  allstockes: 0,
  completedstockes: 0,
  dribble_pct: null,

  intercepts: 0,
  selection: 0,
  completedtackles: 0,
  blocks: 0,
  allselection: 0,
  def_actions: 0,
  beaten_rate: null,

  outs: 0,
  duels_air: 0,
  duels_air_win: 0,
  aerial_pct: null,
  duels_off_win: 0,
  duels_off_lose: 0,
  off_duels_total: 0,
  off_duels_win_pct: null,

  crosses: 0,
  allcrosses: 0,
  cross_acc: null,
};

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const userId = Number(params.userId);
  if (!userId || Number.isNaN(userId)) {
    return NextResponse.json(
      { ok: false, error: "Bad userId" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const scopeParam = url.searchParams.get("scope");
  const scope: "recent" | "all" = scopeParam === "all" ? "all" : "recent";
    const seasonFilter =
    scope === "all"
      ? `t.name REGEXP '\\\\([0-9]+ сезон\\\\)'` // любой сезон
      : OFFICIAL_FILTER;


  try {
    const sql = `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,

          ums.goals,
          ums.assists,
          ums.goals_expected        AS xg,
          ums.kicked,
          ums.kickedin,
          ums.kickedout,

          ums.passes                AS passes_xa,
          ums.allpasses,
          ums.completedpasses,
          ums.ipasses,
          ums.pregoal_passes,

          ums.allstockes,
          ums.completedstockes,

          ums.intercepts,
          ums.selection,
          ums.completedtackles,
          ums.blocks,
          ums.allselection,

          ums.outs,
          ums.outplayed,
          ums.penalised_fails,

          ums.duels_air,
          ums.duels_air_win,
          ums.duels_off_win,
          ums.duels_off_lose,

          ums.crosses,
          ums.allcrosses

        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON tm.id = ums.match_id
        JOIN tournament t        ON t.id  = tm.tournament_id
        WHERE ums.user_id = ${userId}
          AND (${seasonFilter})
      ),
      per_user AS (
        SELECT
          user_id,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,

          SUM(goals)          AS goals,
          SUM(assists)        AS assists,
          SUM(xg)             AS xg,

          SUM(kickedin)       AS kickedin,
          SUM(kickedout)      AS kickedout,

          SUM(passes_xa)      AS passes_xa,
          SUM(allpasses)      AS allpasses,
          SUM(completedpasses) AS completedpasses,
          SUM(ipasses)        AS ipasses,
          SUM(pregoal_passes) AS pregoal_passes,

          SUM(allstockes)     AS allstockes,
          SUM(completedstockes) AS completedstockes,

          SUM(intercepts)     AS intercepts,
          SUM(selection)      AS selection,
          SUM(completedtackles) AS completedtackles,
          SUM(blocks)         AS blocks,
          SUM(allselection)   AS allselection,

          SUM(outs)           AS outs,
          SUM(outplayed)      AS outplayed,
          SUM(penalised_fails) AS penalised_fails,

          SUM(duels_air)      AS duels_air,
          SUM(duels_air_win)  AS duels_air_win,
          SUM(duels_off_win)  AS duels_off_win,
          SUM(duels_off_lose) AS duels_off_lose,

          SUM(crosses)        AS crosses,
          SUM(allcrosses)     AS allcrosses
        FROM base
        GROUP BY user_id
      )
      SELECT
        user_id,
        matches,

        goals,
        assists,
        (goals + assists) AS goal_contrib,
        xg,
        (goals - xg)      AS xg_delta,

        (kickedin + kickedout) AS shots,
        CASE
          WHEN (kickedin + kickedout) > 0
            THEN kickedin * 1.0 / (kickedin + kickedout)
          ELSE NULL
        END AS shots_on_target_pct,
        CASE
          WHEN goals > 0
            THEN (kickedin + kickedout) * 1.0 / goals
          ELSE NULL
        END AS shots_per_goal,

        passes_xa,
        ipasses        AS key_passes,
        pregoal_passes AS pre_assists,
        allpasses,
        completedpasses,
        CASE
          WHEN allpasses > 0
            THEN completedpasses * 1.0 / allpasses
          ELSE NULL
        END AS pass_acc,
        CASE
          WHEN passes_xa > 0
            THEN 0.5 * allpasses * 1.0 / passes_xa
          ELSE NULL
        END AS pxa,

        allstockes,
        completedstockes,
        CASE
          WHEN allstockes > 0
            THEN completedstockes * 1.0 / allstockes
          ELSE NULL
        END AS dribble_pct,

        intercepts,
        selection,
        completedtackles,
        blocks,
        allselection,
        (intercepts + selection + completedtackles + blocks) AS def_actions,
        CASE
          WHEN (intercepts + selection + completedtackles + blocks) > 0
            THEN (outplayed + penalised_fails) * 1.0 /
                 (intercepts + selection + completedtackles + blocks)
          ELSE NULL
        END AS beaten_rate,

        outs,
        duels_air,
        duels_air_win,
        CASE
          WHEN duels_air > 0
            THEN duels_air_win * 1.0 / duels_air
          ELSE NULL
        END AS aerial_pct,

        duels_off_win,
        duels_off_lose,
        (duels_off_win + duels_off_lose) AS off_duels_total,
        CASE
          WHEN (duels_off_win + duels_off_lose) > 0
            THEN duels_off_win * 1.0 / (duels_off_win + duels_off_lose)
          ELSE NULL
        END AS off_duels_win_pct,

        crosses,
        allcrosses,
        CASE
          WHEN allcrosses > 0
            THEN crosses * 1.0 / allcrosses
          ELSE NULL
        END AS cross_acc
      FROM per_user
      LIMIT 1
    `;

    const rowsRaw = await prisma.$queryRawUnsafe<any[]>(sql);
    const [row] = toJSON<any[]>(rowsRaw);

    if (!row) {
      return NextResponse.json({
        ok: true,
        userId,
        matches: 0,
        totals: EMPTY_TOTALS,
        perMatch: EMPTY_TOTALS, // всё нули
      });
    }

    const totals: Totals = {
      matches: row.matches ?? 0,

      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      goal_contrib: row.goal_contrib ?? 0,
      xg: row.xg ?? 0,
      xg_delta: row.xg_delta ?? 0,
      shots: row.shots ?? 0,
      shots_on_target_pct: row.shots_on_target_pct,
      shots_per_goal: row.shots_per_goal,

      passes_xa: row.passes_xa ?? 0,
      key_passes: row.key_passes ?? 0,
      pre_assists: row.pre_assists ?? 0,
      allpasses: row.allpasses ?? 0,
      completedpasses: row.completedpasses ?? 0,
      pass_acc: row.pass_acc,
      pxa: row.pxa,

      allstockes: row.allstockes ?? 0,
      completedstockes: row.completedstockes ?? 0,
      dribble_pct: row.dribble_pct,

      intercepts: row.intercepts ?? 0,
      selection: row.selection ?? 0,
      completedtackles: row.completedtackles ?? 0,
      blocks: row.blocks ?? 0,
      allselection: row.allselection ?? 0,
      def_actions: row.def_actions ?? 0,
      beaten_rate: row.beaten_rate,

      outs: row.outs ?? 0,
      duels_air: row.duels_air ?? 0,
      duels_air_win: row.duels_air_win ?? 0,
      aerial_pct: row.aerial_pct,

      duels_off_win: row.duels_off_win ?? 0,
      duels_off_lose: row.duels_off_lose ?? 0,
      off_duels_total: row.off_duels_total ?? 0,
      off_duels_win_pct: row.off_duels_win_pct,

      crosses: row.crosses ?? 0,
      allcrosses: row.allcrosses ?? 0,
      cross_acc: row.cross_acc,
    };

    const matches = totals.matches || 0;

    const perMatch: any = { ...totals };
    const div = (v: any) =>
      matches > 0 && v !== null && v !== undefined ? Number(v) / matches : null;

    perMatch.goals = div(totals.goals);
    perMatch.assists = div(totals.assists);
    perMatch.goal_contrib = div(totals.goal_contrib);
    perMatch.xg = div(totals.xg);
    perMatch.shots = div(totals.shots);
    perMatch.passes_xa = div(totals.passes_xa);
    perMatch.key_passes = div(totals.key_passes);
    perMatch.pre_assists = div(totals.pre_assists);
    perMatch.allpasses = div(totals.allpasses);
    perMatch.completedpasses = div(totals.completedpasses);
    perMatch.allstockes = div(totals.allstockes);
    perMatch.completedstockes = div(totals.completedstockes);
    perMatch.intercepts = div(totals.intercepts);
    perMatch.selection = div(totals.selection);
    perMatch.completedtackles = div(totals.completedtackles);
    perMatch.blocks = div(totals.blocks);
    perMatch.allselection = div(totals.allselection);
    perMatch.def_actions = div(totals.def_actions);
    perMatch.outs = div(totals.outs);
    perMatch.duels_air = div(totals.duels_air);
    perMatch.duels_air_win = div(totals.duels_air_win);
    perMatch.duels_off_win = div(totals.duels_off_win);
    perMatch.duels_off_lose = div(totals.duels_off_lose);
    perMatch.off_duels_total = div(totals.off_duels_total);
    perMatch.crosses = div(totals.crosses);
    perMatch.allcrosses = div(totals.allcrosses);

    // проценты и отношения (shots_on_target_pct, pass_acc, beaten_rate и т.п.) не трогаем

    return NextResponse.json({
      ok: true,
      userId,
      matches,
      totals,
      perMatch,
      scope,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
