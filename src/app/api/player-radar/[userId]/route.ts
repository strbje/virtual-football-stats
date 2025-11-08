/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ----------------------------------------------------
// Константы и утилиты
// ----------------------------------------------------
const SEASON_MIN = 18;

// Официальные турниры (содержат «сезон» и номер >= 18)
const OFFICIAL_FILTER = `
  AND (
    t.name REGEXP 'сезон[^0-9]*([1-9][0-9]*)'
    AND CAST(REGEXP_SUBSTR(t.name, '([1-9][0-9]*)') AS UNSIGNED) >= ${SEASON_MIN}
  )
`;

// В твоей схеме xG хранится в goals_expected
const XG_EXPR = "ums.goals_expected";
const XG_COL  = "goals_expected";

// Кластеры амплуа (добавлен GK с ВР/ВРТ)
const CLUSTERS = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЛАП", "ПАП"],
  CM: ["ЦП", "ЛЦП", "ПЦП", "ЛОП", "ПОП", "ЦОП"],
  FM: ["ЛП", "ПП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВР", "ВРТ"],
} as const;

type ClusterKey = keyof typeof CLUSTERS;
type RoleCode = (typeof CLUSTERS)[ClusterKey][number];

// Наборы метрик для радара по кластерам (добавлен GK)
const RADAR_BY_CLUSTER: Record<ClusterKey, string[]> = {
  FW: ["goal_contrib", "xg_delta", "shots_on_target_pct", "creation", "dribble_pct", "pressing"],
  AM: ["xa", "pxa", "goal_contrib", "pass_acc", "dribble_pct", "pressing"],
  CM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct"],
  FM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct", "crosses", "goal_contrib"],
  CB: ["safety_coef", "def_actions", "tackle_success", "clearances", "pass_acc", "attack_participation", "aerial_pct", "beaten_rate"],
  GK: ["save_pct", "saves_avg", "intercepts", "passes", "clean_sheets_pct", "prevented_xg"],
};

// Лейблы (добавлены подписи для GK)
const LABELS: Record<string, string> = {
  goal_contrib: "Гол+пас",
  xg_delta: "Реализация xG",
  shots_on_target_pct: "Удары в створ %",
  creation: "Созидание",
  dribble_pct: "Дриблинг %",
  pressing: "Прессинг",
  xa: "xA",
  pxa: "pXA (пасы/0.5 xA)",
  pass_acc: "Точность пасов %",
  passes: "Пасы/матч",
  def_actions: "Защитные действия",
  beaten_rate: "Beaten Rate ↓",
  aerial_pct: "Верховые %",
  crosses: "Навесы/матч",
  safety_coef: "Кэф безопасности",
  tackle_success: "Отборы удачные %",
  clearances: "Выносы/матч",
  attack_participation: "Участие в атаке",

  // GK
  save_pct: "Сейвы %",
  saves_avg: "Сейвы/матч",
  clean_sheets_pct: "Сухие %",
  prevented_xg: "Предотв. xG",
};

// Инвертируемые метрики (меньше = лучше)
const INVERTED = new Set<string>(["pxa", "beaten_rate"]);

// Безопасная сериализация BigInt и т.п.
function toJSON<T = any>(v: any): T {
  return JSON.parse(
    JSON.stringify(v, (_, val) =>
      typeof val === "bigint" ? Number(val) : val
    )
  );
}
const safeNum = (v: any, d = 0) => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : d;
};

// Кластер по коду роли
function resolveClusterByRole(role: RoleCode | null): ClusterKey | null {
  if (!role) return null;
  const keys = Object.keys(CLUSTERS) as ClusterKey[];
  for (const k of keys) {
    if ((CLUSTERS[k] as readonly string[]).includes(role)) return k;
  }
  return null;
}

