import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// === Константы / кластеры (без изменений вашей логики) ===
const SEASON_MIN = 18;

// Фильтр «официальных» турниров: в названии есть слово "сезон" и номер >= 18
// Оставляю как у вас было — через проверку в приложении после выборки.
const OFFICIAL_FILTER_SQL = ""; // фильтрации в WHERE нет — фильтруем позже по названию

type RoleCode =
  | "ФРВ" | "ЦФД" | "ЛФД" | "ПФД" | "ЛФА" | "ПФА"
  | "ЦАП" | "ЦП" | "ЛЦП" | "ПЦП" | "ЛАП" | "ПАП"
  | "ЛП" | "ПП"
  | "ЦОП" | "ЛОП" | "ПОП"
  | "ЦЗ" | "ЛЦЗ" | "ПЦЗ" | "ЛЗ" | "ПЗ"
  | "ВРТ";

type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB" | "GK";

const CLUSTERS: Record<ClusterKey, RoleCode[]> = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЦП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],                           
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВРТ"],
};

function resolveClusterByRole(role: RoleCode | null): ClusterKey | null {
  if (!role) return null;
  const keys = Object.keys(CLUSTERS) as ClusterKey[];
  for (const k of keys) {
    if (CLUSTERS[k].includes(role)) return k;
  }
  return null;
}

