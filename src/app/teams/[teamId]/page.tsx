// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import OpponentsHistoryClient from "@/components/teams/OpponentsHistoryClient";
import TeamRadarClient from "@/components/teams/TeamRadarClient";
import TeamStatsSection, {
  TeamTotals,
} from "@/components/teams/TeamStatsSection";
import { loadTeamRoster, type TeamRosterRow } from "./loadTeamRoster";

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
  searchParams?: { tab?: string; scope?: string };
}) {
  const teamIdNum = Number(params.teamId);
  const rawTab = searchParams?.tab;
  const tab: "profile" | "stats" | "roster" =
    rawTab === "stats" ? "stats" : rawTab === "roster" ? "roster" : "profile";
  const scope = searchParams?.scope === "all" ? "all" : "recent";

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
        selectionPerMatch: number | null;
        completedTacklesPerMatch: number | null;
        defActionsPerMatch: number | null;
        duelsAirPerMatch: number | null;
        aerialPct: number | null;
      } = null;

  if (season && season.matches && Number(season.matches) > 0) {
    const matchesSeason = Number(season.matches);
    const num = (x: number | null) => Number(x ?? 0);
    const divPerMatch = (x: number | null) =>
      matchesSeason > 0 ? num(x) / matchesSeason : null;

    const goalsTotal = num(season.goals);
    const xgTotal = num(season.xg);
    const shotsTotal = num(season.shots);
    const shotsOnTargetTotal = num(season.shots_on_target);
    const passesTotal = num(season.allpasses);
    const completedPasses = num(season.completedpasses);
    const xATotal = num(season.passes_xa);

    // навесы: allcrosses = попытки, crosses = удачные
    const crossesAttempts = num(season.allcrosses);
    const crossesSuccess = num(season.crosses);

    const duelsAirTotal = num(season.duels_air);
    const duelsAirWin = num(season.duels_air_win);
    const defActionsTotal = num(season.def_actions);

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
        shotsTotal > 0 ? (shotsOnTargetTotal * 100) / sho*
