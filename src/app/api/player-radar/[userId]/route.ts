import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** ---------- Кластеры и метаданные ---------- */
type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB";

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

const SEASON_MIN = 18;                        // фильтр сезонов
const XG_EXPR = "s.goals_expected";          // поле xG в stats-таблице

// кандидаты таблиц
const MATCH_TABLES = ["tbl_matches", "matches", "team_matches", "tbl_team_matches"] as const;
const TOUR_TABLES  = ["tournament", "tournaments", "tbl_tournaments"] as const;

// кандидаты имён колонки с названием турнира
const TOUR_NAME_COLS = ["tournament_name", "name", "title", "league_name", "competition_name"] as const;

// кандидаты имени внешнего ключа из матчей в турнир
const TOUR_FK_COLS = ["tournament_id", "league_id", "competition_id"] as const;

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

/** Проверка: существует ли таблица */
async function hasTable(table: string) {
  const r = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'
    LIMIT 1
  `);
  return r.length > 0;
}

/** Найти первый столбец из candidates в таблице table */
async function findColumn(table: string, candidates: readonly string[]) {
  if (!(await hasTable(table))) return null;
  const cols = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${table}'
      AND COLUMN_NAME IN (${candidates.map(c => `'${c}'`).join(",")})
    LIMIT 1
  `);
  return cols[0]?.COLUMN_NAME ?? null;
}

/** Определяем таблицы и колонки для JOIN турнира */
async function detectTournamentJoin() {
  // 1) находим таблицу матчей
  let matchTable: string | null = null;
  for (const t of MATCH_TABLES) {
    if (await hasTable(t)) { matchTable = t; break; }
  }
  if (!matchTable) return { matchTable: null, tourTable: null, matchFk: null, tourNameExpr: null, joinSql: "", chosenTourNameCol: null } as const;

  // 2) находим fk в матчах
  const matchFk = await findColumn(matchTable, TOUR_FK_COLS);
  if (!matchFk) return { matchTable, tourTable: null, matchFk: null, tourNameExpr: null, joinSql: `LEFT JOIN ${matchTable} m ON m.id = s.match_id`, chosenTourNameCol: null } as const;

  // 3) находим таблицу турниров и колонку названия
  let tourTable: string | null = null;
  for (const t of TOUR_TABLES) {
    if (await hasTable(t)) { tourTable = t; break; }
  }
  if (!tourTable) {
    // хотя бы присоединим матчи (без названия турнира)
    return {
      matchTable,
      tourTable: null,
      matchFk,
      tourNameExpr: null,
      joinSql: `LEFT JOIN ${matchTable} m ON m.id = s.match_id`,
      chosenTourNameCol: null,
    } as const;
  }
  const tourNameCol = await findColumn(tourTable, TOUR_NAME_COLS);
  if (!tourNameCol) {
    return {
      matchTable,
      tourTable,
      matchFk,
      tourNameExpr: null,
      joinSql: `
        LEFT JOIN ${matchTable} m ON m.id = s.match_id
        LEFT JOIN ${tourTable} t ON t.id = m.${matchFk}
      `,
      chosenTourNameCol: null,
    } as const;
  }
  // всё найдено
  return {
    matchTable,
    tourTable,
    matchFk,
    tourNameExpr: `t.${tourNameCol}`,
    joinSql: `
      LEFT JOIN ${matchTable} m ON m.id = s.match_id
      LEFT JOIN ${tourTable} t ON t.id = m.${matchFk}
    `,
    chosenTourNameCol: tourNameCol,
  } as const;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const userIdNum = Number(params.userId);
    if (!Number.isFinite(userIdNum)) {
      return NextResponse.json({ ok: false, error: "bad userId" }, { status: 400 });
    }
    const wantDebug = new URL(req.url).searchParams.get("debug") === "1";

    // 1) текущая роль/кластер (через уже рабочую ручку)
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

    // 2) определяем источник турнира: таблицы и поля
    const tour = await detectTournamentJoin();
    const seasonExpr = tour.tourNameExpr ? `CAST(REGEXP_SUBSTR(${tour.tourNameExpr}, '[0-9]+') AS UNSIGNED)` : null;
    const OFFICIAL_FILTER = seasonExpr ? `AND (${seasonExpr} >= ${SEASON_MIN})` : "";

    // 3) коды ролей для кластера
    const roleCodes = CLUSTERS[cluster].map((c) => `'${c}'`).join(",");

    // 4) основной SQL (JOIN на матчи/турниры + фильтр 18+ сезонов, если возможно)
    const AGG_SQL = `
      WITH base AS (
        SELECT
          s.user_id,
          s.match_id,
          s.goals, s.assists,
          ${XG_EXPR} AS goal_expected,
          s.kicked, s.kickedin,
          s.passes        AS xa_part,
          s.allpasses, s.completedpasses, s.passes_rate,
          s.ipasses, s.pregoal_passes,
          s.allstockes, s.completedstockes,
          s.intercepts,
          s.allselection, s.selection,
          s.completedtackles,
          s.blocks,
          s.outs,
          s.outplayed, s.penalised_fails,
          s.duels_air, s.duels_air_win,
          s.crosses
          ${tour.tourNameExpr ? `, ${tour.tourNameExpr} AS tournament_name` : ""}
        FROM tbl_users_match_stats s
        JOIN tbl_field_positions fp ON fp.id = s.position_id
        ${tour.joinSql}
        WHERE s.user_id = ${userIdNum}
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

    // диагностика + короткий список турниров, реально попавших в расчёт
    let tournamentsDebug: Array<{ name: string; season: number | null }> = [];
    let tournamentsUsed: string[] | undefined;
    if (tour.tourNameExpr) {
      const SQL_TOURS = `
        SELECT DISTINCT
          ${tour.tourNameExpr} AS name,
          CAST(REGEXP_SUBSTR(${tour.tourNameExpr}, '[0-9]+') AS UNSIGNED) AS season
        FROM tbl_users_match_stats s
        JOIN tbl_field_positions fp ON fp.id = s.position_id
        ${tour.joinSql}
        WHERE s.user_id = ${userIdNum}
          AND fp.code IN (${roleCodes})
          ${OFFICIAL_FILTER}
        ORDER BY name
        LIMIT 100
      `;
      tournamentsDebug = await prisma.$queryRawUnsafe(SQL_TOURS);
      tournamentsUsed = tournamentsDebug.map(x => x.name);
    }

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
          matchTable: tour.matchTable,
          tourTable: tour.tourTable,
          matchFk: tour.matchFk,
          tourNameColumn: tour.chosenTourNameCol,
          seasonMin: SEASON_MIN,
          officialFilterApplied: Boolean(seasonExpr),
          tournaments: tournamentsDebug,
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
        matchTable: tour.matchTable,
        tourTable: tour.tourTable,
        matchFk: tour.matchFk,
        tourNameColumn: tour.chosenTourNameCol,
        seasonMin: SEASON_MIN,
        officialFilterApplied: Boolean(seasonExpr),
        tournaments: tournamentsDebug,
      } : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
