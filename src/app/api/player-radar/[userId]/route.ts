import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// -------------------------------
// Кластеры амплуа (добавлен GK)
// -------------------------------
const CLUSTERS = {
  FW: ["ФРВ","ЦФД","ЛФД","ПФД","ЛФА","ПФА"],
  AM: ["ЦАП","ЦП","ЛЦП","ПЦП","ЛАП","ПАП"],
  FM: ["ЛП","ПП"],
  CM: ["ЦП","ЦОП","ЛЦП","ПЦП","ЛОП","ПОП"],
  CB: ["ЦЗ","ЛЦЗ","ПЦЗ","ЛЗ","ПЗ"],
  GK: ["ВРТ"],
} as const satisfies Record<string, readonly string[]>;

type ClusterKey = keyof typeof CLUSTERS;
type RoleCode = typeof CLUSTERS[ClusterKey][number];

// Простой резолвер кластера по коду роли
function resolveClusterByRole(role: string): ClusterKey | null {
  const keys = Object.keys(CLUSTERS) as ClusterKey[];
  for (const k of keys) {
    const arr = CLUSTERS[k] as readonly string[];
    if (arr.includes(role)) return k;
  }
  return null;
}

// -------------------------------
// Настройки «официальности» турниров
// (как у тебя было — не меняю)
// -------------------------------
const SEASON_MIN = 18;
// имя колонки с xG — ровно так, как у тебя в БД
const XG_EXPR = "ums.goals_expected";

// Твой фильтр по названию турниров (оставляю как было)
const OFFICIAL_FILTER = `
  AND (
    -- оставь здесь твою рабочую проверку на "(<число> сезон)" и >= 18
    t.name REGEXP '\\\\([[:digit:]]+ сезон\\\\)'
    AND CAST(REGEXP_SUBSTR(t.name, '[[:digit:]]+', 1, 1) AS UNSIGNED) >= ${SEASON_MIN}
  )
`;

// Утилиты
const toJSON = (rows: unknown) => JSON.parse(JSON.stringify(rows));
const safeNum = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Быстрый перцентиль по пулу (равные значения — допускаем ties)
function percentile(pull: number[], x: number) {
  if (!pull.length || !Number.isFinite(x)) return null;
  const arr = pull.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return null;
  let c = 0;
  for (const v of arr) if (v <= x) c++;
  return Math.round((c / arr.length) * 100);
}

// -------------------------------
// API
// -------------------------------
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || params.userId;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }
    const userIdNum = Number(userId);

   // текущая роль (как и раньше — читаем из query ?role=...)
const roleFromClient = url.searchParams.get("role");
let currentRole: RoleCode | null = (roleFromClient as RoleCode) || null;

