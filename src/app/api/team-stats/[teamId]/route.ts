// src/app/api/team-stats/[teamId]/route.ts
// Полная статистика команды по официальным турнирам (с 18 сезона)
// + перцентили по лиге для командного радара

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

// оси радара
type RadarPercentiles = {
  goals: number | null;         // голы за матч
  shots: number | null;         // удары за матч
  passes: number | null;        // пасы за матч
  passesPerShot: number | null; // пасов на удар (инвертируем)
  defActions: number | null;    // защитные действия за матч
  passAccPct: number | null;    // точность паса, %
  crosses: number | null;       // навесы за матч
  aerialPct: number | null;     // победы в воздухе, %
};

// строки для пула лиги
type LeagueRow = {
  team_id: number | string;
  matches: number;
  goals_per_match: number | string | null;
  shots_per_match: number | string | null;
  passes_per_match: number | string | null;
  crosses_per_match: number | string | null;
  def_actions_per_match: number | string | null;
  pass_acc: number | string | null;
  aerial_pct: number | string | null;
  passes_per_shot: number | string | null;
  [key: string]: any;
};

// утилита для перцентилей по массиву значений
function computePercentile(
  rows: LeagueRow[],
  key: keyof LeagueRow,
  teamId: number,
  invert: boolean,
): number | null {
  // приводим team_id и значение метрики к числу
  const normalized = rows
    .map((r) => {
      const raw = r[key];
      const value =
        raw === null || raw === undefined ? null : Number(raw as any);
      return {
        teamId: Number(r.team_id),
        value,
      };
    })
    .filter((x) => x.value !== null && Number.isFinite(x.value as number));

  if (!normalized.length) return null;

  // сортируем по значению
  const sorted = [...normalized].sort(
    (a, b) => (a.value as number) - (b.value as number),
  );

  // индекс нужной команды
  const idx = sorted.findIndex((x) => x.teamId === teamId);
  if (idx === -1) return null;

  if (sorted.length === 1) {
    return 100; // единственная команда — 100%
  }

  const frac = idx / (sorted.length - 1); // 0 = минимум, 1 = максимум
  const pct = invert ? 1 - frac : frac;

  return Math.round(pct * 100);
}

