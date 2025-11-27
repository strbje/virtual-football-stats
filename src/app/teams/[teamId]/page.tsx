// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TeamRosterTournamentSelector from "@/components/teams/TeamRosterTournamentSelector";
import OpponentsHistoryClient from "@/components/teams/OpponentsHistoryClient";
import TeamRadarClient from "@/components/teams/TeamRadarClient";
import TeamStatsSection, {
  TeamTotals,
} from "@/components/teams/TeamStatsSection";
import {
  loadTeamRoster,
  type TeamRosterRow,
  type TournamentOption,
} from "./loadTeamRoster";

export const dynamic = "force-dynamic";

type Params = { teamId: string };

function mapTournamentToLeagueLabel(name: string | null | undefined): string {
  const n = (name ?? "").toUpperCase();

  if (n.includes("ПРЕМЬЕР") || n.includes(" ПЛ")) return "ПЛ";
  if (n.includes("ФНЛ")) return "ФНЛ";
  if (n.includes("ПФЛ")) return "ПФЛ";
  if (n.includes("ЛФЛ")) return "ЛФЛ";

  return "Прочие";
}

// аккуратный формат чисел
function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(digits).replace(/\.?0+$/, "");
}

// универсальный ранкер по одной метрике
function getRank(
  rows: any[],
  teamId: number,
  key: string,
  high: boolean = true,
): { rank: number; total: number } | null {
  const vals = rows.filter((r) => r[key] != null);
  if (!vals.length) return null;

  vals.sort((a, b) => {
    const av = Number(a[key]);
    const bv = Number(b[key]);
    return high ? bv - av : av - bv;
  });

  const idx = vals.findIndex((r) => Number(r.team_id) === teamId);
  if (idx < 0) return null;

  return { rank: idx + 1, total: vals.length };
}

// цвет бейджа по рангу
function rankColor(rank: number, total: number): string {
  if (total <= 1) {
    return "bg-emerald-100 text-emerald-700";
  }
  const t = (rank - 1) / (total - 1); // 0 → лучший, 1 → худший
  if (t <= 0.25) return "bg-emerald-100 text-emerald-700";
  if (t <= 0.5) return "bg-lime-100 text-lime-700";
  if (t <= 0.75) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const idNum = Number(params.teamId);
  const fallbackTitle = `Команда #${params.teamId} — Virtual Football Stats`;

  if (!idNum || Number.isNaN(idNum)) {
    return { title: fallbackTitle };
  }

  try {
    const rows = await prisma.$queryRawUnsafe<{ team_name: string }[]>(
      `
        SELECT team_name
        FROM teams
        WHERE id = ?
        LIMIT 1
      `,
      idNum,
    );

    const name = rows[0]?.team_name;
    if (!name) return { title: fallbackTitle };

    return { title: `${name} — Virtual Football Stats` };
  } catch {
    return { title: fallbackTitle };
  }
}

type OpponentMatchClient = {
  opponentId: number;
  opponentName: string;
  res: "W" | "D" | "L" | "-";
  scored: number;
  missed: number;
  date: string;
  tournament: string;
};

// === загрузка агрегированной статистики команды (как /api/player-stats, но по team_id) ===

const SEASON_MIN = 18;

async function loadTeamStats(
  teamId: number,
  scope: "recent" | "all",
): Promise<{ matches: number; totals: TeamTotals } | null> {
  const seasonFilter =
    scope === "all"
      ? `t.name REGEXP '\\\\([0-9]+ сезон\\\\)'`
      : `
  t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
  AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}
`;

  const sql = `
    WITH base AS (
      SELECT
        ums.team_id,
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
    per_team AS (
      SELECT
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
      GROUP BY team_id
    )
    SELECT
      team_id,
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
    FROM per_team
    LIMIT 1
  `;

  const rows = (await prisma.$queryRawUnsafe<any[]>(sql)) ?? [];
  const row = rows[0];
  if (!row) return null;

  const num = (v: any) => (v == null ? 0 : Number(v));

  const totals: TeamTotals = {
    matches: num(row.matches),

    goals: num(row.goals),
    assists: num(row.assists),
    goal_contrib: num(row.goal_contrib),
    xg: num(row.xg),
    xg_delta: num(row.xg_delta),
    shots: num(row.shots),
    shots_on_target_pct:
      row.shots_on_target_pct == null ? null : Number(row.shots_on_target_pct),
    shots_per_goal:
      row.shots_per_goal == null ? null : Number(row.shots_per_goal),

    passes_xa: num(row.passes_xa),
    key_passes: num(row.key_passes),
    pre_assists: num(row.pre_assists),
    allpasses: num(row.allpasses),
    completedpasses: num(row.completedpasses),
    pass_acc: row.pass_acc == null ? null : Number(row.pass_acc),
    pxa: row.pxa == null ? null : Number(row.pxa),

    allstockes: num(row.allstockes),
    completedstockes: num(row.completedstockes),
    dribble_pct: row.dribble_pct == null ? null : Number(row.dribble_pct),

    intercepts: num(row.intercepts),
    selection: num(row.selection),
    completedtackles: num(row.completedtackles),
    blocks: num(row.blocks),
    allselection: num(row.allselection),
    def_actions: num(row.def_actions),
    beaten_rate: row.beaten_rate == null ? null : Number(row.beaten_rate),

    outs: num(row.outs),
    duels_air: num(row.duels_air),
    duels_air_win: num(row.duels_air_win),
    aerial_pct: row.aerial_pct == null ? null : Number(row.aerial_pct),

    duels_off_win: num(row.duels_off_win),
    duels_off_lose: num(row.duels_off_lose),
    off_duels_total: num(row.off_duels_total),
    off_duels_win_pct:
      row.off_duels_win_pct == null ? null : Number(row.off_duels_win_pct),

    crosses: num(row.crosses),
    allcrosses: num(row.allcrosses),
    cross_acc: row.cross_acc == null ? null : Number(row.cross_acc),
  };

  return {
    matches: totals.matches,
    totals,
  };
}