// Авто-детект модального амплуа по последним 30 матчам (без OFFICIAL-фильтра)
async function autoDetectRole(pr: PrismaClient, userId: number): Promise<RoleCode | null> {
  const rows = await pr.$queryRawUnsafe(`
    SELECT fp.code AS role_code
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON tm.id = ums.match_id
    LEFT  JOIN tbl_field_positions fp ON fp.id = ums.position_id
    WHERE ums.user_id = ${userId}
    ORDER BY tm.timestamp DESC
    LIMIT 30
  `);
  const counts = new Map<string, number>();
  for (const r of rows as any[]) {
    const code = String(r.role_code ?? "").trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCnt = -1;
  for (const [code, cnt] of counts) {
    if (cnt > bestCnt) { best = code; bestCnt = cnt; }
  }
  return (best as RoleCode) ?? null;
}

// ----------------------------------------------------
// SQL-билдеры
// ----------------------------------------------------

// Общий коHORT для пул-перцентилей (как в твоём рабочем файле; WHERE matches >= 30)
function buildCohortSQLCommon(roleCodesSQL: string): string {
  return `
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
        ums.crosses
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE fp.code IN (${roleCodesSQL})
        ${OFFICIAL_FILTER}
    ),
    per_user AS (
      SELECT
        user_id,
        CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
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
      GROUP BY user_id
    )
    SELECT
      user_id,
      (matches * 1.0)                                        AS matches,
      ((goals + assists) / NULLIF(matches,0)) * 1.0          AS goal_contrib,
      ((goals - xg) / NULLIF(matches,0)) * 1.0               AS xg_delta,
      (kickedin / NULLIF(kicked,0)) * 1.0                    AS shots_on_target_pct,
      ((pregoals + ipasses + 2*xa) / NULLIF(matches,0)) * 1.0 AS creation,
      (completedstockes / NULLIF(allstockes,0)) * 1.0        AS dribble_pct,
      ((intercepts + selection) / NULLIF(matches,0)) * 1.0   AS pressing,
      (xa / NULLIF(matches,0)) * 1.0                         AS xa_avg,
      (0.5 * allpasses / NULLIF(xa,0)) * 1.0                 AS pxa,
      (allpasses / NULLIF(matches,0)) * 1.0                  AS passes,
      (completedpasses / NULLIF(allpasses,0)) * 1.0          AS pass_acc,
      ((intercepts + selection + completedtackles + blocks) / NULLIF(matches,0)) * 1.0  AS def_actions,
      ((beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)) * 1.0   AS beaten_rate,
      (duels_air_win / NULLIF(duels_air,0)) * 1.0            AS aerial_pct,
      (crosses / NULLIF(matches,0)) * 1.0                    AS crosses_avg,
      (0.5*(completedpasses/NULLIF(allpasses,0))
       +0.3*(completedstockes/NULLIF(allstockes,0))
       +0.15*(duels_air_win/NULLIF(duels_air,0))
       +0.05*(selection/NULLIF(allselection,0))) * 1.0       AS safety_coef,
      (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
      (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
      ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
    FROM per_user
    WHERE matches >= 30
    LIMIT 20000
  `;
}

// Специальный коHORT для GK (WHERE matches >= 30)
function buildCohortSQLGK(): string {
  return `
    WITH base AS (
      SELECT
        ums.user_id,
        ums.match_id,
        ums.team_id,
        /* xG соперника за матч */
        COALESCE((
          SELECT SUM(u2.${XG_COL})
          FROM tbl_users_match_stats u2
          WHERE u2.match_id = ums.match_id
            AND u2.team_id <> ums.team_id
        ), 0) AS opp_xg,
        /* события GK */
        ums.saved,         -- сейвы
        ums.scored,        -- пропущенные
        ums.intercepts,    -- перехваты
        ums.allpasses,     -- пасы
        ums.dry            -- сухой (0/1)
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t        ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE fp.code IN ('ВР','ВРТ')
        ${OFFICIAL_FILTER}
    ),
    per_user AS (
      SELECT
        user_id,
        CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
        SUM(opp_xg)     AS opp_xg,
        SUM(scored)     AS conceded,
        SUM(saved)      AS saved,
        SUM(intercepts) AS intercepts,
        SUM(allpasses)  AS allpasses,
        SUM(dry)        AS dry_matches
      FROM base
      GROUP BY user_id
    )
    SELECT
      user_id,
      (matches * 1.0) AS matches,
      (saved / NULLIF(saved + conceded, 0)) * 1.0      AS save_pct,
      (saved / NULLIF(matches, 0)) * 1.0               AS saves_avg,
      (intercepts / NULLIF(matches, 0)) * 1.0          AS intercepts,
      (allpasses / NULLIF(matches, 0)) * 1.0           AS passes,
      (dry_matches / NULLIF(matches, 0)) * 1.0         AS clean_sheets_pct,
      ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0 AS prevented_xg
    FROM per_user
    WHERE matches >= 30
    LIMIT 20000
  `;
}

// ----------------------------------------------------
// API
// ----------------------------------------------------
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const url = new URL(req.url);
    const userIdStr = url.searchParams.get("userId") || params.userId;
    if (!userIdStr) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }
    const userId = Number(userIdStr);

    // Роль из query (?role=...), иначе авто-детект по последним 30 матчам
    const roleFromClient = url.searchParams.get("role");
    let currentRole: RoleCode | null = (roleFromClient as RoleCode) || null;
    if (!currentRole) currentRole = await autoDetectRole(prisma, userId);

    const cluster = resolveClusterByRole(currentRole);
    if (!currentRole || !cluster) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster: cluster ?? null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: !currentRole
          ? "Не удалось определить актуальное амплуа"
          : "Амплуа не входит в известные кластеры",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    // Список «официальных» турниров пользователя (для дебага; не ломал твою логику)
    const tournamentsAll = toJSON(await prisma.$queryRawUnsafe(`
      SELECT t.name AS name,
             CAST(REGEXP_SUBSTR(t.name, '([1-9][0-9]*)') AS UNSIGNED) AS season,
             COUNT(DISTINCT tm.id) AS matches
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN tournament t        ON t.id = tm.tournament_id
      WHERE ums.user_id = ${userId}
      GROUP BY t.id, t.name
      ORDER BY matches DESC
    `));

    const tournamentsOfficial = (tournamentsAll as any[]).filter((x) => {
  const s = Number(x.season);
  return Number.isFinite(s) && s >= SEASON_MIN;
});

    // ------------------------------------
    // 1) Пул коHORT для перцентилей
    // ------------------------------------
    const roleCodesSQL = CLUSTERS[cluster]
      .map(r => `'${r.replace(/'/g, "''")}'`)
      .join(",");

    const COHORT_SQL =
      cluster === "GK" ? buildCohortSQLGK() : buildCohortSQLCommon(roleCodesSQL);

    const cohortRows = toJSON(await prisma.$queryRawUnsafe(COHORT_SQL)) as any[];
    const cohortN = cohortRows.length;

    // ------------------------------------
    // 2) Агрегат конкретного игрока (как раньше)
    // ------------------------------------
    const AGG_SQL =
      cluster === "GK"
        ? `
          WITH base AS (
            SELECT
              ums.user_id,
              ums.match_id,
              ums.team_id,
              COALESCE((
                SELECT SUM(u2.${XG_COL})
                FROM tbl_users_match_stats u2
                WHERE u2.match_id = ums.match_id
                  AND u2.team_id <> ums.team_id
              ), 0) AS opp_xg,
              ums.saved, ums.scored,
              ums.intercepts, ums.allpasses, ums.dry
            FROM tbl_users_match_stats ums
            INNER JOIN tournament_match tm ON ums.match_id = tm.id
            INNER JOIN tournament t        ON tm.tournament_id = t.id
            LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
            WHERE ums.user_id = ${userId}
              AND fp.code IN ('ВР','ВРТ')
              ${OFFICIAL_FILTER}
          ),
          per_user AS (
            SELECT
              user_id,
              CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
              SUM(opp_xg)     AS opp_xg,
              SUM(scored)     AS conceded,
              SUM(saved)      AS saved,
              SUM(intercepts) AS intercepts,
              SUM(allpasses)  AS allpasses,
              SUM(dry)        AS dry_matches
            FROM base
            GROUP BY user_id
          )
          SELECT
            (matches * 1.0) AS matches,
            (saved / NULLIF(saved + conceded, 0)) * 1.0      AS save_pct,
            (saved / NULLIF(matches, 0)) * 1.0               AS saves_avg,
            (intercepts / NULLIF(matches, 0)) * 1.0          AS intercepts,
            (allpasses / NULLIF(matches, 0)) * 1.0           AS passes,
            (dry_matches / NULLIF(matches, 0)) * 1.0         AS clean_sheets_pct,
            ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0 AS prevented_xg
          FROM per_user
        `
        : `
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
              ums.crosses
            FROM tbl_users_match_stats ums
            INNER JOIN tournament_match tm ON ums.match_id = tm.id
            INNER JOIN tournament t ON tm.tournament_id = t.id
            LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
            WHERE ums.user_id = ${userId}
              AND fp.code IN (${roleCodesSQL})
              ${OFFICIAL_FILTER}
          ),
          per_user AS (
            SELECT
              CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
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
            (matches * 1.0)                                        AS matches,
            ((goals + assists) / NULLIF(matches,0)) * 1.0          AS goal_contrib,
            ((goals - xg) / NULLIF(matches,0)) * 1.0               AS xg_delta,
            (kickedin / NULLIF(kicked,0)) * 1.0                    AS shots_on_target_pct,
            ((pregoals + ipasses + 2*xa) / NULLIF(matches,0)) * 1.0 AS creation,
            (completedstockes / NULLIF(allstockes,0)) * 1.0        AS dribble_pct,
            ((intercepts + selection) / NULLIF(matches,0)) * 1.0   AS pressing,
            (xa / NULLIF(matches,0)) * 1.0                         AS xa_avg,
            (0.5 * allpasses / NULLIF(xa,0)) * 1.0                 AS pxa,
            (allpasses / NULLIF(matches,0)) * 1.0                  AS passes,
            (completedpasses / NULLIF(allpasses,0)) * 1.0          AS pass_acc,
            ((intercepts + selection + completedtackles + blocks) / NULLIF(matches,0)) * 1.0  AS def_actions,
            ((beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)) * 1.0   AS beaten_rate,
            (duels_air_win / NULLIF(duels_air,0)) * 1.0            AS aerial_pct,
            (crosses / NULLIF(matches,0)) * 1.0                    AS crosses_avg,
            (0.5*(completedpasses/NULLIF(allpasses,0))
             +0.3*(completedstockes/NULLIF(allstockes,0))
             +0.15*(duels_air_win/NULLIF(duels_air,0))
             +0.05*(selection/NULLIF(allselection,0))) * 1.0       AS safety_coef,
            (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
            (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
            ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
        `;

    const aggRows = toJSON(await prisma.$queryRawUnsafe(AGG_SQL)) as any[];
    const playerAgg = (aggRows?.[0] ?? {}) as any;
    const matchesCluster = safeNum(playerAgg.matches, 0);

    if (!matchesCluster || matchesCluster < 30 || cohortN === 0) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: tournamentsOfficial.map((x: any) => x.name),
        reason: "Недостаточно матчей в кластере (< 30), радар недоступен",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    // ------------------------------------
    // 3) Перцентили по набору кластера
    // ------------------------------------
    const metrics = RADAR_BY_CLUSTER[cluster];

    const radar = metrics.map((key) => {
      const val = safeNum(playerAgg[key], null);
      if (val === null) return { key, label: LABELS[key] ?? key, pct: null };

      // распределение по пулу
      const arr = cohortRows
        .map((r: any) => safeNum(r[key], null))
        .filter((x: any) => x !== null);

      if (!arr.length) return { key, label: LABELS[key] ?? key, pct: null };

      const rank = arr.reduce((acc: number, x: number) => acc + (x <= val ? 1 : 0), 0);
      let pct = Math.round((rank / arr.length) * 100);

      if (INVERTED.has(key)) pct = 100 - pct;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;

      return { key, label: LABELS[key] ?? key, pct };
    });

    return NextResponse.json({
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: tournamentsOfficial.map((x: any) => x.name),
      radar,
      debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
