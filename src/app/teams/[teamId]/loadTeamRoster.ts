// src/app/teams/[teamId]/loadTeamRoster.ts

import { prisma } from "@/lib/prisma";

export type TournamentOption = {
  id: number;
  name: string;
  leagueLabel: string;      // ПЛ / ФНЛ / ПФЛ / ЛФЛ / Прочие / Кубок
  seasonNumber: number | null;
  isCup: boolean;
};

export type TeamRosterRow = {
  user_id: number;
  username: string | null;
  gamertag: string | null;

  matches: number;
  goals: number;
  assists: number;
  goal_contrib: number;

  xg: number;
  shots: number;
  shots_on_target_pct: number | null;

  pass_acc: number | null;
  passes_xa: number;

  def_actions: number;
  beaten_rate: number | null;

  aerial_pct: number | null;

  crosses: number;        // удачные
  allcrosses: number;     // все
  cross_acc: number | null; // 0–1
};

export type TeamRosterResult = {
  tournaments: TournamentOption[];
  selectedTournamentIds: number[];
  players: TeamRosterRow[];
};

// разбор лиги по названию турнира
function mapTournamentToLeagueLabel(name: string | null | undefined): string {
  const n = (name ?? "").toUpperCase();

  if (n.includes("КУБОК")) return "Кубок";
  if (n.includes("ПРЕМЬЕР") || n.includes(" ПЛ")) return "ПЛ";
  if (n.includes("ФНЛ")) return "ФНЛ";
  if (n.includes("ПФЛ")) return "ПФЛ";
  if (n.includes("ЛФЛ")) return "ЛФЛ";

  return "Прочие";
}

// вытащить номер сезона из названия "… (24 сезон)" → 24
function extractSeasonNumber(name: string | null | undefined): number | null {
  if (!name) return null;
  const m = name.match(/(\d+)\s*сезон/i);
  if (!m) return null;
  const num = Number(m[1]);
  return Number.isFinite(num) ? num : null;
}