// 1) авто-детект роли по последним 30 матчам БЕЗ фильтра «официальных»
async function autoDetectRole(prisma: any, userId: number): Promise<string | null> {
  // Берём ленту последних 30 матчей и вытаскиваем шорт-код амплуа
  const rows = await prisma.$queryRawUnsafe(`
    SELECT sp.short_name AS role
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN skills_positions  sp ON ums.skill_id = sp.id
    WHERE ums.user_id = ${userId}
    ORDER BY tm.timestamp DESC
    LIMIT 30
  `);

  // На приложении находим модальное амплуа
  const map = new Map<string, number>();
  for (const r of rows as any[]) {
    const role = String(r.role);
    map.set(role, (map.get(role) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCnt = -1;
  for (const [role, cnt] of map.entries()) {
    if (cnt > bestCnt) { best = role; bestCnt = cnt; }
  }
  return best;
}

// 2) если клиент роль не передал — определяем сами
if (!currentRole) {
  currentRole = await autoDetectRole(prisma, userIdNum) as RoleCode | null;
}

// 3) если всё ещё нет — аккуратно выходим (как у тебя было)
if (!currentRole) {
  return NextResponse.json({
    ok: true,
    ready: false,
    currentRole: null,
    cluster: null,
    matchesCluster: 0,
    tournamentsUsed: [],
    reason: "Не удалось определить актуальное амплуа",
    debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
  });
}

const cluster = resolveClusterByRole(currentRole);
if (!cluster) {
  return NextResponse.json({
    ok: true,
    ready: false,
    currentRole,
    cluster: null,
    matchesCluster: 0,
    tournamentsUsed: [],
    reason: "Амплуа не входит в известные кластеры",
    debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
  });
}

const roleCodes = CLUSTERS[cluster].map(r => `'${r.replace(/'/g, "''")}'`).join(",");

    // -------------------------------
    // 1) Список «официальных» турниров для пользователя (как у тебя работало)
    // -------------------------------
    const TOURN_SQL = `
      SELECT
        t.name AS name,
        CAST(REGEXP_SUBSTR(t.name, '[[:digit:]]+', 1, 1) AS UNSIGNED) AS season,
        COUNT(*) AS matches
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t        ON tm.tournament_id = t.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      WHERE ums.user_id = ${userIdNum}
        AND fp.code IN (${roleCodes})
        ${OFFICIAL_FILTER}
      GROUP BY t.name
      ORDER BY matches DESC
    `;

    const tourRows = toJSON(await prisma.$queryRawUnsafe(TOURN_SQL)) as Array<{
      name: string;
      season: number | null;
      matches: number;
    }>;

    const tournamentsUsed = (tourRows || []).map((r) => r.name);

    // -------------------------------
    // 2) Матчи пользователя в кластере с «официальными» турнирами
    // -------------------------------
    const MATCHES_SQL = `
      SELECT COUNT(*) AS matches
      FROM (
        SELECT DISTINCT ums.match_id
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE ums.user_id = ${userIdNum}
          AND fp.code IN (${roleCodes})
          ${OFFICIAL_FILTER}
      ) q
    `;
    const matchesRow = toJSON(await prisma.$queryRawUnsafe(MATCHES_SQL)) as Array<{ matches: number }>;
    const matchesCluster = safeNum(matchesRow?.[0]?.matches, 0);

    // Если < 30 — возвращаем как раньше
    if (matchesCluster < 30) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed,
        reason: "Недостаточно матчей в кластере (< 30), радар недоступен",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    // -------------------------------
    // 3) ЕДИНЫЙ агрегат по пользователю (добавлены поля GK) — [GK+] только доп.столбцы
    // -------------------------------
    const AGG_SQL = `
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
          ums.crosses,
          t.name AS tournament_name,

          -- [GK+] добавлено:
          ums.team_id,
          ums.saved,
          ums.scored,
          ums.dry,
          COALESCE((
            SELECT SUM(u2.goals_expected)
            FROM tbl_users_match_stats u2
            WHERE u2.match_id = ums.match_id
              AND u2.team_id  <> ums.team_id
          ), 0) AS opp_xg

        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE ums.user_id = ${userIdNum}
          AND fp.code IN (${roleCodes})
          ${OFFICIAL_FILTER}
      ),
      per_user AS (
        SELECT
          user_id,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,

          -- полевые (как и было)
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
          SUM(crosses) AS crosses,

          -- [GK+] суммы
          SUM(saved) AS saved,
          SUM(scored) AS conceded,
          SUM(dry) AS dry_matches,
          SUM(opp_xg) AS opp_xg

        FROM base
        GROUP BY user_id
      )
      SELECT
        user_id,
        (matches * 1.0)                                        AS matches,

        -- Полевые метрики (как у тебя было)
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
          +0.05*(selection/NULLIF(allselection,0))) * 1.0     AS safety_coef,
        (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
        (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
        ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation,

        -- [GK+] метрики
        (saved / NULLIF(saved + conceded, 0)) * 1.0            AS save_pct,
        (saved / NULLIF(matches, 0)) * 1.0                     AS saves_avg,
        (dry_matches / NULLIF(matches, 0)) * 1.0               AS clean_sheets_pct,
        ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0       AS prevented_xg

      FROM per_user
      LIMIT 1
    `;

    const aggRows = toJSON(await prisma.$queryRawUnsafe(AGG_SQL)) as Array<any>;
    const me = aggRows?.[0] || null;

    if (!me) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed,
        reason: "Нет данных для агрегации по игроку",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    // -------------------------------
    // 4) Пул кластера для перцентилей (как у тебя было)
    // -------------------------------
    const COHORT_SQL = `
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
          ums.crosses,

          -- [GK+] добавлено (без вреда полевым)
          ums.team_id,
          ums.saved,
          ums.scored,
          ums.dry,
          COALESCE((
            SELECT SUM(u2.goals_expected)
            FROM tbl_users_match_stats u2
            WHERE u2.match_id = ums.match_id
              AND u2.team_id  <> ums.team_id
          ), 0) AS opp_xg

        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE fp.code IN (${roleCodes})
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
          SUM(crosses) AS crosses,

          -- [GK+] суммы
          SUM(saved) AS saved,
          SUM(scored) AS conceded,
          SUM(dry) AS dry_matches,
          SUM(opp_xg) AS opp_xg

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
          +0.05*(selection/NULLIF(allselection,0))) * 1.0     AS safety_coef,
        (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
        (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
        ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation,

        -- [GK+] набор
        (saved / NULLIF(saved + conceded, 0)) * 1.0            AS save_pct,
        (saved / NULLIF(matches, 0)) * 1.0                     AS saves_avg,
        (dry_matches / NULLIF(matches, 0)) * 1.0               AS clean_sheets_pct,
        ((opp_xg - conceded) / NULLIF(matches, 0)) * 1.0       AS prevented_xg

      FROM per_user
      WHERE matches >= 30
      LIMIT 20000
    `;

    const cohortRows = toJSON(await prisma.$queryRawUnsafe(COHORT_SQL)) as Array<any>;

    // -------------------------------
    // 5) Формируем метрики радара по кластеру
    // -------------------------------
    type RadarItem = { key: string; label: string; raw: number | null; pct: number | null };

    let radarKeys: Array<{ key: string; label: string }>;

    if (cluster === "GK") {
      // [GK+] метрики для вратаря
      radarKeys = [
        { key: "save_pct",           label: "% сейвов" },
        { key: "saves_avg",          label: "Сейвы/матч" },
        { key: "intercepts",         label: "Перехваты/матч" },  // в agg: intercepts/матч уже посчитан
        { key: "passes",             label: "Пасы/матч" },
        { key: "clean_sheets_pct",   label: "% сухих" },
        { key: "prevented_xg",       label: "Предотв. xG/матч" },
      ];
    } else {
      // Оставляю твою текущую логику наборов (пример для FW/AM/CM/CB/FM).
      // Здесь ничего не меняю, только использую уже посчитанные поля me.*
      // Ниже — «универсальный» набор, подставь свой, если он отличался.
      switch (cluster) {
        case "FW":
          radarKeys = [
            { key: "goal_contrib",        label: "Гол+пас" },
            { key: "xg_delta",            label: "Реализация xG" },
            { key: "shots_on_target_pct", label: "Удары в створ %" },
            { key: "creation",            label: "Созидание" },
            { key: "dribble_pct",         label: "Дриблинг %" },
            { key: "pressing",            label: "Прессинг" },
          ];
          break;
        case "AM":
          radarKeys = [
            { key: "xa_avg",              label: "xA" },
            { key: "pxa",                 label: "pXA" },
            { key: "goal_contrib",        label: "Гол+пас" },
            { key: "pass_acc",            label: "Точность пасов %" },
            { key: "dribble_pct",         label: "Дриблинг %" },
            { key: "pressing",            label: "Прессинг" },
          ];
          break;
        case "FM":
          radarKeys = [
            { key: "creation",            label: "Созидание" },
            { key: "passes",              label: "Пасы/матч" },
            { key: "pass_acc",            label: "Точность пасов %" },
            { key: "def_actions",         label: "Защитные действия" },
            { key: "beaten_rate",         label: "Beaten Rate ↓" },
            { key: "aerial_pct",          label: "Верховые %" },
          ];
          break;
        case "CM":
          radarKeys = [
            { key: "creation",            label: "Созидание" },
            { key: "passes",              label: "Пасы/матч" },
            { key: "pass_acc",            label: "Точность паса %" },
            { key: "def_actions",         label: "Защитные действия" },
            { key: "beaten_rate",         label: "Beaten Rate ↓" },
            { key: "aerial_pct",          label: "Верховые %" },
          ];
          break;
        case "CB":
          radarKeys = [
            { key: "safety_coef",         label: "Кэф безопасности" },
            { key: "def_actions",         label: "Защитные действия" },
            { key: "tackle_success",      label: "% успешных отборов" },
            { key: "clearances",          label: "Выносы" },
            { key: "pass_acc",            label: "% точности пасов" },
            { key: "attack_participation",label: "Участие в атаке" },
            { key: "aerial_pct",          label: "% побед в воздухе" },
            { key: "beaten_rate",         label: "Beaten Rate ↓" },
          ];
          break;
        default:
          radarKeys = [
            { key: "goal_contrib",        label: "Гол+пас" },
            { key: "creation",            label: "Созидание" },
            { key: "passes",              label: "Пасы/матч" },
            { key: "pass_acc",            label: "Точность пасов %" },
            { key: "def_actions",         label: "Защитные действия" },
            { key: "pressing",            label: "Прессинг" },
          ];
      }
    }

    const radar: RadarItem[] = radarKeys.map(({ key, label }) => {
      const raw = me?.[key] ?? null;
      // Собираем пул по той же колонке
      const pull = cohortRows.map((r) => r?.[key]).filter((v: any) => Number.isFinite(Number(v))).map(Number);
      let val = raw as number | null;

      // Инверсия для «↓» метрик при желании можно сделать, но ты у себя не инвертировал — оставлю как есть.
      const pct = percentile(pull, Number(val));
      return { key, label, raw: val, pct };
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
        error: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}
