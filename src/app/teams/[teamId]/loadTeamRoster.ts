// src/app/teams/[teamId]/loadTeamRoster.ts

import { prisma } from "@/lib/prisma";

export interface TeamRosterRow {
  user_id: number;
  team_id: number;
  gamertag: string | null;
  username: string | null;

  matches: number;

  goals: number;
  assists: number;
  goal_contrib: number;
  xg: number;
  xg_delta: number | null;

  shots: number;
  shots_on_target_pct: number | null;
  shots_per_goal: number | null;

  passes_xa: number;
  ipasses: number;
  pregoal_passes: number;
  allpasses: number;
  completedpasses: number;
  pass_acc: number | null;
  pxa: number | null;

  allstockes: number;
  completedstockes: number;
  dribble_pct: number | null;

  intercepts: number;
  selection: number;
  completedtackles: number;
  blocks: number;
  allselection: number;
  def_actions: number;
  beaten_rate: number | null;

  outs: number;

  duels_air: number;
  duels_air_win: number;
  aerial_pct: number | null;

  duels_off_win: number;
  duels_off_lose: number;
  off_duels_total: number;
  off_duels_win_pct: number | null;

  crosses: number;
  allcrosses: number;
  cross_acc: number | null;
}

// seasons:
// - [] / undefined → используем максимальный сезон этой команды
// - [23] → только 23 сезон
// - [22, 23] → оба
export async function loadTeamRoster(
  teamId: number,
  seasons?: number[],
): Promise<TeamRosterRow[]> {
  if (!teamId) {
    return [];
  }

  const normalizedSeasons =
    seasons?.map((s) => Number(s)).filter((s) => Number.isFinite(s)) ?? [];

  let seasonFilter: string;

  if (normalizedSeasons.length > 0) {
    const seasonList = normalizedSeasons.join(", ");
    seasonFilter = `
      t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
      AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) IN (${seasonList})
    `;
  } else {
    // дефолт: последний сезон этой команды
    seasonFilter = `
      t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
      AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) = (
        SELECT MAX(CAST(REGEXP_SUBSTR(t2.name, '[0-9]+') AS UNSIGNED))
        FROM tournament t2
        JOIN tournament_match tm2 ON tm2.tournament_id = t2.id
        JOIN tbl_users_match_stats ums2 ON ums2.match_id = tm2.id
        WHERE ums2.team_id = ${teamId}
          AND t2.name REGEXP '\\\\([0-9]+ сезон\\\\)'
      )
    `;
  }

  const sql = `
    WITH base AS (
      SELECT
        ums.team_id,
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
      WHERE ums.team_id = ${teamId}
        AND (${seasonFilter})
    ),
    per_player AS (
      SELECT
        user_id,
        team_id,
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
      GROUP BY user_id, team_id
    )
    SELECT
      p.user_id,
      p.team_id,
      u.gamertag,
      u.username,

      p.matches,

      p.goals,
      p.assists,
      (p.goals + p.assists) AS goal_contrib,
      p.xg,
      (p.goals - p.xg)      AS xg_delta,

      (p.kickedin + p.kickedout) AS shots,
      CASE
        WHEN (p.kickedin + p.kickedout) > 0
          THEN p.kickedin * 1.0 / (p.kickedin + p.kickedout)
        ELSE NULL
      END AS shots_on_target_pct,
      CASE
        WHEN p.goals > 0
          THEN (p.kickedin + p.kickedout) * 1.0 / p.goals
        ELSE NULL
      END AS shots_per_goal,

      p.passes_xa,
      p.ipasses        AS ipasses,
      p.pregoal_passes AS pregoal_passes,
      p.allpasses,
      p.completedpasses,
      CASE
        WHEN p.allpasses > 0
          THEN p.completedpasses * 1.0 / p.allpasses
        ELSE NULL
      END AS pass_acc,
      CASE
        WHEN p.passes_xa > 0
          THEN 0.5 * p.allpasses * 1.0 / p.passes_xa
        ELSE NULL
      END AS pxa,

      p.allstockes,
      p.completedstockes,
      CASE
        WHEN p.allstockes > 0
          THEN p.completedstockes * 1.0 / p.allstockes
        ELSE NULL
      END AS dribble_pct,

      p.intercepts,
      p.selection,
      p.completedtackles,
      p.blocks,
      p.allselection,
      (p.intercepts + p.selection + p.completedtackles + p.blocks) AS def_actions,
      CASE
        WHEN (p.intercepts + p.selection + p.completedtackles + p.blocks) > 0
          THEN (p.outplayed + p.penalised_fails) * 1.0 /
               (p.intercepts + p.selection + p.completedtackles + p.blocks)
        ELSE NULL
      END AS beaten_rate,

      p.outs,

      p.duels_air,
      p.duels_air_win,
      CASE
        WHEN p.duels_air > 0
          THEN p.duels_air_win * 1.0 / p.duels_air
        ELSE NULL
      END AS aerial_pct,

      p.duels_off_win,
      p.duels_off_lose,
      (p.duels_off_win + p.duels_off_lose) AS off_duels_total,
      CASE
        WHEN (p.duels_off_win + p.duels_off_lose) > 0
          THEN p.duels_off_win * 1.0 / (p.duels_off_win + p.duels_off_lose)
        ELSE NULL
      END AS off_duels_win_pct,

      p.crosses,
      p.allcrosses,
      CASE
        WHEN p.allcrosses > 0
          THEN p.crosses * 1.0 / p.allcrosses
        ELSE NULL
      END AS cross_acc
    FROM per_player p
    LEFT JOIN tbl_users u ON u.id = p.user_id
    ORDER BY p.matches DESC, p.goals DESC, p.assists DESC
  `;

  const rows = await prisma.$queryRawUnsafe<TeamRosterRow[]>(sql);
  return rows;
}
