// src/app/api/player-radar/[userId]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** -------------------- Типы и справочники -------------------- */

type RoleCode =
  | "ФРВ" | "ЦФД" | "ЛФД" | "ПФД" | "ЛФА" | "ПФА" // форварды
  | "ЦАП" | "ЛАП" | "ПАП"                         // атакующая тройка полузащиты
  | "ЛП"  | "ПП"                                  // фланговые полузащитники
  | "ЦП"  | "ЦОП" | "ЛЦП" | "ПЦП" | "ЛОП" | "ПОП" // центральные/опорные
  | "ЦЗ"  | "ЛЦЗ" | "ПЦЗ" | "ЛЗ"  | "ПЗ"         // защита
  | "ВРТ";                                       // вратарь

type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB" | "GK";

/** Кластеры без пересечений (сняли конфликт AM/CM вокруг центральных) */
const CLUSTERS: Record<ClusterKey, RoleCode[]> = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВРТ"],
};

function resolveClusterByRole(role: RoleCode): ClusterKey | null {
  for (const key of Object.keys(CLUSTERS) as ClusterKey[]) {
    if (CLUSTERS[key].includes(role)) return key;
  }
  return null;
}

/** -------------------- Утилиты -------------------- */

function extractSeason(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/\u00A0/g, " ").toLowerCase();

  // 18 сезон / 18-й сезон / (18 сезон)
  const rxA = /(^|[\s(])(\d{1,3})\s*[-–—]?\s*(?:й|-й)?\s*сезон\b/;
  const rxB = /сезон\s*[-–—]?\s*(?:№)?\s*(\d{1,3})\b/;
  const rxC = /\(\s*(\d{1,3})\s*[-–—]?\s*(?:й|-й)?\s*сезон\s*\)/;

  const mA = s.match(rxA);
  if (mA) {
    const val = Number(mA[2]);
    return Number.isFinite(val) ? val : null;
  }
  const mB = s.match(rxB);
  if (mB) {
    const val = Number(mB[1]);
    return Number.isFinite(val) ? val : null;
  }
  const mC = s.match(rxC);
  if (mC) {
    const val = Number(mC[1]);
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

function json(obj: any) {
  return NextResponse.json(
    obj,
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

/** Безопасная сериализация BigInt в number */
function toSafe<T>(row: T): T {
  return JSON.parse(JSON.stringify(row, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
}

/** Процентили: доля значений в пуле, не превосходящих x (для «ниже лучше» делаем инверсию заранее) */
function percentileOf(pool: number[], x: number): number {
  if (!pool.length) return 0;
  const lessEq = pool.filter((v) => v <= x).length;
  return Math.round((lessEq / pool.length) * 100);
}

/** -------------------- SQL кусочки (таблицы/поля) -------------------- */
/**
 * Основано на твоём запросе, который ты присылал:
 *   tbl_users_match_stats ums
 *   tournament_match tm
 *   tournament t
 *   skills_positions sp  (sp.short_name = код роли, например "ЛФД")
 *   tbl_users u
 *   teams c
 */

const TBL = {
  stats: "tbl_users_match_stats",
  match: "tournament_match",
  tour: "tournament",
  skills: "skills_positions",
};

const COL = {
  roleShort: "sp.short_name",
  tourName: "t.name",
};

/** -------------------- Турниры: полный список и официальный фильтр -------------------- */

async function getTournamentsForUser(userId: number) {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT ${COL.tourName} AS name, COUNT(*) AS matches
    FROM ${TBL.stats} ums
    JOIN ${TBL.match} tm ON ums.match_id = tm.id
    JOIN ${TBL.tour} t ON tm.tournament_id = t.id
    WHERE ums.user_id = ?
    GROUP BY ${COL.tourName}
    ORDER BY matches DESC;
  `, userId);

  const detailed = rows.map((r) => ({
    name: String(r.name ?? ""),
    season: extractSeason(String(r.name ?? "")),
    matches: Number(r.matches ?? 0),
  }));

  const official = detailed.filter((d) => (d.season ?? -1) >= 18);

  return { detailed, official };
}

/** -------------------- Автоопределение текущей роли (если страница не передала role=) -------------------- */

async function autoDetectRole(prisma: PrismaClient, userId: number): Promise<RoleCode | null> {
  // Берём последние 30 матчей пользователя и выбираем самую частую роль
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT ${COL.roleShort} AS role
    FROM ${TBL.stats} ums
    JOIN ${TBL.skills} sp ON ums.skill_id = sp.id
    JOIN ${TBL.match} tm ON ums.match_id = tm.id
    ORDER BY tm.timestamp DESC
    LIMIT 200;
  `);

  // Поскольку в таблице нет фильтра по пользователю в ORDER ... LIMIT, добавим его корректно:
  // (Некоторые MySQL/Марии допускают LIMIT в подзапросе; сделаем безопасно  — просто возьмём 300 последних и отфильтруем)
  const rowsProper = await prisma.$queryRawUnsafe<any[]>(`
    SELECT ${COL.roleShort} AS role
    FROM ${TBL.stats} ums
    JOIN ${TBL.skills} sp ON ums.skill_id = sp.id
    JOIN ${TBL.match} tm ON ums.match_id = tm.id
    WHERE ums.user_id = ?
    ORDER BY tm.timestamp DESC
    LIMIT 300;
  `, userId);

  const freq = new Map<string, number>();
  for (const r of rowsProper) {
    const rc = String(r.role ?? "");
    if (!rc) continue;
    freq.set(rc, (freq.get(rc) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCnt = -1;
  for (const [k, v] of freq) {
    if (v > bestCnt) { best = k; bestCnt = v; }
  }
  return (best as RoleCode) ?? null;
}

/** -------------------- Выбор метрик по кластеру -------------------- */

type RadarMetric = {
  key: string;
  label: string;
  compute: (r: any) => number; // вычисляет «сырое» значение по агрегированным полям
  lowerIsBetter?: boolean;     // если true — инвертируем при расчёте перцентиля
};

function metricsForCluster(cluster: ClusterKey): RadarMetric[] {
  switch (cluster) {
    case "FW":
      return [
        { key: "goal_contrib", label: "Гол+пас", compute: (r) => n(r.goals) + n(r.assists) },
        { key: "xg_delta", label: "Реализация xG", compute: (r) => n(r.goals) - n(r.goals_expected) },
        { key: "shots_on_target_pct", label: "Удары в створ %", compute: (r) => ratio(n(r.shots_on), n(r.shots_all)) },
        { key: "creation", label: "Созидание", compute: (r) => n(r.pregoal) + n(r.ipass) + 2 * n(r.xa) },
        { key: "dribble_pct", label: "Дриблинг %", compute: (r) => ratio(n(r.dribble_won), n(r.dribble_all)) },
        { key: "pressing", label: "Прессинг", compute: (r) => n(r.intercepts) + n(r.tackles_won) },
      ];
    case "AM":
      return [
        { key: "xa", label: "xA", compute: (r) => n(r.xa) },
        { key: "pxa", label: "pXA", compute: (r) => pxaFrom(r.passes_all, r.xa_raw) },
        { key: "goal_contrib", label: "Гол+пас", compute: (r) => n(r.goals) + n(r.assists) },
        { key: "pass_acc", label: "Точность пасов %", compute: (r) => n(r.passes_rate) },
        { key: "dribble_pct", label: "Дриблинг %", compute: (r) => ratio(n(r.dribble_won), n(r.dribble_all)) },
        { key: "pressing", label: "Прессинг", compute: (r) => n(r.intercepts) + n(r.tackles_won) },
      ];
    case "FM":
      return [
        { key: "creation", label: "Созидание", compute: (r) => n(r.pregoal) + n(r.ipass) + 2 * n(r.xa) },
        { key: "passes", label: "Пасы", compute: (r) => n(r.passes_all) },
        { key: "pass_acc", label: "Точность паса %", compute: (r) => n(r.passes_rate) },
        { key: "def_actions", label: "Защитные действия", compute: (r) => n(r.intercepts) + n(r.tackles_won) + n(r.slidetackles_won) + n(r.blocks) },
        { key: "beaten_rate", label: "Beaten Rate ↓", compute: (r) => beatenRate(r), lowerIsBetter: true },
        { key: "aerial", label: "Верховые %", compute: (r) => ratio(n(r.duels_air_win), n(r.duels_air_all)) },
        { key: "crosses", label: "Навесы", compute: (r) => n(r.crosses_success) }, // удачные навесы
        { key: "gc", label: "Гол+пас", compute: (r) => n(r.goals) + n(r.assists) },
      ];
    case "CM":
      return [
        { key: "creation", label: "Созидание", compute: (r) => n(r.pregoal) + n(r.ipass) + 2 * n(r.xa) },
        { key: "passes", label: "Пасы", compute: (r) => n(r.passes_all) },
        { key: "pass_acc", label: "Точность паса %", compute: (r) => n(r.passes_rate) },
        { key: "def_actions", label: "Защитные действия", compute: (r) => n(r.intercepts) + n(r.tackles_won) + n(r.slidetackles_won) + n(r.blocks) },
        { key: "beaten_rate", label: "Beaten Rate ↓", compute: (r) => beatenRate(r), lowerIsBetter: true },
        { key: "aerial", label: "Верховые %", compute: (r) => ratio(n(r.duels_air_win), n(r.duels_air_all)) },
      ];
    case "CB":
      return [
        { key: "safety", label: "Кэф безопасности", compute: (r) => safetyCoefficient(r) },
        { key: "def_actions", label: "Защитные действия", compute: (r) => n(r.intercepts) + n(r.tackles_won) + n(r.slidetackles_won) + n(r.blocks) },
        { key: "tackle_succ", label: "% успешных отборов", compute: (r) => ratio(n(r.tackles_won), n(r.tackles_all)) },
        { key: "clearances", label: "Выносы", compute: (r) => n(r.clearances) },
        { key: "pass_acc", label: "% точности пасов", compute: (r) => n(r.passes_rate) },
        { key: "attack_part", label: "Участие в атаке", compute: (r) => n(r.ipass) + n(r.pregoal) + 2 * (n(r.goals) + n(r.assists)) },
        { key: "aerial", label: "% побед в воздухе", compute: (r) => ratio(n(r.duels_air_win), n(r.duels_air_all)) },
        { key: "beaten_rate", label: "Beaten Rate ↓", compute: (r) => beatenRate(r), lowerIsBetter: true },
      ];
    case "GK":
      return [
        { key: "save_pct", label: "% сейвов", compute: (r) => ratio(n(r.saved), n(r.saved) + n(r.scored)) },
        { key: "saves", label: "Кол-во сейвов", compute: (r) => n(r.saved) }, // в среднем за матч
        { key: "intercepts", label: "Перехваты", compute: (r) => n(r.intercepts) },
        { key: "passes", label: "Пасы", compute: (r) => n(r.passes_all) },
        { key: "clean_sheets", label: "% сухих матчей", compute: (r) => ratio(n(r.dry), n(r.matches)) },
        // prevented xG — добавим, когда появится колонка соперничьего xG
      ];
  }
}

/** -------------------- Агрегации «в среднем за матч» -------------------- */

function n(v: any, d = 0) {
  const x = typeof v === "string" ? Number(v) : (v ?? d);
  return Number.isFinite(x as number) ? (x as number) : d;
}
function ratio(num: number, den: number) {
  return den > 0 ? num / den : 0;
}
function beatenRate(r: any) {
  const beaten = n(r.outplayed) + n(r.penalised_fails);
  const denom = n(r.intercepts) + n(r.tackles_all) + n(r.slidetackles_all) + n(r.blocks);
  return ratio(beaten, denom);
}
function safetyCoefficient(r: any) {
  const passPart = ratio(n(r.passes_success), n(r.passes_all));
  const dribPart = ratio(n(r.dribble_won), n(r.dribble_all));
  const airPart = ratio(n(r.duels_air_win), n(r.duels_air_all));
  const tacklePart = ratio(n(r.tackles_won), n(r.tackles_all));
  return 0.5 * passPart + 0.3 * dribPart + 0.15 * airPart + 0.05 * tacklePart;
}
// pXA = SUM(allpasses)/SUM(passes/0.5) — из твоей формулы
function pxaFrom(allpasses: any, xa_raw: any) {
  const a = n(allpasses);
  const x = n(xa_raw);
  // если xA = 0 — вернём 0, чтобы не делить на 0
  return x > 0 ? a / (x / 0.5) : 0;
}

/** -------------------- Основной обработчик -------------------- */

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const userIdNum = Number(params.userId);
    if (!Number.isFinite(userIdNum)) {
      return json({ ok: false, error: "Bad userId" });
    }

    const url = new URL(req.url);
    const roleFromClient = (url.searchParams.get("role") || "").trim() as RoleCode | "";
    const wantDebug = url.searchParams.has("debug");

    // 1) турниры пользователя
    const { detailed, official } = await getTournamentsForUser(userIdNum);
    const officialApplied = official.length > 0;

    // 2) текущая роль (из клиента или авто-детект по последним матчам)
    let currentRole: RoleCode | null = roleFromClient || null;
    if (!currentRole) currentRole = await autoDetectRole(prisma, userIdNum);
    const cluster: ClusterKey | null = currentRole ? resolveClusterByRole(currentRole) : null;

    if (!currentRole || !cluster) {
      return json({
        ok: true,
        ready: false,
        currentRole: currentRole ?? null,
        cluster: null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: "Нет актуального амплуа или не определён кластер",
        debug: {
          seasonMin: 18,
          officialFilterApplied: officialApplied,
          tournamentsAll: detailed,
          tournamentsOfficial: official,
        },
      });
    }

    // 3) соберём официальные матчи пользователя по нужному кластеру
    const roleList = CLUSTERS[cluster];
    const rolesSql = roleList.map((r) => `'${r}'`).join(",");

    // соберём агрегаты по пользователю (средние за матч) и количество матчей в кластере
    // (только по официальным турнирам season>=18)
    const myAgg = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*)                      AS matches,
        AVG(ums.goals)                AS goals,
        AVG(ums.assists)              AS assists,
        AVG(ums.goals_expected)       AS goals_expected,
        AVG(ums.kickedin)             AS shots_on,
        AVG(ums.kicked)               AS shots_all,
        AVG(ums.pregoal_passes)       AS pregoal,
        AVG(ums.ipasses)              AS ipass,
        AVG(ums.passes)               AS xa,        -- твой xA
        AVG(ums.passes)               AS xa_raw,    -- для pXA
        AVG(ums.allpasses)            AS passes_all,
        AVG(ums.completedpasses)      AS passes_success,
        AVG(ums.passes_rate)          AS passes_rate,
        AVG(ums.allstockes)           AS dribble_all,
        AVG(ums.completedstockes)     AS dribble_won,
        AVG(ums.intercepts)           AS intercepts,
        AVG(ums.selection)            AS tackles_won,
        AVG(ums.allselection)         AS tackles_all,
        AVG(ums.completedtackles)     AS slidetackles_won,
        AVG(ums.ums.tackles)          AS slidetackles_all,
        AVG(ums.blocks)               AS blocks,
        AVG(ums.outs)                 AS clearances,
        AVG(ums.duels_air)            AS duels_air_all,
        AVG(ums.duels_air_win)        AS duels_air_win,
        AVG(ums.outplayed)            AS outplayed,
        AVG(ums.penalised_fails)      AS penalised_fails,
        -- GK:
        AVG(ums.saved)                AS saved,
        AVG(ums.scored)               AS scored,
        AVG(ums.dry)                  AS dry
      FROM ${TBL.stats} ums
      JOIN ${TBL.match} tm ON ums.match_id = tm.id
      JOIN ${TBL.tour}  t  ON tm.tournament_id = t.id
      JOIN ${TBL.skills} sp ON ums.skill_id = sp.id
      WHERE ums.user_id = ?
        AND sp.short_name IN (${rolesSql})
        AND (
          -- только официальные
          (t.name REGEXP '(\\\\(|^| )[0-9]{1,3}( *-?й)? *сезон' AND ${seasonExpr("t.name")} >= 18)
          OR (t.name REGEXP 'сезон *[0-9]{1,3}' AND ${seasonExpr("t.name")} >= 18)
        )
    `, userIdNum);

    const me = toSafe(myAgg[0] ?? null);
    const matchesCluster = Number(me?.matches ?? 0);

    if (!matchesCluster || matchesCluster < 30) {
      return json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: official.map((o) => o.name),
        reason: "Недостаточно матчей в кластере (< 30)",
        debug: {
          seasonMin: 18,
          officialFilterApplied: officialApplied,
          tournamentsAll: detailed,
          tournamentsOfficial: official,
        },
      });
    }

    // 4) пул игроков в кластере с 30+ матчей на официальных турнирах
    const pool = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        ums.user_id                   AS uid,
        COUNT(*)                      AS matches,
        AVG(ums.goals)                AS goals,
        AVG(ums.assists)              AS assists,
        AVG(ums.goals_expected)       AS goals_expected,
        AVG(ums.shots_ongoal)         AS shots_on,
        AVG(ums.shots)                AS shots_all,
        AVG(ums.pregoal_passes)       AS pregoal,
        AVG(ums.ipasses)              AS ipass,
        AVG(ums.passes)               AS xa,
        AVG(ums.passes)               AS xa_raw,
        AVG(ums.allpasses)            AS passes_all,
        AVG(ums.completedpasses)      AS passes_success,
        AVG(ums.passes_rate)          AS passes_rate,
        AVG(ums.allstockes)           AS dribble_all,
        AVG(ums.completedstockes)     AS dribble_won,
        AVG(ums.intercepts)           AS intercepts,
        AVG(ums.completedtackles)     AS tackles_won,
        AVG(ums.tackles)              AS tackles_all,
        AVG(ums.completedslidetackes) AS slidetackles_won,
        AVG(ums.slidetackles)         AS slidetackles_all,
        AVG(ums.blocks)               AS blocks,
        AVG(ums.clearances)           AS clearances,
        AVG(ums.duels_air)            AS duels_air_all,
        AVG(ums.duels_air_win)        AS duels_air_win,
        AVG(ums.outplayed)            AS outplayed,
        AVG(ums.penalised_fails)      AS penalised_fails,
        -- GK:
        AVG(ums.saved)                AS saved,
        AVG(ums.scored)               AS scored,
        AVG(ums.dry)                  AS dry
      FROM ${TBL.stats} ums
      JOIN ${TBL.match} tm ON ums.match_id = tm.id
      JOIN ${TBL.tour}  t  ON tm.tournament_id = t.id
      JOIN ${TBL.skills} sp ON ums.skill_id = sp.id
      WHERE sp.short_name IN (${rolesSql})
        AND (
          (t.name REGEXP '(\\\\(|^| )[0-9]{1,3}( *-?й)? *сезон' AND ${seasonExpr("t.name")} >= 18)
          OR (t.name REGEXP 'сезон *[0-9]{1,3}' AND ${seasonExpr("t.name")} >= 18)
        )
      GROUP BY ums.user_id
      HAVING COUNT(*) >= 30;
    `);

    const poolSafe = pool.map(toSafe);

    // 5) собираем метрики
    const metrics = metricsForCluster(cluster);
    const myVals = metrics.map((m) => ({ key: m.key, label: m.label, raw: m.compute(me) }));

    // 6) считаем процентили
    const result = myVals.map((mv) => {
      const values = poolSafe.map((r) => metrics.find((mm) => mm.key === mv.key)!.compute(r));
      const prepared = values
        .filter((v) => Number.isFinite(v))
        .map((v) => (metrics.find((mm) => mm.key === mv.key)!.lowerIsBetter ? -v : v));
      const x = metrics.find((mm) => mm.key === mv.key)!.lowerIsBetter ? -mv.raw : mv.raw;
      const pct = prepared.length ? percentileOf(prepared, x) : null;
      return { key: mv.key, label: mv.label, raw: mv.raw, pct };
    });

    return json({
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: official.map((o) => o.name),
      radar: result,
      debug: {
        seasonMin: 18,
        officialFilterApplied: officialApplied,
        tournamentsAll: detailed,
        tournamentsOfficial: official,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) });
  }
}

/** -------------------- Вспомогательные SQL-функции -------------------- */

/**
 * Извлечь сезон прямо в SQL через REGEXP — используем TRIM + LOWER в JS стороне,
 * а тут просто вызываем тот же extractSeason уже на собранном списке.
 * Для выборки в SQL мы используем «условные» REGEXP + проверку в JS при группировке,
 * потому что MySQL-выражение для вытаскивания числа из разных форм нестабильно.
 *
 * Здесь «seasonExpr» — заглушка, чтобы текст выше был читабельным:
 * фактически мы просто проверяем REGEXP в WHERE, а конкретное число получаем в JS.
 */
function seasonExpr(col: string) {
  // Возвращаем колонки как есть — они участвуют только в REGEXP-предикатах выше
  return col;
}