// === сама страница команды ===

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: { tab?: string; scope?: string; seasons?: string };
}) {
  const teamIdNum = Number(params.teamId);
  const rawTab = searchParams?.tab;
  const tab: "profile" | "stats" | "roster" =
    rawTab === "stats" ? "stats" : rawTab === "roster" ? "roster" : "profile";
  const scope = searchParams?.scope === "all" ? "all" : "recent";

  // строка из query ?seasons=18,19,24
  const seasonsParam = searchParams?.seasons;

  // парсим её в массив чисел
  const selectedTournamentIds: number[] | undefined =
    seasonsParam && seasonsParam.trim().length
      ? Array.from(
          new Set(
            seasonsParam
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => !Number.isNaN(n)),
          ),
        )
      : undefined;

  const makeRosterHref = (ids: number[]) =>
    `/teams/${teamIdNum}?tab=roster${
      ids.length ? `&seasons=${ids.join(",")}` : ""
    }`;

  if (!teamIdNum || Number.isNaN(teamIdNum)) {
    return <div className="p-6">Неверный ID команды.</div>;
  }

  // 1) Основная инфа по команде
  const infoRows = await prisma.$queryRawUnsafe<{
    team_id: number;
    team_name: string;
    matches: number;
    last_tournament: string | null;
  }[]>(
    `
    WITH team_matches AS (
      SELECT
        c.id          AS team_id,
        c.team_name   AS team_name,
        ums.match_id  AS match_id,
        tm.timestamp  AS ts,
        tr.name       AS tournament_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament tr       ON tm.tournament_id = tr.id
      JOIN teams c             ON ums.team_id = c.id
      WHERE c.id = ?
    ),
    agg AS (
      SELECT
        team_id,
        team_name,
        COUNT(DISTINCT match_id) AS matches,
        MAX(ts)                  AS last_ts
      FROM team_matches
      GROUP BY team_id, team_name
    ),
    last_match AS (
      SELECT
        tm.team_id,
        tm.tournament_name
      FROM team_matches tm
      JOIN agg a
        ON a.team_id = tm.team_id
       AND a.last_ts = tm.ts
      LIMIT 1
    )
    SELECT
      a.team_id,
      a.team_name,
      a.matches,
      lm.tournament_name AS last_tournament
    FROM agg a
    LEFT JOIN last_match lm ON lm.team_id = a.team_id
    LIMIT 1
    `,
    teamIdNum,
  );

  const info = infoRows[0];

  if (!info) {
    return <div className="p-6">Команда не найдена.</div>;
  }

  const currentLeagueShort = mapTournamentToLeagueLabel(info.last_tournament);

  // 2) Распределение по лигам
  const leagueRows = await prisma.$queryRawUnsafe<{
    league_label: string;
    cnt: number;
  }[]>(
    `
    WITH team_matches AS (
      SELECT DISTINCT
        ums.match_id  AS match_id,
        tr.name       AS tournament_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament tr       ON tm.tournament_id = tr.id
      WHERE ums.team_id = ?
    )
    SELECT
      CASE
        WHEN UPPER(tournament_name) LIKE '%ПРЕМЬЕР%' OR UPPER(tournament_name) LIKE '% ПЛ%' THEN 'ПЛ'
        WHEN UPPER(tournament_name) LIKE '%ФНЛ%'  THEN 'ФНЛ'
        WHEN UPPER(tournament_name) LIKE '%ПФЛ%'  THEN 'ПФЛ'
        WHEN UPPER(tournament_name) LIKE '%ЛФЛ%'  THEN 'ЛФЛ'
        ELSE 'Прочие'
      END AS league_label,
      COUNT(*) AS cnt
    FROM team_matches
    GROUP BY league_label
    `,
    teamIdNum,
  );

  const totalMatches =
    leagueRows.reduce((s, r) => s + Number(r.cnt || 0), 0) ||
    Number(info.matches || 0);

  const leagues = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие"].map((label) => {
    const row = leagueRows.find((row) => row.league_label === label);
    const cnt = row ? Number(row.cnt) : 0;
    const pct = totalMatches > 0 ? Math.round((cnt / totalMatches) * 100) : 0;
    return { label, cnt, pct };
  });

  // 2.5) Статистика текущего официального сезона (без кубков)
  type SeasonStatsRow = {
    tournament_id: number | null;
    tournament_name: string | null;
    matches: number | null;
    goals: number | null;
    xg: number | null;
    shots: number | null;
    shots_on_target: number | null;
    allpasses: number | null;
    completedpasses: number | null;
    passes_xa: number | null;
    crosses: number | null;
    allcrosses: number | null;
    intercepts: number | null;
    selection: number | null;
    completedtackles: number | null;
    blocks: number | null;
    allselection: number | null;
    def_actions: number | null;
    duels_air: number | null;
    duels_air_win: number | null;
  };

  const seasonStatsRows = await prisma.$queryRawUnsafe<SeasonStatsRow[]>(
    `
    WITH season_base AS (
      SELECT
        ums.team_id,
        tm.tournament_id,
        tr.name AS tournament_name,
        tm.timestamp AS ts
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN tournament tr       ON tm.tournament_id = tr.id
      WHERE ums.team_id = ?
        AND tr.name LIKE '%сезон%'
        AND UPPER(tr.name) NOT LIKE '%КУБОК%'
    ),
    last_season AS (
      SELECT
        tournament_id,
        tournament_name
      FROM season_base
      ORDER BY ts DESC
      LIMIT 1
    ),
    agg AS (
      SELECT
        ums.team_id,
        tm.tournament_id,
        COUNT(DISTINCT ums.match_id)                AS matches,
        SUM(ums.goals)                              AS goals,
        SUM(ums.goals_expected)                     AS xg,
        SUM(ums.kickedin + ums.kickedout)          AS shots,
        SUM(ums.kickedin)                           AS shots_on_target,
        SUM(ums.allpasses)                          AS allpasses,
        SUM(ums.completedpasses)                    AS completedpasses,
        SUM(ums.passes)                             AS passes_xa,
        SUM(ums.crosses)                            AS crosses,
        SUM(ums.allcrosses)                         AS allcrosses,
        SUM(ums.intercepts)                         AS intercepts,
        SUM(ums.selection)                          AS selection,
        SUM(ums.completedtackles)                   AS completedtackles,
        SUM(ums.blocks)                             AS blocks,
        SUM(ums.allselection)                       AS allselection,
        SUM(ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS def_actions,
        SUM(ums.duels_air)                          AS duels_air,
        SUM(ums.duels_air_win)                      AS duels_air_win
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.team_id = ?
      GROUP BY ums.team_id, tm.tournament_id
    )
    SELECT
      ls.tournament_id,
      ls.tournament_name,
      a.matches,
      a.goals,
      a.xg,
      a.shots,
      a.shots_on_target,
      a.allpasses,
      a.completedpasses,
      a.passes_xa,
      a.crosses,
      a.allcrosses,
      a.intercepts,
      a.selection,
      a.completedtackles,
      a.blocks,
      a.allselection,
      a.def_actions,
      a.duels_air,
      a.duels_air_win
    FROM last_season ls
    JOIN agg a
      ON a.tournament_id = ls.tournament_id
    LIMIT 1
    `,
    teamIdNum,
    teamIdNum,
  );

  const season = seasonStatsRows[0] ?? null;

  // приведём к удобному виду
  let seasonStyle:
    | null
    | {
        tournamentId: number | null;
        tournamentName: string;
        matches: number;
        // атака
        goalsTotal: number;
        goalsPerMatch: number | null;
        xgTotal: number;
        xgPerMatch: number | null;
        shotsTotal: number;
        shotsPerMatch: number | null;
        shotsOnTargetTotal: number;
        shotsOnTargetPerMatch: number | null;
        shotsAccPct: number | null;
        passesPerShot: number | null;
        shotDanger: number | null;
        // созидание
        passesTotal: number;
        passesPerMatch: number | null;
        passAccPct: number | null;
        xATotal: number;
        xAPerMatch: number | null;
        pXA: number | null;
        // фланги
        crossesTotal: number;
        crossesPerMatch: number | null;
        crossAccPct: number | null;
        // оборона
        interceptsPerMatch: number | null;
        allselectionPerMatch: number | null;
        selectionPerMatch: number | null;
        completedTacklesPerMatch: number | null;
        defActionsPerMatch: number | null;
        duelsAirPerMatch: number | null;
        aerialPct: number | null;
      } = null;

  if (season && season.matches && Number(season.matches) > 0) {
    const matchesSeason = Number(season.matches);
    const num2 = (x: number | null) => Number(x ?? 0);
    const divPerMatch = (x: number | null) =>
      matchesSeason > 0 ? num2(x) / matchesSeason : null;

    const goalsTotal = num2(season.goals);
    const xgTotal = num2(season.xg);
    const shotsTotal = num2(season.shots);
    const shotsOnTargetTotal = num2(season.shots_on_target);
    const passesTotal = num2(season.allpasses);
    const completedPasses = num2(season.completedpasses);
    const xATotal = num2(season.passes_xa);

    // навесы: allcrosses = попытки, crosses = удачные
    const crossesAttempts = num2(season.allcrosses);
    const crossesSuccess = num2(season.crosses);

    const duelsAirTotal = num2(season.duels_air);
    const duelsAirWin = num2(season.duels_air_win);

    seasonStyle = {
      tournamentId: season.tournament_id ?? null,
      tournamentName: season.tournament_name ?? "",
      matches: matchesSeason,

      // атака
      goalsTotal,
      goalsPerMatch: divPerMatch(season.goals),
      xgTotal,
      xgPerMatch: divPerMatch(season.xg),
      shotsTotal,
      shotsPerMatch: divPerMatch(season.shots),
      shotsOnTargetTotal,
      shotsOnTargetPerMatch: divPerMatch(season.shots_on_target),
      shotsAccPct:
        shotsTotal > 0 ? (shotsOnTargetTotal * 100) / shotsTotal : null,
      passesPerShot:
        shotsTotal > 0 && passesTotal > 0 ? passesTotal / shotsTotal : null,
      shotDanger: shotsTotal > 0 ? xgTotal / shotsTotal : null,

      // созидание
      passesTotal,
      passesPerMatch: divPerMatch(season.allpasses),
      passAccPct:
        passesTotal > 0 ? (completedPasses * 100) / passesTotal : null,
      xATotal,
      xAPerMatch: divPerMatch(season.passes_xa),
      pXA:
        xATotal > 0 && passesTotal > 0 ? (0.5 * passesTotal) / xATotal : null,

      // фланги (используем попытки навесов)
      crossesTotal: crossesAttempts,
      crossesPerMatch: divPerMatch(season.allcrosses),
      crossAccPct:
        crossesAttempts > 0 ? (crossesSuccess * 100) / crossesAttempts : null,

      // оборона
      interceptsPerMatch: divPerMatch(season.intercepts),
      allselectionPerMatch: divPerMatch(season.allselection),
      selectionPerMatch: divPerMatch(season.selection),
      completedTacklesPerMatch: divPerMatch(season.completedtackles),
      defActionsPerMatch: divPerMatch(season.def_actions),
      duelsAirPerMatch: divPerMatch(season.duels_air),
      aerialPct:
        duelsAirTotal > 0 ? (duelsAirWin * 100) / duelsAirTotal : null,
    };
  }

  // 2.6) Ранги по метрикам внутри турнира
  let ranks:
    | null
    | {
        goalsPerMatch?: { rank: number; total: number } | null;
        xgPerMatch?: { rank: number; total: number } | null;
        shotsPerMatch?: { rank: number; total: number } | null;
        shotsOnTargetPerMatch?: { rank: number; total: number } | null;
        shotsAccPct?: { rank: number; total: number } | null;
        passesPerShot?: { rank: number; total: number } | null;
        shotDanger?: { rank: number; total: number } | null;
        passesPerMatch?: { rank: number; total: number } | null;
        passAccPct?: { rank: number; total: number } | null;
        xAPerMatch?: { rank: number; total: number } | null;
        pXA?: { rank: number; total: number } | null;
        crossesPerMatch?: { rank: number; total: number } | null;
        crossAccPct?: { rank: number; total: number } | null;
        interceptsPerMatch?: { rank: number; total: number } | null;
        allselectionPerMatch?: { rank: number; total: number } | null;
        selectionPerMatch?: { rank: number; total: number } | null;
        completedTacklesPerMatch?: { rank: number; total: number } | null;
        defActionsPerMatch?: { rank: number; total: number } | null;
        duelsAirPerMatch?: { rank: number; total: number } | null;
        aerialPct?: { rank: number; total: number } | null;
      } = null;

  if (seasonStyle && seasonStyle.tournamentId) {
    const leagueTeamsRaw = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        ums.team_id,
        COUNT(DISTINCT ums.match_id) AS matches,
        SUM(ums.goals) AS goals,
        SUM(ums.goals_expected) AS xg,
        SUM(ums.kickedin + ums.kickedout) AS shots,
        SUM(ums.kickedin) AS shots_on_target,
        SUM(ums.allpasses) AS allpasses,
        SUM(ums.completedpasses) AS completedpasses,
        SUM(ums.passes) AS passes_xa,
        SUM(ums.crosses) AS crosses,
        SUM(ums.allcrosses) AS allcrosses,
        SUM(ums.intercepts) AS intercepts,
        SUM(ums.selection) AS selection,
        SUM(ums.completedtackles) AS completedtackles,
        SUM(ums.blocks) AS blocks,
        SUM(ums.allselection) AS allselection,
        SUM(ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS def_actions,
        SUM(ums.duels_air) AS duels_air,
        SUM(ums.duels_air_win) AS duels_air_win
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE tm.tournament_id = ?
      GROUP BY ums.team_id
      `,
      seasonStyle.tournamentId,
    );

    const leagueTeams = leagueTeamsRaw.map((t) => {
      const m = Number(t.matches || 0);
      const div = (x: number | null) => (m > 0 ? Number(x ?? 0) / m : null);

      const shotsTotal = Number(t.shots || 0);
      const shotsOnTargetTotal = Number(t.shots_on_target || 0);
      const passesTotal = Number(t.allpasses || 0);
      const xATotal = Number(t.passes_xa || 0);
      const crossesAttempts = Number(t.allcrosses || 0);
      const crossesSuccess = Number(t.crosses || 0);
      const duelsAirTotal = Number(t.duels_air || 0);
      const duelsAirWin = Number(t.duels_air_win || 0);

      return {
        team_id: Number(t.team_id),
        goalsPerMatch: div(t.goals),
        xgPerMatch: div(t.xg),
        shotsPerMatch: div(t.shots),
        shotsOnTargetPerMatch: div(t.shots_on_target),
        shotsAccPct:
          shotsTotal > 0 ? (shotsOnTargetTotal * 100) / shotsTotal : null,
        passesPerShot:
          shotsTotal > 0 && passesTotal > 0 ? passesTotal / shotsTotal : null,
        shotDanger:
          shotsTotal > 0 ? Number(t.xg || 0) / shotsTotal : null,
        passesPerMatch: div(passesTotal),
        passAccPct:
          passesTotal > 0
            ? (Number(t.completedpasses || 0) * 100) / passesTotal
            : null,
        xAPerMatch: div(xATotal),
        pXA:
          xATotal > 0 && passesTotal > 0
            ? (0.5 * passesTotal) / xATotal
            : null,
        crossesPerMatch: div(t.allcrosses),
        crossAccPct:
          crossesAttempts > 0
            ? (crossesSuccess * 100) / crossesAttempts
            : null,
        interceptsPerMatch: div(t.intercepts),
        allselectionPerMatch: div(t.allselection),
        selectionPerMatch: div(t.selection),
        completedTacklesPerMatch: div(t.completedtackles),
        defActionsPerMatch: div(t.def_actions),
        duelsAirPerMatch: div(t.duels_air),
        aerialPct:
          duelsAirTotal > 0 ? (duelsAirWin * 100) / duelsAirTotal : null,
      };
    });

    ranks = {
      goalsPerMatch: getRank(leagueTeams, teamIdNum, "goalsPerMatch", true),
      xgPerMatch: getRank(leagueTeams, teamIdNum, "xgPerMatch", true),
      shotsPerMatch: getRank(leagueTeams, teamIdNum, "shotsPerMatch", true),
      shotsOnTargetPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "shotsOnTargetPerMatch",
        true,
      ),
      shotsAccPct: getRank(leagueTeams, teamIdNum, "shotsAccPct", true),
      passesPerShot: getRank(leagueTeams, teamIdNum, "passesPerShot", false),
      shotDanger: getRank(leagueTeams, teamIdNum, "shotDanger", true),
      passesPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "passesPerMatch",
        true,
      ),
      passAccPct: getRank(leagueTeams, teamIdNum, "passAccPct", true),
      xAPerMatch: getRank(leagueTeams, teamIdNum, "xAPerMatch", true),
      pXA: getRank(leagueTeams, teamIdNum, "pXA", false),
      crossesPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "crossesPerMatch",
        true,
      ),
      crossAccPct: getRank(leagueTeams, teamIdNum, "crossAccPct", true),
      interceptsPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "interceptsPerMatch",
        true,
      ),
      allselectionPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "allselectionPerMatch",
        true,
      ),
      selectionPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "selectionPerMatch",
        true,
      ),
      completedTacklesPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "completedTacklesPerMatch",
        true,
      ),
      defActionsPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "defActionsPerMatch",
        true,
      ),
      duelsAirPerMatch: getRank(
        leagueTeams,
        teamIdNum,
        "duelsAirPerMatch",
        true,
      ),
      aerialPct: getRank(leagueTeams, teamIdNum, "aerialPct", true),
    };
  }

  // 3) Все официальные матчи против соперников
  const headToHeadRaw = await prisma.$queryRawUnsafe<{
    opponent_id: number;
    opponent_name: string | null;
    scored: number | null;
    missed: number | null;
    win: number | null;
    draw: number | null;
    lose: number | null;
    tm: number | null;
    tournament_name: string | null;
  }[]>(
    `
    SELECT
      opp.team_id       AS opponent_id,
      oppTeam.team_name AS opponent_name,
      main.scored,
      main.missed,
      main.win,
      main.draw,
      main.lose,
      main.tm,
      tr.name           AS tournament_name
    FROM tbl_teams_match_stats main
    JOIN tbl_teams_match_stats opp
      ON opp.match_id = main.match_id
     AND opp.team_id <> main.team_id
    JOIN tournament tr       ON tr.id = main.tournament_id
    JOIN teams     oppTeam   ON oppTeam.id = opp.team_id
    WHERE main.team_id = ?
      AND tr.name LIKE '%сезон%'
    ORDER BY main.tm DESC
    `,
    teamIdNum,
  );

  const opponentMatches: OpponentMatchClient[] = headToHeadRaw.map((r) => {
    const scored = Number(r.scored ?? 0);
    const missed = Number(r.missed ?? 0);

    const res: "W" | "D" | "L" | "-" =
      Number(r.win) === 1
        ? "W"
        : Number(r.draw) === 1
        ? "D"
        : Number(r.lose) === 1
        ? "L"
        : "-";

    const date =
      r.tm && Number.isFinite(r.tm)
        ? new Date(Number(r.tm) * 1000).toISOString().slice(0, 10)
        : "";

    return {
      opponentId: Number(r.opponent_id),
      opponentName: r.opponent_name ?? "Без названия",
      res,
      scored,
      missed,
      date,
      tournament: r.tournament_name ?? "",
    };
  });

  // агрегат по соперникам — для топ-3 удобных/неудобных
  type OpponentAgg = {
    id: number;
    name: string;
    matches: number;
    wins: number;
    draws: number;
    loses: number;
    ourPoints: number;
    oppPoints: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
  };

  const aggMap = new Map<number, OpponentAgg>();

  for (const m of opponentMatches) {
    if (!aggMap.has(m.opponentId)) {
      aggMap.set(m.opponentId, {
        id: m.opponentId,
        name: m.opponentName,
        matches: 0,
        wins: 0,
        draws: 0,
        loses: 0,
        ourPoints: 0,
        oppPoints: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
      });
    }
    const agg = aggMap.get(m.opponentId)!;

    agg.matches += 1;
    agg.goalsFor += m.scored;
    agg.goalsAgainst += m.missed;
    agg.goalDiff = agg.goalsFor - agg.goalsAgainst;

    if (m.res === "W") {
      agg.wins += 1;
      agg.ourPoints += 3;
    } else if (m.res === "D") {
      agg.draws += 1;
      agg.ourPoints += 1;
      agg.oppPoints += 1;
    } else if (m.res === "L") {
      agg.loses += 1;
      agg.oppPoints += 3;
    }
  }

  const allOpponentsAgg = Array.from(aggMap.values());

  // фильтр по минимальному количеству матчей
  const eligibleOpponents = allOpponentsAgg.filter((o) => o.matches >= 5);

  // сортировка по win-rate
  const sortedByWinRate = [...eligibleOpponents].sort((a, b) => {
    const aw = a.matches > 0 ? a.wins / a.matches : 0;
    const bw = b.matches > 0 ? b.wins / b.matches : 0;

    if (bw !== aw) return bw - aw; // выше % побед
    if (b.matches !== a.matches) return b.matches - a.matches; // больше матчей
    return a.name.localeCompare(b.name); // стабильный порядок
  });

  const bestOpponents = sortedByWinRate.slice(0, 3);
  const worstOpponents = [...sortedByWinRate].reverse().slice(0, 3);

  // 4) Форма = 10 последних официальных матчей
  const form = opponentMatches.slice(0, 10);

  // 5) если открыт таб "Статистика" — грузим стату команды
  let teamStats: { matches: number; totals: TeamTotals } | null = null;
  if (tab === "stats") {
    teamStats = await loadTeamStats(teamIdNum, scope);
  }

  // 6) если открыт таб "Состав" — грузим состав (с учётом выбранных турниров)
  let roster: TeamRosterRow[] = [];
  let rosterTournaments: TournamentOption[] = [];
  let rosterSelectedIds: number[] = [];

  if (tab === "roster") {
    const rosterResult = await loadTeamRoster(
      teamIdNum,
      selectedTournamentIds,
    );

    roster = rosterResult.players;
    rosterTournaments = rosterResult.tournaments;
    rosterSelectedIds = rosterResult.selectedTournamentIds;
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{info.team_name}</h1>
      </div>

      {/* Верхние плитки */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Матчи</div>
          <div className="text-2xl font-semibold">{info.matches}</div>
          <div className="text-[11px] text-zinc-400 mt-2">
            *учтены только матчи с записью статистики
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Актуальная лига</div>
          <div className="text-2xl font-semibold">{currentLeagueShort}</div>
          {info.last_tournament && (
            <div className="text-[11px] text-zinc-400 mt-2">
              по последнему матчу: {info.last_tournament}
            </div>
          )}
        </div>
      </div>

      {/* Табы */}
      <div className="border-b border-zinc-200 mt-2">
        <nav className="flex gap-4 text-sm">
          <Link
            href={`/teams/${teamIdNum}`}
            className={`pb-2 ${
              tab === "profile"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Профиль
          </Link>
          <Link
            href={`/teams/${teamIdNum}?tab=stats&scope=${scope}`}
            className={`pb-2 ${
              tab === "stats"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Статистика
          </Link>
          <Link
            href={`/teams/${teamIdNum}?tab=roster`}
            className={`pb-2 ${
              tab === "roster"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Состав
          </Link>
        </nav>
      </div>

      {tab === "profile" ? (
        /* ВТОРАЯ СТРОКА: профиль (распределение, стиль, форма, радар) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Распределение по лигам + топ-3 соперников + стиль сезона */}
          <section className="rounded-xl border border-zinc-200 p-4">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">
              Распределение матчей по лигам
            </h3>
            <div className="space-y-2">
              {leagues.map((l) => (
                <div key={l.label} className="flex items-center gap-2 text-sm">
                  <div className="w-14">{l.label}</div>
                  <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${l.pct}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-xs text-zinc-500">
                    {l.cnt} ({l.pct}%)
                  </div>
                </div>
              ))}
            </div>

            {/* Самые удобные / неудобные соперники */}
            {eligibleOpponents.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Удобные */}
                <div>
                  <h4 className="font-semibold mb-1">
                    Самые удобные соперники
                  </h4>
                  <ul className="space-y-1">
                    {bestOpponents.map((o) => (
                      <li key={o.id} className="flex justify-between gap-2">
                        <span className="text-emerald-700">{o.name}</span>
                        <span className="text-emerald-700 font-semibold">
                          {o.wins}-{o.draws}-{o.loses}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Неудобные */}
                <div>
                  <h4 className="font-semibold mb-1">
                    Самые неудобные соперники
                  </h4>
                  <ul className="space-y-1">
                    {worstOpponents.map((o) => (
                      <li key={o.id} className="flex justify-between gap-2">
                        <span className="text-red-700">{o.name}</span>
                        <span className="text-red-700 font-semibold">
                          {o.wins}-{o.draws}-{o.loses}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Стиль игры в текущем сезоне */}
            {seasonStyle && (
              <div className="mt-6 border-t border-zinc-200 pt-4 text-xs space-y-3">
                <div className="text-[11px] uppercase text-zinc-500">
                  ⚙️ Стиль игры — {seasonStyle.tournamentName},{" "}
                  {seasonStyle.matches} матчей
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Атака + Созидание */}
                  <div className="space-y-2">
                    <div className="font-semibold">🎯 Атака</div>

                    <div className="flex items-center gap-2">
                      {ranks?.goalsPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.goalsPerMatch.rank,
                              ranks.goalsPerMatch.total,
                            )
                          }
                        >
                          {ranks.goalsPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Голы — {seasonStyle.goalsTotal} /{" "}
                        {fmt(seasonStyle.goalsPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.xgPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.xgPerMatch.rank,
                              ranks.xgPerMatch.total,
                            )
                          }
                        >
                          {ranks.xgPerMatch.rank}
                        </span>
                      )}
                      <span>
                        xG — {fmt(seasonStyle.xgTotal)} /{" "}
                        {fmt(seasonStyle.xgPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.shotsPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.shotsPerMatch.rank,
                              ranks.shotsPerMatch.total,
                            )
                          }
                        >
                          {ranks.shotsPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Удары — {seasonStyle.shotsTotal} /{" "}
                        {fmt(seasonStyle.shotsPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.shotsOnTargetPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.shotsOnTargetPerMatch.rank,
                              ranks.shotsOnTargetPerMatch.total,
                            )
                          }
                        >
                          {ranks.shotsOnTargetPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Удары в створ — {seasonStyle.shotsOnTargetTotal} /{" "}
                        {fmt(seasonStyle.shotsOnTargetPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.shotsAccPct && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.shotsAccPct.rank,
                              ranks.shotsAccPct.total,
                            )
                          }
                        >
                          {ranks.shotsAccPct.rank}
                        </span>
                      )}
                      <span>
                        Точность ударов — {fmt(seasonStyle.shotsAccPct)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.passesPerShot && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.passesPerShot.rank,
                              ranks.passesPerShot.total,
                            )
                          }
                        >
                          {ranks.passesPerShot.rank}
                        </span>
                      )}
                      <span>
                        Пасов на удар — {fmt(seasonStyle.passesPerShot)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.shotDanger && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.shotDanger.rank,
                              ranks.shotDanger.total,
                            )
                          }
                        >
                          {ranks.shotDanger.rank}
                        </span>
                      )}
                      <span>
                        Кэф опасности удара —{" "}
                        {fmt(seasonStyle.shotDanger, 2)}
                      </span>
                    </div>

                    <div className="mt-3 font-semibold">
                      ⚡ Созидание и владение
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.passesPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.passesPerMatch.rank,
                              ranks.passesPerMatch.total,
                            )
                          }
                        >
                          {ranks.passesPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Попыток паса — {seasonStyle.passesTotal} /{" "}
                        {fmt(seasonStyle.passesPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.passAccPct && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.passAccPct.rank,
                              ranks.passAccPct.total,
                            )
                          }
                        >
                          {ranks.passAccPct.rank}
                        </span>
                      )}
                      <span>
                        Точность паса — {fmt(seasonStyle.passAccPct)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.xAPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.xAPerMatch.rank,
                              ranks.xAPerMatch.total,
                            )
                          }
                        >
                          {ranks.xAPerMatch.rank}
                        </span>
                      )}
                      <span>
                        xA — {fmt(seasonStyle.xATotal)} /{" "}
                        {fmt(seasonStyle.xAPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.pXA && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(ranks.pXA.rank, ranks.pXA.total)
                          }
                        >
                          {ranks.pXA.rank}
                        </span>
                      )}
                      <span>pXA — {fmt(seasonStyle.pXA)} паса на 0.5 xA</span>
                    </div>
                  </div>

                  {/* Фланги + Оборона */}
                  <div className="space-y-2">
                    <div className="font-semibold">🌪 Фланги и навесы</div>

                    <div className="flex items-center gap-2">
                      {ranks?.crossesPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.crossesPerMatch.rank,
                              ranks.crossesPerMatch.total,
                            )
                          }
                        >
                          {ranks.crossesPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Навесы — {seasonStyle.crossesTotal} /{" "}
                        {fmt(seasonStyle.crossesPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.crossAccPct && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.crossAccPct.rank,
                              ranks.crossAccPct.total,
                            )
                          }
                        >
                          {ranks.crossAccPct.rank}
                        </span>
                      )}
                      <span>
                        Точность навесов —{" "}
                        {fmt(seasonStyle.crossAccPct)}%
                      </span>
                    </div>

                    <div className="mt-3 font-semibold">
                      🛡 Оборона и воздух
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.interceptsPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.interceptsPerMatch.rank,
                              ranks.interceptsPerMatch.total,
                            )
                          }
                        >
                          {ranks.interceptsPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Перехваты —{" "}
                        {fmt(seasonStyle.interceptsPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.allselectionPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.allselectionPerMatch.rank,
                              ranks.allselectionPerMatch.total,
                            )
                          }
                        >
                          {ranks.allselectionPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Попытки отбора —{" "}
                        {fmt(seasonStyle.allselectionPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.selectionPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.selectionPerMatch.rank,
                              ranks.selectionPerMatch.total,
                            )
                          }
                        >
                          {ranks.selectionPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Удачные отборы —{" "}
                        {fmt(seasonStyle.selectionPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.completedTacklesPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.completedTacklesPerMatch.rank,
                              ranks.completedTacklesPerMatch.total,
                            )
                          }
                        >
                          {ranks.completedTacklesPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Удачные подкаты —{" "}
                        {fmt(seasonStyle.completedTacklesPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.defActionsPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.defActionsPerMatch.rank,
                              ranks.defActionsPerMatch.total,
                            )
                          }
                        >
                          {ranks.defActionsPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Всего защитных действий —{" "}
                        {fmt(seasonStyle.defActionsPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.duelsAirPerMatch && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.duelsAirPerMatch.rank,
                              ranks.duelsAirPerMatch.total,
                            )
                          }
                        >
                          {ranks.duelsAirPerMatch.rank}
                        </span>
                      )}
                      <span>
                        Воздушные дуэли —{" "}
                        {fmt(seasonStyle.duelsAirPerMatch)} за матч
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {ranks?.aerialPct && (
                        <span
                          className={
                            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                            rankColor(
                              ranks.aerialPct.rank,
                              ranks.aerialPct.total,
                            )
                          }
                        >
                          {ranks.aerialPct.rank}
                        </span>
                      )}
                      <span>
                        Победы в воздухе —{" "}
                        {fmt(seasonStyle.aerialPct)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Форма команды + радар */}
          <div className="flex flex-col gap-4">
            {/* Форма команды + история соперников */}
            <section className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-zinc-800">
                Форма (10 последних официальных матчей)
              </h3>

              {form.length === 0 ? (
                <div className="text-xs text-zinc-500">
                  Недостаточно данных по официальным матчам.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Линейка W/D/L */}
                  <div className="flex flex-wrap gap-1">
                    {form.map((m, idx) => {
                      let bg = "bg-zinc-100 text-zinc-700";
                      if (m.res === "W")
                        bg = "bg-emerald-100 text-emerald-700";
                      else if (m.res === "L")
                        bg = "bg-red-100 text-red-700";

                      const title = [
                        m.date || "",
                        m.opponentName,
                        m.tournament,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <span
                          key={idx}
                          title={title}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg}`}
                        >
                          {m.res} {m.scored}:{m.missed}
                        </span>
                      );
                    })}
                  </div>

                  {/* список очных матчей */}
                  <div className="mt-1 max-h-[260px] min-h-[260px] overflow-y-auto pr-1">
                    <OpponentsHistoryClient matches={opponentMatches} />
                  </div>
                </div>
              )}
            </section>

            {/* Радар строго под формой, в той же ширине */}
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <TeamRadarClient teamId={teamIdNum} />
            </section>
          </div>
        </div>
      ) : tab === "stats" ? (
        // TAB: Статистика команды
        <section className="mt-4">
          {/* Переключатель периода */}
          <div className="flex items-center gap-3 text-xs text-zinc-600 mb-4">
            <span className="text-zinc-500">Период:</span>

            <Link
              href={`/teams/${teamIdNum}?tab=stats&scope=recent`}
              className={`px-2 py-1 rounded-full border text-xs ${
                scope === "recent"
                  ? "border-blue-600 text-blue-600 bg-blue-50"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              C 18 сезона
            </Link>

            <Link
              href={`/teams/${teamIdNum}?tab=stats&scope=all`}
              className={`px-2 py-1 rounded-full border text-xs ${
                scope === "all"
                  ? "border-blue-600 text-blue-600 bg-blue-50"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              За всю историю
            </Link>
          </div>

          {!teamStats ? (
            <div className="text-sm text-zinc-500">
              Статистика команды не найдена для выбранного периода.
            </div>
          ) : (
            <TeamStatsSection
              matches={teamStats.matches}
              totals={teamStats.totals}
            />
          )}
        </section>
      ) : (
        // TAB: Состав
        <section className="mt-4 space-y-3">
          {/* селектор турниров для состава */}
          <TeamRosterTournamentSelector
            teamId={teamIdNum}
            tournaments={rosterTournaments}
            selectedIds={rosterSelectedIds}
          />

          {!roster || roster.length === 0 ? (
            <div className="text-sm text-zinc-500">
              Нет данных по составу для выбранного диапазона.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Игрок
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Матчи
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Голы
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Ассисты
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Г+П
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      xG
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Удары
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Уд. в створ, %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Точность паса, %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      xA (пасы)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Защитные действия
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Beaten Rate, %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Воздух, %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Навесы
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Точность навесов, %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p) => (
                    <tr
                      key={p.user_id}
                      className="border-t border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-3 py-2">
                        {p.gamertag || p.username || `ID ${p.user_id}`}
                      </td>
                      <td className="px-3 py-2 text-right">{p.matches}</td>
                      <td className="px-3 py-2 text-right">{p.goals}</td>
                      <td className="px-3 py-2 text-right">{p.assists}</td>
                      <td className="px-3 py-2 text-right">
                        {p.goal_contrib}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {fmt(p.xg, 2)}
                      </td>
                      <td className="px-3 py-2 text-right">{p.shots}</td>

                      {/* Уд. в створ, % */}
                      <td className="px-3 py-2 text-right">
                        {p.shots_on_target_pct != null
                          ? `${fmt(p.shots_on_target_pct * 100, 1)}%`
                          : "—"}
                      </td>

                      {/* Точность паса, % */}
                      <td className="px-3 py-2 text-right">
                        {p.pass_acc != null
                          ? `${fmt(p.pass_acc * 100, 1)}%`
                          : "—"}
                      </td>

                      <td className="px-3 py-2 text-right">
                        {fmt(p.passes_xa, 2)}
                      </td>

                      <td className="px-3 py-2 text-right">
                        {p.def_actions}
                      </td>

                      {/* Beaten Rate, % */}
                      <td className="px-3 py-2 text-right">
                        {p.beaten_rate != null
                          ? `${fmt(p.beaten_rate * 100, 1)}%`
                          : "—"}
                      </td>

                      {/* Воздух, % */}
                      <td className="px-3 py-2 text-right">
                        {p.aerial_pct != null
                          ? `${fmt(p.aerial_pct * 100, 1)}%`
                          : "—"}
                      </td>

                      {/* Навесы */}
                      <td className="px-3 py-2 text-right">
                        {p.allcrosses > 0
                          ? `${p.crosses}/${p.allcrosses}`
                          : "—"}
                      </td>

                      {/* Точность навесов, % */}
                      <td className="px-3 py-2 text-right">
                        {p.cross_acc != null
                          ? `${fmt(p.cross_acc * 100, 1)}%`
                          : p.allcrosses > 0
                            ? "0%"
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