export async function GET(
  _req: Request,
  { params }: { params: { teamId: string } },
) {
  const teamId = Number(params.teamId);
  if (!teamId || Number.isNaN(teamId)) {
    return NextResponse.json(
      { ok: false, error: "Bad teamId" },
      { status: 400 },
    );
  }

  const url = new URL(_req.url);
  const scopeParam = url.searchParams.get("scope");
  const scope: "recent" | "all" = scopeParam === "all" ? "all" : "recent";

  const seasonFilter =
    scope === "all"
      ? `t.name REGEXP '\\\\([0-9]+ сезон\\\\)'`
      : OFFICIAL_FILTER;

  try {
    // ---- 1) Профиль команды (totals + perMatch + текущая лига) ----
    const sql = `
      WITH base AS (
        SELECT
          ums.team_id,
          ums.match_id,
          tm.timestamp AS ts,
          CASE
            WHEN UPPER(t.name) LIKE '%ПРЕМЬЕР%' OR UPPER(t.name) LIKE '% ПЛ%' THEN 'ПЛ'
            WHEN UPPER(t.name) LIKE '%ФНЛ%'  THEN 'ФНЛ'
            WHEN UPPER(t.name) LIKE '%ПФЛ%'  THEN 'ПФЛ'
            WHEN UPPER(t.name) LIKE '%ЛФЛ%'  THEN 'ЛФЛ'
            ELSE 'Прочие'
          END AS league_label,

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
      ),
      last_league AS (
        SELECT league_label
        FROM base
        WHERE ts = (SELECT MAX(ts) FROM base)
        LIMIT 1
      )
      SELECT
        pt.team_id,
        pt.matches,

        pt.goals,
        pt.assists,
        (pt.goals + pt.assists) AS goal_contrib,
        pt.xg,
        (pt.goals - pt.xg)      AS xg_delta,

        (pt.kickedin + pt.kickedout) AS shots,
        CASE
          WHEN (pt.kickedin + pt.kickedout) > 0
            THEN pt.kickedin * 1.0 / (pt.kickedin + pt.kickedout)
          ELSE NULL
        END AS shots_on_target_pct,
        CASE
          WHEN pt.goals > 0
            THEN (pt.kickedin + pt.kickedout) * 1.0 / pt.goals
          ELSE NULL
        END AS shots_per_goal,

        pt.passes_xa,
        pt.ipasses        AS key_passes,
        pt.pregoal_passes AS pre_assists,
        pt.allpasses,
        pt.completedpasses,
        CASE
          WHEN pt.allpasses > 0
            THEN pt.completedpasses * 1.0 / pt.allpasses
          ELSE NULL
        END AS pass_acc,
        CASE
          WHEN pt.passes_xa > 0
            THEN 0.5 * pt.allpasses * 1.0 / pt.passes_xa
          ELSE NULL
        END AS pxa,

        pt.allstockes,
        pt.completedstockes,
        CASE
          WHEN pt.allstockes > 0
            THEN pt.completedstockes * 1.0 / pt.allstockes
          ELSE NULL
        END AS dribble_pct,

        pt.intercepts,
        pt.selection,
        pt.completedtackles,
        pt.blocks,
        pt.allselection,
        (pt.intercepts + pt.selection + pt.completedtackles + pt.blocks) AS def_actions,
        CASE
          WHEN (pt.intercepts + pt.selection + pt.completedtackles + pt.blocks) > 0
            THEN (pt.outplayed + pt.penalised_fails) * 1.0 /
                 (pt.intercepts + pt.selection + pt.completedtackles + pt.blocks)
          ELSE NULL
        END AS beaten_rate,

        pt.outs,
        pt.duels_air,
        pt.duels_air_win,
        CASE
          WHEN pt.duels_air > 0
            THEN pt.duels_air_win * 1.0 / pt.duels_air
          ELSE NULL
        END AS aerial_pct,

        pt.duels_off_win,
        pt.duels_off_lose,
        (pt.duels_off_win + pt.duels_off_lose) AS off_duels_total,
        CASE
          WHEN (pt.duels_off_win + pt.duels_off_lose) > 0
            THEN pt.duels_off_win * 1.0 / (pt.duels_off_win + pt.duels_off_lose)
          ELSE NULL
        END AS off_duels_win_pct,

        pt.crosses,
        pt.allcrosses,
        CASE
          WHEN pt.allcrosses > 0
            THEN pt.crosses * 1.0 / pt.allcrosses
          ELSE NULL
        END AS cross_acc,

        (SELECT league_label FROM last_league) AS current_league_label
      FROM per_team pt
      LIMIT 1
    `;

    const rowsRaw = await prisma.$queryRawUnsafe<any[]>(sql);
    const [rowRaw] = toJSON<any[]>(rowsRaw);

    if (!rowRaw) {
      return NextResponse.json({
        ok: true,
        teamId,
        matches: 0,
        totals: EMPTY_TOTALS,
        perMatch: EMPTY_TOTALS,
        scope,
        radarPercentiles: null,
        leagueLabel: null,
      });
    }

    const leagueLabel: string | null = rowRaw.current_league_label ?? null;

    const totals: Totals = {
      matches: rowRaw.matches ?? 0,

      goals: rowRaw.goals ?? 0,
      assists: rowRaw.assists ?? 0,
      goal_contrib: rowRaw.goal_contrib ?? 0,
      xg: rowRaw.xg ?? 0,
      xg_delta: rowRaw.xg_delta ?? 0,
      shots: rowRaw.shots ?? 0,
      shots_on_target_pct: rowRaw.shots_on_target_pct,
      shots_per_goal: rowRaw.shots_per_goal,

      passes_xa: rowRaw.passes_xa ?? 0,
      key_passes: rowRaw.key_passes ?? 0,
      pre_assists: rowRaw.pre_assists ?? 0,
      allpasses: rowRaw.allpasses ?? 0,
      completedpasses: rowRaw.completedpasses ?? 0,
      pass_acc: rowRaw.pass_acc,
      pxa: rowRaw.pxa,

      allstockes: rowRaw.allstockes ?? 0,
      completedstockes: rowRaw.completedstockes ?? 0,
      dribble_pct: rowRaw.dribble_pct,

      intercepts: rowRaw.intercepts ?? 0,
      selection: rowRaw.selection ?? 0,
      completedtackles: rowRaw.completedtackles ?? 0,
      blocks: rowRaw.blocks ?? 0,
      allselection: rowRaw.allselection ?? 0,
      def_actions: rowRaw.def_actions ?? 0,
      beaten_rate: rowRaw.beaten_rate,

      outs: rowRaw.outs ?? 0,
      duels_air: rowRaw.duels_air ?? 0,
      duels_air_win: rowRaw.duels_air_win ?? 0,
      aerial_pct: rowRaw.aerial_pct,

      duels_off_win: rowRaw.duels_off_win ?? 0,
      duels_off_lose: rowRaw.duels_off_lose ?? 0,
      off_duels_total: rowRaw.off_duels_total ?? 0,
      off_duels_win_pct: rowRaw.off_duels_win_pct,

      crosses: rowRaw.crosses ?? 0,
      allcrosses: rowRaw.allcrosses ?? 0,
      cross_acc: rowRaw.cross_acc,
    };

    const matches = totals.matches || 0;

    const perMatch: any = { ...totals };
    const div = (v: any) =>
      matches > 0 && v !== null && v !== undefined ? Number(v) / matches : null;

    // объёмные метрики делим на матчи
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

    // ---- 2) Перцентили по лиге для радара ----

    let radarPercentiles: RadarPercentiles | null = null;
    let leagueDebug: any = null;

    if (leagueLabel) {
      const leagueSql = `
        WITH base AS (
          SELECT
            ums.team_id,
            ums.match_id,
            CASE
              WHEN UPPER(t.name) LIKE '%ПРЕМЬЕР%' OR UPPER(t.name) LIKE '% ПЛ%' THEN 'ПЛ'
              WHEN UPPER(t.name) LIKE '%ФНЛ%'  THEN 'ФНЛ'
              WHEN UPPER(t.name) LIKE '%ПФЛ%'  THEN 'ПФЛ'
              WHEN UPPER(t.name) LIKE '%ЛФЛ%'  THEN 'ЛФЛ'
              ELSE 'Прочие'
            END AS league_label,

            ums.goals,
            ums.goals_expected        AS xg,
            ums.kickedin,
            ums.kickedout,
            ums.allpasses,
            ums.completedpasses,
            ums.crosses,
            (ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS def_actions,
            ums.duels_air,
            ums.duels_air_win
          FROM tbl_users_match_stats ums
          JOIN tournament_match tm ON tm.id = ums.match_id
          JOIN tournament t        ON t.id  = tm.tournament_id
          WHERE (${seasonFilter})
        )
        SELECT
          team_id,
          COUNT(DISTINCT match_id) AS matches,
          CASE WHEN COUNT(DISTINCT match_id) > 0
            THEN SUM(goals) * 1.0 / COUNT(DISTINCT match_id)
            ELSE NULL
          END AS goals_per_match,
          CASE WHEN COUNT(DISTINCT match_id) > 0
            THEN SUM(kickedin + kickedout) * 1.0 / COUNT(DISTINCT match_id)
            ELSE NULL
          END AS shots_per_match,
          CASE WHEN COUNT(DISTINCT match_id) > 0
            THEN SUM(allpasses) * 1.0 / COUNT(DISTINCT match_id)
            ELSE NULL
          END AS passes_per_match,
          CASE WHEN COUNT(DISTINCT match_id) > 0
            THEN SUM(crosses) * 1.0 / COUNT(DISTINCT match_id)
            ELSE NULL
          END AS crosses_per_match,
          CASE WHEN COUNT(DISTINCT match_id) > 0
            THEN SUM(def_actions) * 1.0 / COUNT(DISTINCT match_id)
            ELSE NULL
          END AS def_actions_per_match,
          CASE WHEN SUM(allpasses) > 0
            THEN SUM(completedpasses) * 1.0 / SUM(allpasses)
            ELSE NULL
          END AS pass_acc,
          CASE WHEN SUM(duels_air) > 0
            THEN SUM(duels_air_win) * 1.0 / SUM(duels_air)
            ELSE NULL
          END AS aerial_pct
        FROM base
        WHERE league_label = ?
        GROUP BY team_id
      `;

      const leagueRowsRaw = await prisma.$queryRawUnsafe<any[]>(
        leagueSql,
        leagueLabel,
      );
      const leagueRows = toJSON<LeagueRow[]>(leagueRowsRaw);

      if (leagueRows.length > 0) {
        // считаем passes_per_shot и кладём в каждую строку
        const enriched: LeagueRow[] = leagueRows.map((r) => {
          const shots =
            r.shots_per_match === null || r.shots_per_match === undefined
              ? null
              : Number(r.shots_per_match as any);
          const passes =
            r.passes_per_match === null || r.passes_per_match === undefined
              ? null
              : Number(r.passes_per_match as any);

          const passes_per_shot =
            shots && shots > 0 && passes != null ? passes / shots : null;

          return { ...r, passes_per_shot };
        });

        // перцентили для нужной команды
        const goalsPct = computePercentile(
          enriched,
          "goals_per_match",
          teamId,
          false,
        );
        const shotsPct = computePercentile(
          enriched,
          "shots_per_match",
          teamId,
          false,
        );
        const passesPct = computePercentile(
          enriched,
          "passes_per_match",
          teamId,
          false,
        );
        const crossesPct = computePercentile(
          enriched,
          "crosses_per_match",
          teamId,
          false,
        );
        const defActionsPct = computePercentile(
          enriched,
          "def_actions_per_match",
          teamId,
          false,
        );
        const passAccPct = computePercentile(
          enriched,
          "pass_acc",
          teamId,
          false,
        );
        const aerialPct = computePercentile(
          enriched,
          "aerial_pct",
          teamId,
          false,
        );
        const passesPerShotPct = computePercentile(
          enriched,
          "passes_per_shot",
          teamId,
          true,
        );

        radarPercentiles = {
          goals: goalsPct,
          shots: shotsPct,
          passes: passesPct,
          passesPerShot: passesPerShotPct,
          defActions: defActionsPct,
          passAccPct,
          crosses: crossesPct,
          aerialPct,
        };

        leagueDebug = {
          leagueLabel,
          teamsInLeague: enriched.length,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      teamId,
      matches,
      totals,
      perMatch,
      scope,
      leagueLabel,
      radarPercentiles,
      debug: leagueDebug,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
