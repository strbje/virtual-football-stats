// src/app/api/player-radar/[userId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** =========================
 *  КЛАСТЕРЫ АМПЛУА
 *  ========================= */
type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB" | "GK";
type RoleCode =
  | "ФРВ" | "ЦФД" | "ЛФД" | "ПФД" | "ЛФА" | "ПФА"
  | "ЦАП" | "ЦП"  | "ЛЦП" | "ПЦП" | "ЛАП" | "ПАП"
  | "ЛП"  | "ПП"
  | "ЦОП" | "ЛОП" | "ПОП"
  | "ЦЗ"  | "ЛЦЗ" | "ПЦЗ" | "ЛЗ"  | "ПЗ"
  | "ВРТ";

const CLUSTERS: Record<ClusterKey, RoleCode[]> = {
  FW: ["ФРВ","ЦФД","ЛФД","ПФД","ЛФА","ПФА"],
  AM: ["ЦАП","ЦП","ЛЦП","ПЦП","ЛАП","ПАП"], // по твоему обновлению AM содержит и ЦП/ЛЦП/ПЦП
  FM: ["ЛП","ПП"],
  CM: ["ЦП","ЦОП","ЛЦП","ПЦП","ЛОП","ПОП"],
  CB: ["ЦЗ","ЛЦЗ","ПЦЗ","ЛЗ","ПЗ"],
  GK: ["ВРТ"],
};

/** Метрики радара по кластерам (ключ — идентификатор в JSON ответа) */
const RADAR_METRICS: Record<ClusterKey, { key: string; label: string; invert?: boolean }[]> = {
  FW: [
    { key: "goal_contrib",          label: "Гол+пас" },
    { key: "xg_delta",              label: "Реализация xG" },
    { key: "shots_on_target_pct",   label: "Удары в створ %" },
    { key: "creation",              label: "Созидание" },
    { key: "dribble_pct",           label: "Дриблинг %" },
    { key: "pressing",              label: "Прессинг" },
  ],
  AM: [
    { key: "xa_per_match",          label: "xA/матч" },
    { key: "pxa_efficiency",        label: "pXA (↓ лучше)", invert: true }, // инверсия: меньше — лучше
    { key: "goal_contrib",          label: "Гол+пас" },
    { key: "pass_accuracy_pct",     label: "Точность пасов %" },
    { key: "dribble_pct",           label: "Дриблинг %" },
    { key: "pressing",              label: "Прессинг" },
  ],
  FM: [
    { key: "creation",              label: "Созидание" },
    { key: "allpasses_per_match",   label: "Пасы/матч" },
    { key: "pass_accuracy_pct",     label: "Точность паса %" },
    { key: "def_actions",           label: "Защитные действия" },
    { key: "beaten_rate",           label: "Beaten Rate (↓ лучше)", invert: true },
    { key: "air_duels_pct",         label: "Верховые %" },
    // «Навесы» и «Гол+пас» добавляли — в вычислениях есть (creation и goal_contrib покрывают),
    // если требуется отдельная ось «Навесы» — добавь ключ и расчёт SUM(success_crosses)/COUNT(*).
  ],
  CM: [
    { key: "creation",              label: "Созидание" },
    { key: "allpasses_per_match",   label: "Пасы/матч" },
    { key: "pass_accuracy_pct",     label: "Точность паса %" },
    { key: "def_actions",           label: "Защитные действия" },
    { key: "beaten_rate",           label: "Beaten Rate (↓ лучше)", invert: true },
    { key: "air_duels_pct",         label: "Верховые %" },
  ],
  CB: [
    { key: "safety_coeff",          label: "Кэф безопасности" },
    { key: "def_actions",           label: "Защитные действия" },
    { key: "tackles_success_pct",   label: "% успешных отборов" },
    { key: "clearances_per_match",  label: "Выносы/матч" },
    { key: "pass_accuracy_pct",     label: "% точности пасов" },
    { key: "attack_involvement",    label: "Участие в атаке" },
    { key: "air_duels_pct",         label: "% побед в воздухе" },
    { key: "beaten_rate",           label: "Beaten Rate (↓ лучше)", invert: true },
  ],
  GK: [
    { key: "save_pct",              label: "% сейвов" },
    { key: "saves_per_match",       label: "Сейвы/матч" },
    { key: "intercepts_per_match",  label: "Перехваты/матч" },
    { key: "allpasses_per_match",   label: "Пасы/матч" },
    { key: "clean_sheet_pct",       label: "% сухих матчей" },
  ],
};

function resolveClusterByRole(role: string): ClusterKey | null {
  const rc = role as RoleCode;
  for (const k of Object.keys(CLUSTERS) as ClusterKey[]) {
    if (CLUSTERS[k].includes(rc)) return k;
  }
  return null;
}

