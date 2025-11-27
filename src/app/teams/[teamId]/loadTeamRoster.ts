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
// - [] или undefined → использовать только последний сезон команды
// - [23] → только 23 сезон
// - [22, 23] → оба сезона
export async function loadTeamRoster(
  teamId: number,
  seasons?: number[],
): Promise<TeamRosterRow[]> {
  let seasonFilter: string;

  if (seasons && seasons.length > 0) {
    const seasonList = seasons.map((s) => Number(s)).join(", ");
    seasonFilter = `
      t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
      AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) IN (${seasonList})
    `;
  } else {
    // дефолт: последний сезон для этой команды
    seasonFilter = `
      t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
      AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) = (
        SELECT MAX(CAST(REGEXP_SUBSTR(t2.name, '[0-9]+') AS UNSIGNED))
        FROM tournament t2
        JOIN tournament_match tm2 ON tm2.tournament_id = t2.id
        JOIN tbl_users_match_stats ums2 ON ums2.match_id = tm2.id
        WHERE ums2.team_id = ${teamId}
          AND t2.name REGEXP '\\\\([0-9]+ 시즌\\\\)'
      )
    `;
    /* ВНИМАНИЕ:
       В строке выше '"\\\\([0-9]+ 시즌\\\\)"' — опечатка, если у тебя везде "сезон".
       Если в БД "сезон" по-русски, нужно оставить "сезон":

       AND t2.name REGEXP '\\\\([0-9]+ сезон\\\\)'
    */
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
      SE