// === [BIGINT FIX] универсальный нормализатор результатов raw-запросов ===
function rowsToJSON<T = any>(rows: any): T {
  return JSON.parse(
    JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// Маленький helper для безопасного number
const n = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// === Авто-детект роли по последним 30 матчам (без сезонного фильтра) ===
async function autoDetectRole(prisma: any, userId: number): Promise<RoleCode | null> {
  const rows = JSON.parse(JSON.stringify(
    await prisma.$queryRawUnsafe(`
      SELECT
        CASE
          WHEN fp.code IS NOT NULL AND fp.code <> '' THEN fp.code
          WHEN sp.short_name = 'ВРТ' THEN 'ВРТ'
          ELSE NULL
        END AS role_code
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
      LEFT  JOIN skills_positions    sp ON ums.skill_id     = sp.id
      WHERE ums.user_id = ${userId}
      ORDER BY tm.timestamp DESC
      LIMIT 30
    `),
    (_k, v) => (typeof v === "bigint" ? Number(v) : v)
  )) as Array<{ role_code: string | null }>;

  const counts = new Map<string, number>();
  for (const r of rows) {
    const code = String(r.role_code ?? "").trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  let best: string | null = null, bestCnt = -1;
  for (const [code, cnt] of counts) {
    if (cnt > bestCnt) { best = code; bestCnt = cnt; }
  }
  return (best as RoleCode) ?? null;
}

// === Вспомогательное: проверка «официальности» турнира по названию ===
function parseSeasonFromName(name: string): number | null {
  // ищем «(NN сезон)» и берём NN
  const m = name.match(/(?:\(|\s)(\d{1,3})\s*сезон\)?/i);
  if (!m) return null;
  return Number(m[1]);
}
function isOfficialTournament(name: string): boolean {
  const s = parseSeasonFromName(name);
  return s !== null && s >= SEASON_MIN;
}

// === API ===
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const url = new URL(req.url);
    const userIdStr = url.searchParams.get("userId") || params.userId;
    if (!userIdStr) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }
    const userId = Number(userIdStr);

    // 1) роль: из ?role=... или авто-детект
    const roleFromClient = url.searchParams.get("role");
let currentRole: RoleCode | null = (roleFromClient as RoleCode) || null;
if (!currentRole) currentRole = await autoDetectRole(prisma, userIdNum);

    const cluster = resolveClusterByRole(currentRole);
    if (!currentRole || !cluster) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole: currentRole ?? null,
        cluster: cluster ?? null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: !currentRole
          ? "Не удалось определить актуальное амплуа"
          : "Амплуа не входит в известные кластеры",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    const roleCodesSQL = CLUSTERS[cluster].map(r => `'${r.replace(/'/g, "''")}'`).join(",");

    // 2) список турниров пользователя (как раньше), потом фильтр на «официальные»
    const TOUR_SQL = `
      SELECT
        t.name AS tournament_name,
        CAST(COUNT(DISTINCT ums.match_id) AS UNSIGNED) AS matches  -- [CAST]
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t        ON tm.tournament_id = t.id
      WHERE ums.user_id = ${userId}
      GROUP BY t.name
      ORDER BY matches DESC
    `;
    const tourRowsRaw = await prisma.$queryRawUnsafe(TOUR_SQL);
    const tourRows = rowsToJSON<any[]>(tourRowsRaw); // [BIGINT FIX]

    const tournamentsAll = tourRows.map(r => ({
      name: String(r.tournament_name),
      season: parseSeasonFromName(String(r.tournament_name)),
      matches: n(r.matches),
    }));

    const tournamentsOfficial = tournamentsAll.filter(r => isOfficialTournament(r.name));
    if (!tournamentsOfficial.length) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: "Нет официальных турниров (содержат «сезон» и номер ≥ 18)",
        debug: {
          seasonMin: SEASON_MIN,
          officialFilterApplied: true,
          tournamentsAll,
        },
      });
    }

    // 3) агрегат по игроку под радар (как у вас было; фильтруем по кластерам роли)
    const AGG_SQL = `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,
          ums.goals_expected AS goal_expected,
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
          t.name AS tournament_name
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE ums.user_id = ${userId}
          AND fp.code IN (${roleCodesSQL})
      ),
      filtered AS (
        SELECT *
        FROM base
        WHERE tournament_name IS NOT NULL
          AND ${tournamentsOfficial.map(t => `tournament_name = '${t.name.replace(/'/g,"''")}'`).join(" OR ")}
      ),
      per_user AS (
        SELECT
          user_id,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,  -- [CAST]
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
        FROM filtered
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
        +0.05*(selection/NULLIF(allselection,0))) * 1.0        AS safety_coef,
        (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
        (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
        ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
      FROM per_user
      LIMIT 1
    `;
    const aggRowRaw = await prisma.$queryRawUnsafe(AGG_SQL);
    const aggRows = rowsToJSON<any[]>(aggRowRaw); // [BIGINT FIX]
    const agg = aggRows[0] || null;

    // 4) пул для перцентилей (все игроки кластера, матчи ≥ 30)
    const COHORT_SQL = `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,
          ums.goals_expected AS goal_expected,
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
          t.name AS tournament_name
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE fp.code IN (${roleCodesSQL})
      ),
      filtered AS (
        SELECT *
        FROM base
        WHERE tournament_name IS NOT NULL
          AND ${tournamentsOfficial.map(t => `tournament_name = '${t.name.replace(/'/g,"''")}'`).join(" OR ")}
      ),
      per_user AS (
        SELECT
          user_id,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,  -- [CAST]
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
        FROM filtered
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
        +0.05*(selection/NULLIF(allselection,0))) * 1.0        AS safety_coef,
        (selection / NULLIF(allselection,0)) * 1.0             AS tackle_success,
        (outs / NULLIF(matches,0)) * 1.0                       AS clearances,
        ((ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0)) * 1.0 AS attack_participation
      FROM per_user
      WHERE matches >= 30
      LIMIT 20000
    `;
    const cohortRows = rowsToJSON<any[]>(await prisma.$queryRawUnsafe(COHORT_SQL)); // [BIGINT FIX]

    // 5) если матчей у игрока < 30 — не строим радар
    const matchesCluster = n(agg?.matches, 0);
    if (!matchesCluster || matchesCluster < 30) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: tournamentsOfficial.map(t => t.name),
        reason: "Недостаточно матчей в кластере (< 30), радар недоступен",
        debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
      });
    }

    // 6) собрать радар (ваши метрики; процентили считаем по cohortRows)
    // Пример для FW/AM/FM/CM/CB — оставляю как у вас.
    // Ниже — упрощённый пример процентилизации:
   function pctOf(value: number, arr: number[], lowerIsBetter = false) {
  const pool = arr.filter(x => Number.isFinite(x)).sort((a,b)=>a-b);
  if (!pool.length || !Number.isFinite(value)) return null;

  let rank = 0;
  while (rank < pool.length && pool[rank] <= value) rank++;
  const pct = Math.round((rank / pool.length) * 100);

  return lowerIsBetter ? (100 - pct) : pct;
}

    const LOWER_IS_BETTER = new Set<string>([
  "beaten_rate", // Beaten Rate ↓
  "pxa",         // pXA ↓
]);
    
    // Вытащим пулы для нужных осей (пример для «FW»-набора; оставь свою маппу)
    const pull = {
      goal_contrib: cohortRows.map(r => n(r.goal_contrib)),
      xg_delta: cohortRows.map(r => n(r.xg_delta)),
      shots_on_target_pct: cohortRows.map(r => n(r.shots_on_target_pct)),
      creation: cohortRows.map(r => n(r.creation)),
      dribble_pct: cohortRows.map(r => n(r.dribble_pct)),
      pressing: cohortRows.map(r => n(r.pressing)),
      xa_avg: cohortRows.map(r => n(r.xa_avg)),
      pxa: cohortRows.map(r => n(r.pxa)),
      passes: cohortRows.map(r => n(r.passes)),
      pass_acc: cohortRows.map(r => n(r.pass_acc)),
      def_actions: cohortRows.map(r => n(r.def_actions)),
      beaten_rate: cohortRows.map(r => n(r.beaten_rate)),
      aerial_pct: cohortRows.map(r => n(r.aerial_pct)),
      crosses_avg: cohortRows.map(r => n(r.crosses_avg)),
      safety_coef: cohortRows.map(r => n(r.safety_coef)),
      tackle_success: cohortRows.map(r => n(r.tackle_success)),
      clearances: cohortRows.map(r => n(r.clearances)),
      attack_participation: cohortRows.map(r => n(r.attack_participation)),
    };

    // Сформируй конкретный набор осей под кластер, как у тебя было:
    const axesByCluster: Record<ClusterKey, { key: string; label: string }[]> = {
      FW: [
        { key: "goal_contrib", label: "Гол+пас" },
        { key: "xg_delta", label: "Реализация xG" },
        { key: "shots_on_target_pct", label: "Удары в створ %" },
        { key: "creation", label: "Созидание" },
        { key: "dribble_pct", label: "Дриблинг %" },
        { key: "pressing", label: "Прессинг" },
        { key: "xa_avg", label: "xA" },
      ],
      AM: [
        { key: "xa_avg", label: "xA" },
        { key: "pxa", label: "pXA" },
        { key: "goal_contrib", label: "Гол+пас" },
        { key: "pass_acc", label: "Точность пасов %" },
        { key: "dribble_pct", label: "Дриблинг %" },
        { key: "pressing", label: "Прессинг" },
      ],
      FM: [
        { key: "creation", label: "Созидание" },
        { key: "passes", label: "Пасы" },
        { key: "pass_acc", label: "Точность паса %" },
        { key: "def_actions", label: "Защитные действия" },
        { key: "beaten_rate", label: "Beaten Rate ↓" },
        { key: "aerial_pct", label: "Верховые %" },
      ],
      CM: [
        { key: "creation", label: "Созидание" },
        { key: "passes", label: "Пасы" },
        { key: "pass_acc", label: "Точность паса %" },
        { key: "def_actions", label: "Защитные действия" },
        { key: "beaten_rate", label: "Beaten Rate ↓" },
        { key: "aerial_pct", label: "Верховые %" },
        { key: "pxa", label: "pXA" },
        { key: "xa_avg", label: "xA" },
      ],
      CB: [
        { key: "safety_coef", label: "Кэф безопасности" },
        { key: "def_actions", label: "Защитные действия" },
        { key: "tackle_success", label: "% успешных отборов" },
        { key: "clearances", label: "Выносы" },
        { key: "pass_acc", label: "% точности пасов" },
        { key: "attack_participation", label: "Участие в атаке" },
        { key: "aerial_pct", label: "% побед в воздухе" },
        { key: "beaten_rate", label: "Beaten Rate" },
      ],
      GK: [
        { key: "save_pct", label: "% сейвов" },
        { key: "saves_avg", label: "Сейвы/матч" },
        { key: "intercepts", label: "Перехваты/матч" },
        { key: "passes", label: "Пасы/матч" },
        { key: "clean_sheets_pct", label: "% сухих матчей" },
        { key: "prevented_xg", label: "Предотвр. xG/матч" },
      ],
    };

    // Собираем радар
    const axes = axesByCluster[cluster].filter(a => a.key in (agg ?? {}));
    const radar = axes.map(a => {
  const raw = Number(agg?.[a.key]);
  const pool = (pull as any)[a.key] as number[] | undefined;
  const pct = pool ? pctOf(raw, pool, LOWER_IS_BETTER.has(a.key)) : null;
  return { key: a.key, label: a.label, raw, pct };
});

    return NextResponse.json({
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: tournamentsOfficial.map(t => t.name),
      radar,
      debug: { seasonMin: SEASON_MIN, officialFilterApplied: true },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
