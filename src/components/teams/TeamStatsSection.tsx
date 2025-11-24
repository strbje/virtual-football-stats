// src/components/teams/TeamStatsSection.tsx
export type TeamTotals = {
  matches: number;

  goals: number;
  assists: number;
  goal_contrib: number;
  xg: number;
  xg_delta: number;
  shots: number;
  shots_on_target_pct: number | null;
  shots_per_goal: number | null;

  passes_xa: number;
  key_passes: number;
  pre_assists: number;
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
};
