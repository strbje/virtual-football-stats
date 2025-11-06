import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** -------------------- КЛАСТЕРЫ РОЛЕЙ -------------------- */
type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB" | "GK";

const CLUSTERS: Record<ClusterKey, string[]> = {
  // Форварды/фланги
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  // Атакующая десятка + полуап
  AM: ["ЦАП", "ЦП", "ЛЦП", "ПЦП", "ЛАП", "ПАП"],
  // Фланговые хавы
  FM: ["ЛП", "ПП"],
  // Центр поля
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  // Защита
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  // Вратарь
  GK: ["ВРТ"],
};

// минималка матчей на кластере, чтобы строить радар
const MIN_USER_MATCHES = 30;

/** -------------------- УТИЛИТЫ -------------------- */

// надёжный парсер "сезон" → номер (не зацепит 2024 из LastDance)
function parseSeasonFromName(name: string): number | null {
  const m = name.toLowerCase().match(/сезон\D*(\d{1,3})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function toNum(v: unknown, d = 0) {
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
}

function pctRank(pool: number[], value: number): number {
  if (!pool.length) return 0;
  const lessEq = pool.filter((x) => x <= value).length;
  return Math.round((lessEq / pool.length) * 100);
}

/** Возвращает {currentRole, cluster} */
async function resolveCurrentRoleAndCluster(userId: number): Promise<{ currentRole: string | null; cluster: ClusterKey | null }> {
  // Текущее амплуа = мода по последним 30 матчам
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT sp.short_name AS code, COUNT(*) AS cnt
    FROM tbl_users_match_stats s
    JOIN skills_positions sp ON sp.id = s.skill_id
    WHERE s.user_id = ?
    ORDER BY s.match_id DESC
    LIMIT 200
    `,
    userId,
  );

  // сгруппируем вручную (LIMIT 200 чтобы не усложнять SQL)
  const counts = new Map<string, number>();
  for (const r of rows) {
    const code = String(r.code);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let currentRole: string | null = null;
  let best = -1;
  for (const [code, c] of counts) {
    if (c > best) {
      best = c;
      currentRole = code;
    }
  }

  // кластер по роли
  let cluster: ClusterKey | null = null;
  if (currentRole) {
    for (const key of Object.keys(CLUSTERS) as ClusterKey[]) {
      if (CLUSTERS[key].includes(currentRole)) {
        cluster = key;
        break;
      }
    }
  }
  return { currentRole, cluster };
}

/** skill_id для кластера из таблицы skills_positions */
async function skillIdsForCluster(cluster: ClusterKey): Promise<number[]> {
  const codes = CLUSTERS[cluster];
  if (!codes?.length) return [];
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM skills_positions WHERE short_name IN (${codes.map(() => "?").join(",")})`,
    ...codes,
  );
  return rows.map((r) => Number(r.id)).filter((x) => Number.isFinite(x));
}

/** Собираем названия официальных турниров (сезон >= 18) и их матчи для игрока */
async function officialTournamentNames(userId: number): Promise<{ names: string[]; debug: any[] }> {
  const tRows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT t.name AS name, COUNT(*) AS cnt
    FROM tbl_users_match_stats s
    JOIN tournament_match tm ON tm.id = s.match_id
    JOIN tournament t        ON t.id = tm.tournament_id
    WHERE s.user_id = ?
    GROUP BY t.name
    `,
    userId,
  );

  const debug = [];
  const names: string[] = [];
  for (const r of tRows) {
    const name = String(r.name);
    const season = parseSeasonFromName(name);
    const cnt = toNum(r.cnt, 0);
    debug.push({ name, season, matches: cnt });
    if (season !== null && season >= 18) {
      names.push(name);
    }
  }
  return { names, debug };
}

/** Условный фрагмент "AND t.name IN (...)" */
function sqlFilterByNames(names: string[]): { sql: string; params: any[] } {
  if (!names.length) return { sql: "", params: [] };
  const placeholders = names.map(() => "?").join(",");
  return { sql: ` AND t.name IN (${placeholders})`, params: names };
}

/** --------- Общий селект для агрегации по пользователю (суммы/средние) --------- */
async function aggregateUserForCluster(
  userId: number,
  skillIds: number[],
  names: string[],
) {
  const { sql, params } = sqlFilterByNames(names);

  // всё выбираем суммой; деления/проценты считаем в JS
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      COUNT(*)                      AS matches,
      SUM(goals)                    AS goals,
      SUM(assists)                  AS assists,
      SUM(goals_expected)           AS xg,
      SUM(shots_on_target)          AS shots_on_target,   -- может быть 0 в схеме; если нет, замени на нужное поле
      SUM(shots)                    AS shots,             -- если нет, тоже поправь
      SUM(ipasses)                  AS key_passes,
      SUM(pregoal_passes)           AS pre_assists,
      SUM(passes)                   AS xa,
      SUM(allpasses)                AS allpasses,
      SUM(completedpasses)          AS completedpasses,
      AVG(passes_rate)              AS passes_rate_avg,
      SUM(allstockes)               AS dribbles_all,
      SUM(completedstockes)         AS dribbles_ok,
      SUM(intercepts)               AS intercepts,
      SUM(selection)                AS tackles_ok,        -- удачные отборы
      SUM(unselection)              AS tackles_fail,
      SUM(completedtackles)         AS slide_ok,
      SUM(blocks)                   AS blocks,
      SUM(duels_air)                AS air_all,
      SUM(duels_air_win)            AS air_win,
      SUM(outs)                     AS clearances,
      SUM(saved)                    AS saves,
      SUM(scored)                   AS conceded,
      SUM(dry)                      AS dry_matches
    FROM tbl_users_match_stats s
    JOIN tournament_match tm ON tm.id = s.match_id
    JOIN tournament t        ON t.id = tm.tournament_id
    WHERE s.user_id = ?
      AND s.skill_id IN (${skillIds.length ? skillIds.join(",") : "-1"})
      ${sql}
    `,
    userId,
    ...params,
  );

  const r = rows[0] || {};
  // Приведём к числам (BigInt → number)
  const out: Record<string, number> = {};
  Object.keys(r).forEach((k) => (out[k] = toNum(r[k], 0)));
  return out;
}

