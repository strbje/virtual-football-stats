/* src/app/api/player-radar/[userId]/route.ts
 * Основано на вашем рабочем файле + правки под GK и устойчивость.
 */

import { NextResponse } from "next/server";

/** ====== КОНСТАНТЫ / ТИПЫ ====== */

type ClusterKey = "FW" | "AM" | "CM" | "FM" | "CB" | "GK";

/** Коды позиций из tbl_field_positions.fp.code */
export type RoleCode =
  | "ФРВ" | "ЦФД" | "ЛФД" | "ПФД"
  | "ЛФА" | "ПФА"
  | "ЦАП" | "ЛАП" | "ПАП"
  | "ЛП"  | "ПП"
  | "ЦП"  | "ЛЦП" | "ПЦП"
  | "ЦОП" | "ЛОП" | "ПОП"
  | "ЦЗ"  | "ЛЦЗ" | "ПЦЗ"
  | "ЛЗ"  | "ПЗ"
  | "ВР"; 

const SEASON_MIN = 18;

/** Кластеры → наборы ролей (fp.code) */
const CLUSTERS: Record<ClusterKey, RoleCode[]> = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЛАП", "ПАП"],
  CM: ["ЦП", "ЛЦП", "ПЦП"],
  FM: ["ЛП", "ПП", "ЦОП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВР"], 
} as const;

/** Алиасы входной роли (из query) к RoleCode */
const ROLE_ALIASES: Record<string, RoleCode> = {
  "ВРТ": "ВР", // исторический алиас
  "НАП": "ФРВ", // на всякий случай, если с фронта придёт кластерная метка
};

/** Метрики радара по кластерам (алиасы из SELECT) */
const RADAR_BY_CLUSTER = {
  FW: ["goal_contrib", "xg_delta", "shots_on_target_pct", "creation", "dribble_pct", "pressing"] as const,
  AM: ["xa_avg", "pxa", "goal_contrib", "pass_acc", "dribble_pct", "pressing"] as const,
  CM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct"] as const,
  FM: ["creation", "passes", "pass_acc", "def_actions", "beaten_rate", "aerial_pct", "crosses", "goal_contrib"] as const,
  CB: ["safety_coef", "def_actions", "tackle_success", "clearances", "pass_acc", "attack_participation", "aerial_pct", "beaten_rate"] as const,
  GK: ["save_pct", "saves_avg", "intercepts", "passes", "clean_sheets_pct", "prevented_xg"] as const,
} as const;

/** Подписи для метрик радара */
const LABELS: Record<string, string> = {
  goal_contrib: "Гол+пас",
  xg_delta: "Реализация xG",
  shots_on_target_pct: "Удары в створ %",
  creation: "Созидание",
  dribble_pct: "Дриблинг%",
  pressing: "Прессинг",

  xa_avg: "xA/",
  pxa: "pXA",
  passes: "Пасы",
  pass_acc: "Точность паса %",
  def_actions: "Защитные действия",
  beaten_rate: "Beaten Rate ↓",
  aerial_pct: "Воздух %",

  crosses: "Навесы",
  safety_coef: "Кэф безопасности",
  tackle_success: "Отборы %",
  clearances: "Выносы",
  attack_participation: "Участие в атаке",

  save_pct: "Сейвы %",
  saves_avg: "Сейвы",
  clean_sheets_pct: "Сухие %",
  prevented_xg: "Предотвр. xG",
  intercepts: "Перехваты",
};

/** Метрики, где меньше — лучше (инвертировать перцентиль) */
const INVERTED = new Set<string>(["pxa", "beaten_rate"]);

/** Поле xG в БД (у вас есть goals_expected) */
const XG_EXPR = "ums.goals_expected";

/** Единый OFFICIAL-фильтр (вставляется в WHERE) */
const OFFICIAL_FILTER = `
  AND (
    t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
    AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}
  )
`;

/** ====== УТИЛИТЫ ====== */

function normalizeRole(r: string | null): RoleCode | null {
  if (!r) return null;
  const t = r.trim().toUpperCase();
  return (ROLE_ALIASES[t] ?? t) as RoleCode;
}

function resolveClusterByRole(role: RoleCode | null): ClusterKey | null {
  if (!role) return null;
  const keys = Object.keys(CLUSTERS) as ClusterKey[];
  for (const k of keys) {
    if (CLUSTERS[k].includes(role)) return k;
  }
  return null;
}

/** Безопасная конвертация BigInt/unknown → plain JSON */
function toJSON<T = any>(x: unknown): T {
  return JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}