export async function loadTeamRoster(
  teamId: number,
  tournamentIds?: number[] | null,
): Promise<TeamRosterResult> {
  // 1) все турниры, где команда вообще играла
  const tournamentsRaw = await prisma.$queryRawUnsafe<
    { id: number; name: string | null }[]
  >(
    `
    SELECT DISTINCT
      tr.id,
      tr.name
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament tr       ON tr.id = tm.tournament_id
    WHERE ums.team_id = ?
    `,
    teamId,
  );

  const tournaments: TournamentOption[] = tournamentsRaw.map((t) => {
    const leagueLabel = mapTournamentToLeagueLabel(t.name);
    const seasonNumber = extractSeasonNumber(t.name);
    const isCup = leagueLabel === "Кубок";

    return {
      id: Number(t.id),
      name: t.name ?? `Турнир #${t.id}`,
      leagueLabel,
      seasonNumber,
      isCup,
    };
  });

  // сортируем: сначала по сезону (новые -> старые), затем по типу лиги/кубка
  const leagueOrder = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие", "Кубок"];
  tournaments.sort((a, b) => {
    const sa = a.seasonNumber ?? -9999;
    const sb = b.seasonNumber ?? -9999;
    if (sa !== sb) return sb - sa; // по убыванию сезона

    const ia = leagueOrder.indexOf(a.leagueLabel);
    const ib = leagueOrder.indexOf(b.leagueLabel);
    if (ia !== ib) return ia - ib;

    return a.name.localeCompare(b.name);
  });

  if (tournaments.length === 0) {
    return { tournaments: [], selectedTournamentIds: [], players: [] };
  }

  // 2) определить, какие турниры выбраны
  let selectedIds: number[];

  if (tournamentIds && tournamentIds.length > 0) {
    const existing = new Set(tournaments.map((t) => t.id));
    selectedIds = tournamentIds.filter((id) => existing.has(id));
    if (selectedIds.length === 0) {
      // все переданные id не найдены – откатываемся к дефолту
      selectedIds = [];
    }
  } else {
    selectedIds = [];
  }

  // дефолт: если явно ничего не выбрано — берём все турниры последнего сезона
  if (selectedIds.length === 0) {
    const maxSeason = tournaments.reduce<number | null>((acc, t) => {
      if (t.seasonNumber == null) return acc;
      if (acc == null || t.seasonNumber > acc) return t.seasonNumber;
      return acc;
    }, null);

    if (maxSeason != null) {
      selectedIds = tournaments
        .filter((t) => t.seasonNumber === maxSeason)
        .map((t) => t.id);
    } else {
      // если вообще нет сезонов в названии — берём последний по id
      selectedIds = [tournaments[0].id];
    }
  }

  // 3) агрегат по игрокам для выбранного набора турниров
  type DbRow = {
    user_id: number;
    username: string | null;
    gamertag: string | null;

    matches: number;
    goals: number;
    assists: number;
    xg: number;

    shots: number;
    shots_on_target: number;

    allpasses: number;
    completedpasses: number;
    passes_xa: number;

    intercepts: number;
    selection: number;
    completedtackles: number;
    blocks: number;
    outs: number;
    outplayed: number;
    penalised_fails: number;

    duels_air: number;
    duels_air_win: number;

    crosses: number;
    allcrosses: number;
  };

  const placeholders = selectedIds.map(() => "?").join(", ");

  const sql = `
    WITH base AS (
      SELECT
        ums.user_id,
        u.username,
        u.gamertag,

        ums.match_id,

        ums.goals,
        ums.assists,
        ums.goals_expected               AS xg,

        (ums.kickedin + ums.kickedout)   AS shots,
        ums.kickedin                     AS shots_on_target,

        ums.allpasses,
        ums.completedpasses,
        ums.passes                       AS passes_xa,

        ums.intercepts,
        ums.selection,
        ums.completedtackles,
        ums.blocks,
        ums.outs,
        ums.outplayed,
        ums.penalised_fails,

        ums.duels_air,
        ums.duels_air_win,

        ums.crosses,
        ums.allcrosses
      FROM tbl_users_match_stats ums
      JOIN users u          ON u.id  = ums.user_id
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.team_id = ?
        AND tm.tournament_id IN (${placeholders})
    )
    SELECT
      user_id,
      username,
      gamertag,

      COUNT(DISTINCT match_id)         AS matches,
      SUM(goals)                       AS goals,
      SUM(assists)                     AS assists,
      SUM(xg)                          AS xg,

      SUM(shots)                       AS shots,
      SUM(shots_on_target)             AS shots_on_target,

      SUM(allpasses)                   AS allpasses,
      SUM(completedpasses)             AS completedpasses,
      SUM(passes_xa)                   AS passes_xa,

      SUM(intercepts)                  AS intercepts,
      SUM(selection)                   AS selection,
      SUM(completedtackles)            AS completedtackles,
      SUM(blocks)                      AS blocks,
      SUM(outs)                        AS outs,
      SUM(outplayed)                   AS outplayed,
      SUM(penalised_fails)             AS penalised_fails,

      SUM(duels_air)                   AS duels_air,
      SUM(duels_air_win)               AS duels_air_win,

      SUM(crosses)                     AS crosses,
      SUM(allcrosses)                  AS allcrosses
    FROM base
    GROUP BY user_id, username, gamertag
    HAVING COUNT(DISTINCT match_id) > 0
    ORDER BY matches DESC, goals DESC, assists DESC, user_id ASC
  `;

  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    sql,
    teamId,
    ...selectedIds,
  );

  const players: TeamRosterRow[] = rows.map((r) => {
    const goals = Number(r.goals || 0);
    const assists = Number(r.assists || 0);
    const goal_contrib = goals + assists;

    const shots = Number(r.shots || 0);
    const shotsOnTarget = Number(r.shots_on_target || 0);
    const shots_on_target_pct =
      shots > 0 ? shotsOnTarget / shots : null;

    const allpasses = Number(r.allpasses || 0);
    const completedpasses = Number(r.completedpasses || 0);
    const pass_acc =
      allpasses > 0 ? completedpasses / allpasses : null;

    const intercepts = Number(r.intercepts || 0);
    const selection = Number(r.selection || 0);
    const completedtackles = Number(r.completedtackles || 0);
    const blocks = Number(r.blocks || 0);
    const def_actions = intercepts + selection + completedtackles + blocks;

    const outs = Number(r.outs || 0);
    const outplayed = Number(r.outplayed || 0);
    const penalised_fails = Number(r.penalised_fails || 0);
    const beaten_rate =
      def_actions > 0
        ? (outplayed + penalised_fails) / def_actions
        : null;

    const duels_air = Number(r.duels_air || 0);
    const duels_air_win = Number(r.duels_air_win || 0);
    const aerial_pct =
      duels_air > 0 ? duels_air_win / duels_air : null;

    const crosses = Number(r.crosses || 0);
    const allcrosses = Number(r.allcrosses || 0);
    const cross_acc =
      allcrosses > 0 ? crosses / allcrosses : null;

    return {
      user_id: Number(r.user_id),
      username: r.username ?? null,
      gamertag: r.gamertag ?? null,

      matches: Number(r.matches || 0),
      goals,
      assists,
      goal_contrib,

      xg: Number(r.xg || 0),
      shots,
      shots_on_target_pct,

      pass_acc,
      passes_xa: Number(r.passes_xa || 0),

      def_actions,
      beaten_rate,

      aerial_pct,

      crosses,
      allcrosses,
      cross_acc,
    };
  });

  return {
    tournaments,
    selectedTournamentIds: selectedIds,
    players,
  };
}