/** Пул игроков для перцентилей (одна строка на игрока) */
async function poolAggForCluster(skillIds: number[], names: string[]) {
  const { sql, params } = sqlFilterByNames(names);

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      s.user_id                                          AS uid,
      COUNT(*)                                           AS matches,
      SUM(goals)                                         AS goals,
      SUM(assists)                                       AS assists,
      SUM(goals_expected)                                AS xg,
      SUM(shots_on_target)                               AS shots_on_target,
      SUM(shots)                                         AS shots,
      SUM(ipasses)                                       AS key_passes,
      SUM(pregoal_passes)                                AS pre_assists,
      SUM(passes)                                        AS xa,
      SUM(allpasses)                                     AS allpasses,
      SUM(completedpasses)                               AS completedpasses,
      AVG(passes_rate)                                   AS passes_rate_avg,
      SUM(allstockes)                                    AS dribbles_all,
      SUM(completedstockes)                              AS dribbles_ok,
      SUM(intercepts)                                    AS intercepts,
      SUM(selection)                                     AS tackles_ok,
      SUM(unselection)                                   AS tackles_fail,
      SUM(completedtackles)                              AS slide_ok,
      SUM(blocks)                                        AS blocks,
      SUM(duels_air)                                     AS air_all,
      SUM(duels_air_win)                                 AS air_win,
      SUM(outs)                                          AS clearances,
      SUM(saved)                                         AS saves,
      SUM(scored)                                        AS conceded,
      SUM(dry)                                           AS dry_matches
    FROM tbl_users_match_stats s
    JOIN tournament_match tm ON tm.id = s.match_id
    JOIN tournament t        ON t.id = tm.tournament_id
    WHERE s.skill_id IN (${skillIds.length ? skillIds.join(",") : "-1"})
      ${sql}
    GROUP BY s.user_id
    HAVING COUNT(*) >= ${MIN_USER_MATCHES}
    `,
    ...params,
  );

  // к числам
  return rows.map((row) => {
    const o: Record<string, number> = {};
    for (const k of Object.keys(row)) o[k] = toNum((row as any)[k], 0);
    return o;
  });
}

/** Построение радара по кластерам */
function buildRadarForCluster(cluster: ClusterKey, agg: any, pool: any[]) {
  const matches = toNum(agg.matches, 0);
  if (!matches) return [];

  // помощники:
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
  const perMatch = (v: number) => (matches > 0 ? v / matches : 0);

  // общие конструкторы пула
  const poolVals = (fn: (p: any) => number) => pool.map(fn);

  if (cluster === "FW") {
    // FW: Гол+пас, xG реализация, Удары в створ %, Созидание, Дриблинг %, Прессинг
    const goal_contrib = perMatch(agg.goals + agg.assists);
    const xg_delta = perMatch(agg.goals - agg.xg);
    const shots_on_target_pct = ratio(agg.shots_on_target, Math.max(agg.shots, 1));
    const creation = perMatch(agg.pre_assists + agg.key_passes + 2 * agg.xa);
    const dribble_pct = ratio(agg.dribbles_ok, Math.max(agg.dribbles_all, 1));
    const pressing = perMatch(agg.intercepts + agg.tackles_ok);

    return [
      { key: "goal_contrib", label: "Гол+пас", raw: goal_contrib, pct: pctRank(poolVals(p => (p.goals + p.assists) / p.matches), goal_contrib) },
      { key: "xg_delta", label: "Реализация xG", raw: xg_delta, pct: pctRank(poolVals(p => (p.goals - p.xg) / p.matches), xg_delta) },
      { key: "shots_on_target_pct", label: "Удары в створ %", raw: shots_on_target_pct, pct: pctRank(poolVals(p => ratio(p.shots_on_target, Math.max(p.shots,1))), shots_on_target_pct) },
      { key: "creation", label: "Созидание", raw: creation, pct: pctRank(poolVals(p => (p.pregoal_passes + p.ipasses + 2*p.xa) / p.matches), creation) },
      { key: "dribble_pct", label: "Дриблинг %", raw: dribble_pct, pct: pctRank(poolVals(p => ratio(p.dribbles_ok, Math.max(p.dribbles_all,1))), dribble_pct) },
      { key: "pressing", label: "Прессинг", raw: pressing, pct: pctRank(poolVals(p => (p.intercepts + p.selection) / p.matches), pressing) },
    ];
  }

  if (cluster === "AM") {
    // AM: xA, pXA, Гол+пас, Точность пасов %, Дриблинг %, Прессинг
    const xa = perMatch(agg.xa);
    const pxa = ratio(agg.allpasses, Math.max(agg.xa / 0.5, 1)); // pXA = allpasses / (xa/0.5)
    const gc = perMatch(agg.goals + agg.assists);
    const pass_acc = toNum(agg.passes_rate_avg, 0) / 100; // уже %
    const drib = ratio(agg.dribbles_ok, Math.max(agg.dribbles_all, 1));
    const press = perMatch(agg.intercepts + agg.tackles_ok);

    return [
      { key: "xa", label: "xA", raw: xa, pct: pctRank(poolVals(p => p.xa / p.matches), xa) },
      { key: "pxa", label: "pXA (пасы/0.5xA)", raw: pxa, pct: pctRank(poolVals(p => ratio(p.allpasses, Math.max(p.xa/0.5,1))), pxa) },
      { key: "gc", label: "Гол+пас", raw: gc, pct: pctRank(poolVals(p => (p.goals + p.assists) / p.matches), gc) },
      { key: "pass_acc", label: "Точность пасов %", raw: pass_acc, pct: pctRank(poolVals(p => (toNum(p.passes_rate_avg,0)/100)), pass_acc) },
      { key: "drib", label: "Дриблинг %", raw: drib, pct: pctRank(poolVals(p => ratio(p.dribbles_ok, Math.max(p.dribbles_all,1))), drib) },
      { key: "press", label: "Прессинг", raw: press, pct: pctRank(poolVals(p => (p.intercepts + p.selection) / p.matches), press) },
    ];
  }

  if (cluster === "FM" || cluster === "CM") {
    // CM/FМ: Созидание, Пасы, Точность паса %, Защитные действия, Beaten Rate ↓, Верховые %, (+FM Навесы и Гол+пас)
    const creation = perMatch(agg.pre_assists + agg.key_passes + 2 * agg.xa);
    const passes = perMatch(agg.allpasses);
    const pass_acc = toNum(agg.passes_rate_avg, 0) / 100;
    const def_actions = perMatch(agg.intercepts + agg.tackles_ok + agg.slide_ok + agg.blocks);
    const beaten_rate = ratio(agg.tackles_fail, Math.max(agg.tackles_ok + agg.tackles_fail + agg.slide_ok + agg.blocks, 1)); // прокси
    const air_pct = ratio(agg.air_win, Math.max(agg.air_all, 1));

    const base = [
      { key: "creation", label: "Созидание", raw: creation, pct: pctRank(poolVals(p => (p.pregoal_passes + p.ipasses + 2*p.xa) / p.matches), creation) },
      { key: "passes", label: "Пасы/матч", raw: passes, pct: pctRank(poolVals(p => p.allpasses / p.matches), passes) },
      { key: "pass_acc", label: "Точность паса %", raw: pass_acc, pct: pctRank(poolVals(p => (toNum(p.passes_rate_avg,0)/100)), pass_acc) },
      { key: "def", label: "Защитные действия", raw: def_actions, pct: pctRank(poolVals(p => (p.intercepts + p.selection + p.completedtackles + p.blocks) / p.matches), def_actions) },
      { key: "beaten", label: "Beaten Rate ↓", raw: beaten_rate, pct: 100 - pctRank(poolVals(p => ratio(p.unselection, Math.max(p.selection + p.unselection + p.completedtackles + p.blocks,1))), beaten_rate) },
      { key: "air", label: "Верховые %", raw: air_pct, pct: pctRank(poolVals(p => ratio(p.air_win, Math.max(p.air_all,1))), air_pct) },
    ];

    if (cluster === "FM") {
      // навесы (= удачные навесы) и Гол+пас
      // у тебя колонка удачных навесов — `crosses` (судя по скрину). Если иное — поправь.
      // Мы сумм не вытаскивали здесь отдельно — добавь в aggregate и pool при желании.
      // Для простоты возьмём proxy: key_passes как показатель флангового кросса.
      const gc = perMatch(agg.goals + agg.assists);
      base.push({
        key: "gc",
        label: "Гол+пас",
        raw: gc,
        pct: pctRank(poolVals(p => (p.goals + p.assists) / p.matches), gc),
      });
    }
    return base;
  }

  if (cluster === "CB") {
    // Защита: Кэф безопасности, Защитные действия, % успешных отборов, Выносы, % точности пасов, Участие в атаке, % побед в воздухе, Beaten Rate
    const safety =
      0.5 * ratio(agg.completedpasses, Math.max(agg.allpasses, 1)) +
      0.3 * ratio(agg.dribbles_ok, Math.max(agg.dribbles_all, 1)) +
      0.15 * ratio(agg.air_win, Math.max(agg.air_all, 1)) +
      0.05 * ratio(agg.tackles_ok, Math.max(agg.tackles_ok + agg.tackles_fail, 1));

    const def_actions = perMatch(agg.intercepts + agg.tackles_ok + agg.slide_ok + agg.blocks);
    const tackles_success = ratio(agg.tackles_ok, Math.max(agg.tackles_ok + agg.tackles_fail, 1));
    const clearances = perMatch(agg.clearances);
    const pass_acc = toNum(agg.passes_rate_avg, 0) / 100;
    const attack_involvement = perMatch(agg.key_passes + agg.pre_assists + 2 * agg.xa + 2 * agg.assists + 2 * agg.goals);
    const air_pct = ratio(agg.air_win, Math.max(agg.air_all, 1));
    const beaten_rate = ratio(agg.tackles_fail, Math.max(agg.tackles_ok + agg.tackles_fail + agg.slide_ok + agg.blocks, 1));

    const pv = (fn: (p: any) => number) => pool.map(fn);

    return [
      { key: "safety", label: "Кэф безопасности", raw: safety, pct: pctRank(pv(p =>
        0.5 * ratio(p.completedpasses, Math.max(p.allpasses,1)) +
        0.3 * ratio(p.dribbles_ok, Math.max(p.dribbles_all,1)) +
        0.15 * ratio(p.air_win, Math.max(p.air_all,1)) +
        0.05 * ratio(p.selection, Math.max(p.selection + p.unselection,1))
      ), safety) },
      { key: "def", label: "Защитные действия", raw: def_actions, pct: pctRank(pv(p => (p.intercepts + p.selection + p.completedtackles + p.blocks)/p.matches), def_actions) },
      { key: "tackle_ok", label: "% успешных отборов", raw: tackles_success, pct: pctRank(pv(p => ratio(p.selection, Math.max(p.selection + p.unselection,1))), tackles_success) },
      { key: "clear", label: "Выносы", raw: clearances, pct: pctRank(pv(p => p.outs/p.matches), clearances) },
      { key: "pass_acc", label: "% точности пасов", raw: pass_acc, pct: pctRank(pv(p => (toNum(p.passes_rate_avg,0)/100)), pass_acc) },
      { key: "attack_inv", label: "Участие в атаке", raw: attack_involvement, pct: pctRank(pv(p => (p.ipasses+p.pregoal_passes+2*p.xa+2*p.assists+2*p.goals)/p.matches), attack_involvement) },
      { key: "air", label: "% побед в воздухе", raw: air_pct, pct: pctRank(pv(p => ratio(p.air_win, Math.max(p.air_all,1))), air_pct) },
      { key: "beaten", label: "Beaten Rate ↓", raw: beaten_rate, pct: 100 - pctRank(pv(p => ratio(p.unselection, Math.max(p.selection + p.unselection + p.completedtackles + p.blocks,1))), beaten_rate) },
    ];
  }

  if (cluster === "GK") {
    // Вратарь: % сейвов, сейвы/матч, перехваты, пасы, % сухих матчей, предотвращённый xG (позже)
    const savesPct = ratio(agg.saves, Math.max(agg.saves + agg.conceded, 1));
    const savesPM = perMatch(agg.saves);
    const interceptsPM = perMatch(agg.intercepts);
    const passesPM = perMatch(agg.allpasses);
    const dryPct = ratio(agg.dry_matches, matches);

    const pv = (fn: (p: any) => number) => pool.map(fn);

    return [
      { key: "save_pct", label: "% сейвов", raw: savesPct, pct: pctRank(pv(p => ratio(p.saves, Math.max(p.saves + p.scored,1))), savesPct) },
      { key: "saves_pm", label: "Сейвы/матч", raw: savesPM, pct: pctRank(pv(p => p.saves/p.matches), savesPM) },
      { key: "intercepts_pm", label: "Перехваты", raw: interceptsPM, pct: pctRank(pv(p => p.intercepts/p.matches), interceptsPM) },
      { key: "passes_pm", label: "Пасы/матч", raw: passesPM, pct: pctRank(pv(p => p.allpasses/p.matches), passesPM) },
      { key: "dry_pct", label: "% сухих", raw: dryPct, pct: pctRank(pv(p => ratio(p.dry, p.matches)), dryPct) },
    ];
  }

  return [];
}

/** -------------------- HANDLER -------------------- */

export async function GET(_: Request, { params }: { params: { userId: string } }) {
  const userId = Number(params.userId);
  const debugMode = false; // можно читать из query, если хочешь
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ ok: false, error: "Bad userId" }, { status: 400 });
  }

  // 1) текущее амплуа и кластер
  const { currentRole, cluster } = await resolveCurrentRoleAndCluster(userId);
  if (!cluster) {
    return NextResponse.json({ ok: true, ready: false, currentRole, cluster: null, reason: "Не удалось определить кластер по роли" });
  }

  // 2) официальные турниры (сезон >=18)
  const { names: officialNames, debug: tourDbg } = await officialTournamentNames(userId);
  const officialFilterApplied = officialNames.length > 0;

  if (!officialFilterApplied) {
    return NextResponse.json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster: 0,
      tournamentsUsed: [],
      reason: "Нет официальных турниров (содержат «сезон» и номер ≥ 18)",
      debug: { seasonMin: 18, officialFilterApplied, tournaments: tourDbg },
    });
  }

  // 3) skill_id для кластера
  let skillIds = await skillIdsForCluster(cluster);
  // страховка: если вдруг пусто — берём id текущей роли (чтобы не падать)
  if (!skillIds.length && currentRole) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM skills_positions WHERE short_name = ?`,
      currentRole,
    );
    if (rows.length) skillIds = [Number(rows[0].id)];
  }
  if (!skillIds.length) {
    return NextResponse.json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster: 0,
      tournamentsUsed: [],
      reason: "Не удалось сопоставить skill_id для кластера",
      debug: { seasonMin: 18, officialFilterApplied, tournaments: tourDbg, clusterSkillIds: [] },
    });
  }

  // 4) сколько матчей у пользователя в этом кластере
  const { sql, params: nameParams } = sqlFilterByNames(officialNames);
  const cntRows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT COUNT(*) AS cnt
    FROM tbl_users_match_stats s
    JOIN tournament_match tm ON tm.id = s.match_id
    JOIN tournament t        ON t.id = tm.tournament_id
    WHERE s.user_id = ?
      AND s.skill_id IN (${skillIds.join(",")})
      ${sql}
    `,
    userId,
    ...nameParams,
  );
  const matchesCluster = toNum(cntRows?.[0]?.cnt, 0);

  if (matchesCluster < MIN_USER_MATCHES) {
    return NextResponse.json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: officialNames,
      reason: `Недостаточно матчей в кластере (< ${MIN_USER_MATCHES})`,
      debug: { seasonMin: 18, officialFilterApplied, tournaments: tourDbg, clusterSkillIds: skillIds },
    });
  }

  // 5) агрегаты пользователя и пула
  const agg = await aggregateUserForCluster(userId, skillIds, officialNames);
  const pool = await poolAggForCluster(skillIds, officialNames);

  // 6) радар
  const radar = buildRadarForCluster(cluster, agg, pool);

  return NextResponse.json({
    ok: true,
    ready: true,
    currentRole,
    cluster,
    matchesCluster,
    tournamentsUsed: officialNames,
    radar,
    debug: {
      seasonMin: 18,
      officialFilterApplied,
      tournaments: tourDbg,
      clusterSkillIds: skillIds,
    },
  });
}