const numOrNull = (v: any): number | null => (v === null || v === undefined ? null : Number(v));
const safeNum = (v: any, d: number = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Prisma клиент — берём так, как у вас подключено в проекте */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/** ====== АВТОДЕТЕКТ РОЛИ ЗА ПОСЛЕДНИЕ 30 ====== */
async function autoDetectRole(prisma: PrismaClient, userId: number): Promise<RoleCode | null> {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT fp.code AS role_code
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
    WHERE ums.user_id = ${userId} and fp.code IN (${roleCodesSQL})
        ${OFFICIAL_FILTER}
    ORDER BY tm.timestamp DESC
    LIMIT 30
  `);
  const map = new Map<string, number>();
  for (const r of (rows as any[])) {
    const code = String(r.role_code ?? "").trim();
    if (!code) continue;
    map.set(code, (map.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCnt = -1;
  for (const [code, cnt] of map.entries()) {
    if (cnt > bestCnt) { best = code; bestCnt = cnt; }
  }
  return (best ?? null) as RoleCode | null;
}

/** ====== SQL-БИЛДЕРЫ ====== */

/** Пул сравнения (не GK) — ≥30 матчей */
function buildCohortSQLCommon(roleCodesSQL: string) {
  return `
    WITH base AS (
      SELECT
        ums.user_id,
        ums.match_id,

        ${XG_EXPR} AS goal_expected,
        ums.goals, ums.assists,
        ums.kicked, ums.kickedin,
        ums.passes        AS xa_part,
        ums.allpasses, ums.completedpasses,
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
      (crosses / NULLIF(matches,0)) * 1.0                    AS crosses,
      (0.5*(completedpasses/NULLIF(allpasses,0))
       +0.3*(completedstockes/NULLIF(allstockes,0))
       +0.15*(duels_air_win/NULLIF(duels_air,0))
       +0.05*(selection/NULLIF(allselection,0))) * 1.0        AS safety_coef,
      (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
      (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
      ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
    FROM per_user
    WHERE matches >= 30
    LIMIT 20000
  `;
}

/** Пул сравнения (GK) — ≥30 матчей */
function buildCohortSQLGK() {
  return `
    WITH base AS (
      SELECT
        ums.user_id,
        ums.match_id,
        ums.team_id,

        COALESCE((
          SELECT SUM(u2.goals_expected)
          FROM tbl_users_match_stats u2
          WHERE u2.match_id = ums.match_id
            AND u2.team_id <> ums.team_id
        ), 0) AS opp_xg,

        ums.saved,
        ums.scored,
        ums.intercepts,
        ums.allpasses,
        ums.dry

      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t        ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE fp.code IN ('ВР')
        ${OFFICIAL_FILTER}
    ),
    per_user AS (
      SELECT
        user_id,
        CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
        SUM(opp_xg)      AS opp_xg,
        SUM(scored)      AS conceded,
        SUM(saved)       AS saved,
        SUM(intercepts)  AS intercepts,
        SUM(allpasses)   AS allpasses,
        SUM(dry)         AS dry_matches
      FROM base
      GROUP BY user_id
    )
    SELECT
      user_id,
      (matches * 1.0) AS matches,
      (saved / NULLIF(saved + conceded, 0)) * 1.0 AS save_pct,
      (saved / NULLIF(matches, 0)) * 1.0          AS saves_avg,
      (intercepts / NULLIF(matches, 0)) * 1.0      AS intercepts,
      (allpasses / NULLIF(matches, 0)) * 1.0       AS passes,
      (dry_matches / NULLIF(matches, 0)) * 1.0     AS clean_sheets_pct,
      ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0 AS prevented_xg
    FROM per_user
    WHERE matches >= 30
    LIMIT 20000
  `;
}

/** Агрегат текущего игрока (не GK) — БЕЗ порога 30 */
function buildAggSQLCommon(userId: number, roleCodesSQL: string) {
  return `
    WITH base AS (
      SELECT
        ums.user_id,
        ums.match_id,

        ${XG_EXPR} AS goal_expected,
        ums.goals, ums.assists,
        ums.kicked, ums.kickedin,
        ums.passes        AS xa_part,
        ums.allpasses, ums.completedpasses,
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
      (crosses / NULLIF(matches,0)) * 1.0                    AS crosses,
      (0.5*(completedpasses/NULLIF(allpasses,0))
       +0.3*(completedstockes/NULLIF(allstockes,0))
       +0.15*(duels_air_win/NULLIF(duels_air,0))
       +0.05*(selection/NULLIF(allselection,0))) * 1.0        AS safety_coef,
      (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
      (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
      ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
    FROM per_user
    LIMIT 1
  `;
}

/** Агрегат текущего игрока (GK) — БЕЗ порога 30 */
function buildAggSQLGK(userId: number) {
  return `
    WITH base AS (
      SELECT
        ums.user_id,
        ums.match_id,
        ums.team_id,

        COALESCE((
          SELECT SUM(u2.goals_expected)
          FROM tbl_users_match_stats u2
          WHERE u2.match_id = ums.match_id
            AND u2.team_id <> ums.team_id
        ), 0) AS opp_xg,

        ums.saved,
        ums.scored,
        ums.intercepts,
        ums.allpasses,
        ums.dry

      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t        ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE ums.user_id = ${userId}
        AND fp.code IN ('ВР')
        ${OFFICIAL_FILTER}
    ),
    per_user AS (
      SELECT
        user_id,
        CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
        SUM(opp_xg)      AS opp_xg,
        SUM(scored)      AS conceded,
        SUM(saved)       AS saved,
        SUM(intercepts)  AS intercepts,
        SUM(allpasses)   AS allpasses,
        SUM(dry)         AS dry_matches
      FROM base
      GROUP BY user_id
    )
    SELECT
      user_id,
      (matches * 1.0) AS matches,
      (saved / NULLIF(saved + conceded, 0)) * 1.0 AS save_pct,
      (saved / NULLIF(matches, 0)) * 1.0          AS saves_avg,
      (intercepts / NULLIF(matches, 0)) * 1.0      AS intercepts,
      (allpasses / NULLIF(matches, 0)) * 1.0       AS passes,
      (dry_matches / NULLIF(matches, 0)) * 1.0     AS clean_sheets_pct,
      ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0 AS prevented_xg
    FROM per_user
    LIMIT 1
  `;
}

/** ====== API ====== */
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const url = new URL(req.url);
    const userIdRaw = url.searchParams.get("userId") || params.userId;
    if (!userIdRaw) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }
    const userId = Number(userIdRaw);

    // 0) роль из query + нормализация
    const roleFromClient = url.searchParams.get("role");
    let currentRole: RoleCode | null = normalizeRole(roleFromClient);

    // 1) если роль не передали — авто-детект по последним 30 матчам (без офф. фильтра)
    if (!currentRole) {
      currentRole = await autoDetectRole(prisma, userId);
    }

    const cluster = resolveClusterByRole(currentRole);
    if (!currentRole || !cluster) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole: currentRole ?? null,
        cluster: cluster ?? null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: "Не удалось определить актуальное амплуа",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    const roleCodesSQL = CLUSTERS[cluster].map(r => `'${r.replace(/'/g, "''")}'`).join(",");

    // 2) список официальных турниров пользователя (для debug)
    const tournamentsRows = toJSON(await prisma.$queryRawUnsafe(`
      SELECT
        t.name AS name,
        CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) AS season,
        COUNT(*) AS matches
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t        ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE ums.user_id = ${userId}
        AND fp.code IN (${roleCodesSQL})
        ${OFFICIAL_FILTER}
      GROUP BY t.name
      ORDER BY season, name
    `)) as any[];

    const tournamentsUsed = tournamentsRows.map(r => String(r.name));

    // 3) пул сравнения
    const COHORT_SQL = cluster === "GK" ? buildCohortSQLGK() : buildCohortSQLCommon(roleCodesSQL);
    const cohortRows = toJSON(await prisma.$queryRawUnsafe(COHORT_SQL)) as any[];
    const cohortN = cohortRows.length;

    // 4) агрегат игрока
    const AGG_SQL = cluster === "GK" ? buildAggSQLGK(userId) : buildAggSQLCommon(userId, roleCodesSQL);
    const aggRows = toJSON(await prisma.$queryRawUnsafe(AGG_SQL)) as any[];
    const playerAgg = (aggRows?.[0] ?? {}) as any;
    const matchesCluster = safeNum(playerAgg.matches, 0);

    if (!cohortN) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed,
        reason: "Недостаточно пула для перцентилей (нет игроков с ≥30 матчей)",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    // 5) расчёт перцентилей
    const metrics = RADAR_BY_CLUSTER[cluster] as readonly string[];

    const radar = metrics.map((key) => {
      const val = numOrNull(playerAgg[key]);
      if (val === null) return { key, label: LABELS[key] ?? key, pct: null };

      const arr = cohortRows
        .map((r: any) => numOrNull(r[key]))
        .filter((x: number | null): x is number => x !== null)
        .sort((a, b) => a - b);

      if (!arr.length) return { key, label: LABELS[key] ?? key, pct: null };

      // позиция значения в отсортированном массиве
      let idx = 0;
      while (idx < arr.length && arr[idx] <= val) idx++;
      let pct = Math.round((idx / arr.length) * 100);

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
      tournamentsUsed,
      radar,
      debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