/** =============== ВСПОМОГАТЕЛЬНЫЕ =============== */

const BASE =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3000");

function abs(path: string) {
  return new URL(path, BASE).toString();
}

function safeNum(v: any, d = 0) {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
}

function toJSON(data: any) {
  return JSON.parse(
    JSON.stringify(
      data,
      (_, val) => (typeof val === "bigint" ? val.toString() : val)
    )
  );
}

/** Получаем текущую роль из уже работающего профайл-эндпоинта (без дублирования логики) */
async function fetchCurrentRoleFromProfile(userId: string) {
  const url = abs(`/api/player-roles?userId=${encodeURIComponent(userId)}`);
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (j && j.currentRoleLast30) return { role: j.currentRoleLast30 as RoleCode, source: "api/player-roles" as const };
  } catch {
    /* fallthrough */
  }
  return { role: null as RoleCode | null, source: "fallback" as const };
}

/** Регексы/правила для отбора официальных турниров — название содержит «сезон N», где N ≥ 18 */
function detectSeasonFromName(name: string): number | null {
  // примеры: "Премьер-лига (24 сезон)", "Кубок России (18 сезон)", "ФНЛ (22 сезон)"
  // берём первое число возле слова "сезон"
  const m = name.match(/сезон\D*?(\d{1,3})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Перцентиль по пулу значений */
function percentileRank(value: number, pool: number[]) {
  if (!pool.length) return null;
  let lessOrEq = 0;
  for (const v of pool) if (v <= value) lessOrEq++;
  // 0..100
  return Math.max(0, Math.min(100, Math.round((lessOrEq / pool.length) * 100)));
}

/** ======================== РОУТ ======================== */

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const userId = params.userId;
  const url = new URL(req.url);
  const qpRole = url.searchParams.get("role"); // опционально можно переопределить роль из запроса
  const debug = url.searchParams.get("debug") !== null;

  // шаг 1: определяем текущую роль — сначала берём из ?role=..., иначе из /api/player-roles
  let currentRole: RoleCode | null = null;
  let currentRoleSource: string | null = null;

  if (qpRole) {
    currentRole = qpRole as RoleCode;
    currentRoleSource = "query-param";
  } else {
    const r = await fetchCurrentRoleFromProfile(userId);
    currentRole = r.role;
    currentRoleSource = r.source;
  }

  const cluster: ClusterKey | null = currentRole ? resolveClusterByRole(currentRole) : null;

  // если роли нет — честно сообщаем
  if (!currentRole || !cluster) {
    return NextResponse.json(
      {
        ok: true,
        ready: false,
        currentRole: currentRole ?? null,
        cluster: cluster ?? null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: "Не удалось определить актуальную роль (30 матчей) через /api/player-roles",
        debug: {
          currentRoleSource,
        },
      },
      { status: 200 }
    );
  }

  // шаг 2: соберём список турниров пользователя с пометкой сезона и фильтром «официальных»
  const tourRows: { name: string; matches: bigint }[] = await prisma.$queryRawUnsafe(`
    SELECT t.name AS name, COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN tournament t        ON tm.tournament_id = t.id
    WHERE ums.user_id = CAST(? AS UNSIGNED)
    GROUP BY t.name
  `, userId);

  const allTours = tourRows.map(r => ({
    name: r.name,
    season: detectSeasonFromName(r.name),
    matches: Number(r.matches),
  }));

  const officialTours = allTours.filter(t => t.season !== null && (t.season as number) >= 18);
  const officialNames = new Set(officialTours.map(t => t.name));

  // шаг 3: агрегаты ИГРОКА по кластеру, только по официальным турнирам
  // ВЕСЫ/ФОРМУЛЫ — строго как договорились: проценты через SUM(num)/SUM(den), за матч — SUM()/COUNT(*), дельты — SUM(delta)/COUNT(*)
  //
  // Маппинг полей из твоего описания:
  // goals_expected = goals_expected
  // pregoal_passes = pregoal_passes
  // passes = xA (твой «passes»)
  // ipasses = важные пасы
  // allstockes / completedstockes (дриблинг)
  // passes_rate — готовый %, но корректнее считать по completedpasses/allpasses
  // allpasses / completedpasses
  // completedtackles — удачный отбор
  // completedslidings — удачный подкат
  // blocks — блоки
  // outplayed + penalised_fails — обыгран
  // duels_air / duels_air_win
  // kicked / kickedin — удары / в створ
  // saved / scored (GK)
  //
  // Доп. агрегаты для CB: clearances (если есть; иначе нули)
  //
  const playerAggRows = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(ums.goals)                                           AS sum_goals,
      SUM(ums.passes_goal)                                     AS sum_assists,
      SUM(ums.goals_expected)                                  AS sum_xg,

      -- проценты/доли (взвешенно)
      SUM(ums.kickedin) / NULLIF(SUM(ums.kicked), 0)           AS shots_on_target_pct,
      SUM(ums.completedstockes) / NULLIF(SUM(ums.allstockes),0) AS dribble_pct,
      SUM(ums.completedpasses) / NULLIF(SUM(ums.allpasses),0)   AS pass_accuracy_pct,
      SUM(ums.duels_air_win) / NULLIF(SUM(ums.duels_air),0)     AS air_duels_pct,

      -- за матч
      (SUM(ums.pregoal_passes) + SUM(ums.ipasses) + 2*SUM(ums.passes)) / COUNT(*)  AS creation,
      (SUM(ums.intercepts) + SUM(ums.completedtackles)) / COUNT(*)                 AS pressing,
      SUM(ums.allpasses) / COUNT(*)                                                AS allpasses_per_match,
      (SUM(ums.intercepts) + SUM(ums.completedtackles) + SUM(ums.completedslidings) + SUM(ums.blocks)) / COUNT(*) AS def_actions,

      -- CB-дополнения
      SUM(COALESCE(ums.clearances,0)) / COUNT(*)                AS clearances_per_match,
      SUM(ums.completedtackles) / NULLIF(SUM(ums.attemptedtackles),0) AS tackles_success_pct,
      (SUM(ums.ipasses) + SUM(ums.pregoal_passes) + 2*SUM(ums.goals) + 2*SUM(ums.passes_goal)) / COUNT(*)         AS attack_involvement,

      -- GK
      SUM(ums.saved) / NULLIF(SUM(ums.saved + ums.scored), 0)   AS save_pct,
      SUM(ums.saved) / COUNT(*)                                 AS saves_per_match,
      SUM(ums.intercepts) / COUNT(*)                            AS intercepts_per_match,
      SUM(CASE WHEN ums.dry=1 THEN 1 ELSE 0 END) / COUNT(*)     AS clean_sheet_pct,

      -- интегральные
      (SUM(ums.goals) + SUM(ums.passes_goal)) / COUNT(*)        AS goal_contrib,
      (SUM(ums.goals) - SUM(ums.goals_expected)) / COUNT(*)     AS xg_delta,
      (0.5 * (SUM(ums.completedpasses)/NULLIF(SUM(ums.allpasses),0))
       + 0.3 * (SUM(ums.completedstockes)/NULLIF(SUM(ums.allstockes),0))
       + 0.15 * (SUM(ums.duels_air_win)/NULLIF(SUM(ums.duels_air),0))
       + 0.05 * (SUM(ums.completedtackles)/NULLIF(SUM(ums.attemptedtackles),0)))  AS safety_coeff,
      (SUM(ums.outplayed + ums.penalised_fails)
       / NULLIF(SUM(ums.intercepts + ums.completedtackles + ums.completedslidings + ums.blocks),0)) AS beaten_rate,

      -- AM: xA/матч и pXA (эффективность; меньше — лучше)
      SUM(ums.passes) / COUNT(*)                                 AS xa_per_match,
      (SUM(ums.allpasses) / NULLIF(SUM(ums.passes/0.5), 0))      AS pxa_efficiency,

      COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN tournament t        ON tm.tournament_id = t.id
    WHERE ums.user_id = CAST(? AS UNSIGNED)
      AND ums.skill_id IN (${CLUSTERS[cluster].map(() => "?").join(",")})
      AND t.name IN (${officialTours.length ? officialTours.map(() => "?").join(",") : "NULL"})
  `, userId, ...CLUSTERS[cluster].map(codeToSkillId), ...(officialTours.map(t => t.name)));

  // Примечание: codeToSkillId — заглушка. Если у тебя в ums.skill_id хранятся именно те же коды, замените на соответствие.
  // Ниже дам функцию-мэппер, чтобы не было «магии».

  const playerAgg = toJSON(playerAggRows?.[0] ?? {});
  const matchesCluster = safeNum(playerAgg.matches, 0);

  if (!matchesCluster || matchesCluster < 30) {
    return NextResponse.json(
      {
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: officialTours.map(t => t.name),
        reason: "Недостаточно матчей в кластере (< 30)",
        debug: {
          currentRoleSource,
          tournamentsAll: allTours,
          tournamentsOfficial: officialTours,
        },
      },
      { status: 200 }
    );
  }

  // шаг 4: ПУЛ СРАВНЕНИЯ по кластеру и тем же турнирам — ТОЛЬКО игроки с >=30 матчей
  const poolRows = await prisma.$queryRawUnsafe(`
    SELECT
      -- все формулы должны совпадать с агрегацией игрока
      (SUM(ums.goals) + SUM(ums.passes_goal)) / COUNT(*)        AS goal_contrib,
      (SUM(ums.goals) - SUM(ums.goals_expected)) / COUNT(*)     AS xg_delta,
      SUM(ums.kickedin) / NULLIF(SUM(ums.kicked), 0)            AS shots_on_target_pct,
      (SUM(ums.pregoal_passes) + SUM(ums.ipasses) + 2*SUM(ums.passes)) / COUNT(*)  AS creation,
      SUM(ums.completedstockes) / NULLIF(SUM(ums.allstockes),0) AS dribble_pct,
      (SUM(ums.intercepts) + SUM(ums.completedtackles)) / COUNT(*)                 AS pressing,
      SUM(ums.completedpasses) / NULLIF(SUM(ums.allpasses),0)   AS pass_accuracy_pct,
      SUM(ums.allpasses) / COUNT(*)                             AS allpasses_per_match,
      (SUM(ums.intercepts) + SUM(ums.completedtackles) + SUM(ums.completedslidings) + SUM(ums.blocks)) / COUNT(*) AS def_actions,
      SUM(COALESCE(ums.clearances,0)) / COUNT(*)                AS clearances_per_match,
      SUM(ums.completedtackles) / NULLIF(SUM(ums.attemptedtackles),0) AS tackles_success_pct,
      (SUM(ums.ipasses) + SUM(ums.pregoal_passes) + 2*SUM(ums.goals) + 2*SUM(ums.passes_goal)) / COUNT(*)         AS attack_involvement,
      SUM(ums.duels_air_win) / NULLIF(SUM(ums.duels_air),0)     AS air_duels_pct,
      (SUM(ums.outplayed + ums.penalised_fails)
       / NULLIF(SUM(ums.intercepts + ums.completedtackles + ums.completedslidings + ums.blocks),0)) AS beaten_rate,

      -- GK
      SUM(ums.saved) / NULLIF(SUM(ums.saved + ums.scored), 0)   AS save_pct,
      SUM(ums.saved) / COUNT(*)                                 AS saves_per_match,
      SUM(ums.intercepts) / COUNT(*)                            AS intercepts_per_match,
      SUM(CASE WHEN ums.dry=1 THEN 1 ELSE 0 END) / COUNT(*)     AS clean_sheet_pct,

      COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN tournament t        ON tm.tournament_id = t.id
    WHERE ums.skill_id IN (${CLUSTERS[cluster].map(() => "?").join(",")})
      AND t.name IN (${officialTours.length ? officialTours.map(() => "?").join(",") : "NULL"})
    GROUP BY ums.user_id
    HAVING COUNT(*) >= 30
  `, ...CLUSTERS[cluster].map(codeToSkillId), ...(officialTours.map(t => t.name)));

  const pool = toJSON(poolRows ?? []);

  // шаг 5: соберём значения игрока по нужным осям кластера и рассчитаем перцентили
  const axes = RADAR_METRICS[cluster];
  const radar = axes.map(({ key, label, invert }) => {
    const raw = safeNum(playerAgg[key], null);
    let pct: number | null = null;
    if (raw !== null) {
      const poolVals = pool
        .map((r: any) => safeNum(r[key], null))
        .filter((v: number | null) => v !== null) as number[];
      const p = percentileRank(raw as number, poolVals);
      pct = p === null ? null : (invert ? (p !== null ? 100 - p : null) : p);
    }
    return { key, label, raw, pct };
  });

  return NextResponse.json(
    {
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: officialTours.map(t => t.name),
      radar,
      debug: debug ? {
        currentRoleSource,
        tournamentsAll: allTours,
        tournamentsOfficial: officialTours,
      } : undefined,
    },
    { status: 200 }
  );
}

/** ===================== МЭППЕР skill_id =====================
 * В твоих данных ums.skill_id — это ID из skills_positions.
 * Если раньше мы уже пользовались готовой маппой — верни ту же.
 * Ниже — заглушка: замени на реальные ID из твоей таблицы skills_positions.
 */
function codeToSkillId(code: RoleCode): number {
  const map: Partial<Record<RoleCode, number>> = {
    "ФРВ": 21, "ЦФД": 18, "ЛФД": 19, "ПФД": 20, "ЛФА": 22, "ПФА": 23,
    "ЦАП": 15, "ЦП": 10, "ЛЦП": 11, "ПЦП": 12, "ЛАП": 16, "ПАП": 17,
    "ЛП": 13, "ПП": 14,
    "ЦОП": 7, "8": 16, "ПОП": 9,
    "ЦЗ": 2, "ЛЦЗ": 3, "ПЦЗ": 4, "ЛЗ": 5, "ПЗ": 6,
    "ВРТ": 1,
  };
  const id = map[code];
  if (!id) throw new Error(`Не задан skill_id для кода роли ${code}. Пропиши его в codeToSkillId().`);
  return id;
}

export const dynamic = "force-dynamic";
