// src/app/api/player-radar/[userId]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// -----------------------------
// Кластеры амплуа (short_name из skills_positions.short_name)
// -----------------------------
const CLUSTERS = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"] as const,
  AM: ["ЦАП", "ЦП", "ЛЦП", "ПЦП", "ЛАП", "ПАП"] as const,
  FM: ["ЛП", "ПП"] as const,
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"] as const,
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"] as const,
  GK: ["ВРТ"] as const,
} as const;

type ClusterKey = keyof typeof CLUSTERS;
type RoleCode = (typeof CLUSTERS)[ClusterKey][number];

const OFFICIAL_SEASON_MIN = 18;
const MIN_MATCHES_CLUSTER = 30; // для всех, включая GK

// ------------- утилиты -------------
const toJSON = (x: any) =>
  JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );

const safeNum = (v: any, d = 0) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
};

function resolveClusterByRole(role: string | null): ClusterKey | null {
  if (!role) return null;
  const r = String(role);
  for (const k of Object.keys(CLUSTERS) as ClusterKey[]) {
    if ((CLUSTERS[k] as readonly string[]).includes(r)) return k;
  }
  return null;
}

// -----------------------------
// Автодетект актуального амплуа по последним 30 матчам пользователя
// (не ограничиваем по «официальным», как у тебя было раньше).
// -----------------------------
async function autoDetectRole(prisma: PrismaClient, userId: number) {
  const rows = (await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT sp.short_name AS role
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    WHERE ums.user_id = ?
    ORDER BY tm.timestamp DESC
    LIMIT 30
    `,
    userId
  )) as any[];

  if (!rows?.length) return null;

  const freq = new Map<string, number>();
  for (const r of rows) {
    const code = r.role as string | null;
    if (!code) continue;
    freq.set(code, (freq.get(code) || 0) + 1);
  }
  let best: string | null = null;
  let bestCnt = -1;
  for (const [role, cnt] of freq) {
    if (cnt > bestCnt) {
      best = role;
      bestCnt = cnt;
    }
  }
  return best as RoleCode | null;
}

// -----------------------------
// Разбор сезонов из названия турнира: "... (NN сезон)"
// -----------------------------
function extractSeason(name: string): number | null {
  // допускаем разные пробелы/скобки
  const rx = /\((\d+)\s*сезон\)/i;
  const m = name.match(rx);
  if (!m) return null;
  const num = Number(m[1]);
  return Number.isFinite(num) ? num : null;
}

// -----------------------------
// Основной handler
// -----------------------------
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const userIdStr = params.userId;
    const userId = Number(userIdStr);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: "Bad userId" }, { status: 400 });
    }

    // --- 1) Собираем список турниров пользователя и выделяем «официальные» (сезон >= 18)
    const tourRows = (await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT t.name AS tournament_name, COUNT(*) AS matches
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      WHERE ums.user_id = ?
      GROUP BY t.name
      `,
      userId
    )) as any[];

    const allTournaments = tourRows.map((r) => {
      const name = String(r.tournament_name ?? "");
      const season = extractSeason(name);
      return { name, season, matches: Number(r.matches) || 0 };
    });

    const official = allTournaments.filter(
      (t) => t.season !== null && (t.season as number) >= OFFICIAL_SEASON_MIN
    );

    // --- 2) Определяем актуальную роль по последним 30 матчам (как раньше)
    let currentRole: RoleCode | null = await autoDetectRole(prisma, userId);
    const cluster: ClusterKey | null = resolveClusterByRole(currentRole);

    if (!currentRole || !cluster) {
      return NextResponse.json(
        {
          ok: true,
          ready: false,
          currentRole,
          cluster,
          matchesCluster: 0,
          tournamentsUsed: [],
          reason: "Не удалось определить актуальную роль (последние 30 матчей пусты)",
          debug: {
            seasonMin: OFFICIAL_SEASON_MIN,
            officialFilterApplied: false,
            tournamentsAll: allTournaments,
            tournamentsOfficial: official,
          },
        },
        { status: 200 }
      );
    }

    if (!official.length) {
      return NextResponse.json(
        {
          ok: true,
          ready: false,
          currentRole,
          cluster,
          matchesCluster: 0,
          tournamentsUsed: [],
          reason: "Нет официальных турниров (содержат «сезон» и номер ≥ 18)",
          debug: {
            seasonMin: OFFICIAL_SEASON_MIN,
            officialFilterApplied: false,
            tournamentsAll: allTournaments,
            tournamentsOfficial: [],
          },
        },
        { status: 200 }
      );
    }

    const tourNames = official.map((t) => t.name);

    // -----------------------------
    // 3) Агрегация игрока в официальных турнирах по текущему кластеру
    //    ВАЖНО: фильтрация по sp.short_name IN (...)
    // -----------------------------
    const playerAggRows = (await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        COUNT(*)                                        AS matches,
        SUM(COALESCE(ums.goal, ums.goals, 0))          AS goals,
        SUM(COALESCE(ums.assist, ums.assists, ums.goal_passes, 0)) AS assists,
        SUM(COALESCE(ums.goals_expected, 0))           AS xg,
        SUM(COALESCE(ums.kicked, 0))                   AS shots_all,
        SUM(COALESCE(ums.kickedin, 0))                 AS shots_ontarget,
        SUM(COALESCE(ums.pregoal_passes, 0))           AS pregoal,
        SUM(COALESCE(ums.ipasses, 0))                  AS ipasses,
        SUM(COALESCE(ums.passes, 0))                   AS xa,
        SUM(COALESCE(ums.allpasses, 0))                AS allpasses,
        SUM(COALESCE(ums.completedpasses, 0))          AS completedpasses,
        AVG(COALESCE(ums.passes_rate, 0))              AS pass_rate_avg,
        SUM(COALESCE(ums.allstockes, 0))               AS dribb_all,
        SUM(COALESCE(ums.completedstockes, 0))         AS dribb_ok,
        SUM(COALESCE(ums.intercepts, 0))               AS intercepts,
        SUM(COALESCE(ums.completedtackles, 0))         AS tackles_ok,
        SUM(COALESCE(ums.blocks, 0))                   AS blocks,
        SUM(COALESCE(ums.outplayed, 0) + COALESCE(ums.penalised_fails, 0)) AS beaten,
        SUM(COALESCE(ums.duels_air, 0))                AS air_all,
        SUM(COALESCE(ums.duels_air_win, 0))            AS air_win,
        -- GK
        SUM(COALESCE(ums.saved, 0))                    AS saved,
        SUM(COALESCE(ums.scored, 0))                   AS conceded,
        SUM(CASE WHEN COALESCE(ums.dry, 0) = 1 THEN 1 ELSE 0 END) AS dry_cnt
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      INNER JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE ums.user_id = ?
        AND t.name IN (${tourNames.map(() => "?").join(",")})
        AND sp.short_name IN (${(CLUSTERS[cluster] as readonly string[])
          .map(() => "?")
          .join(",")})
      `,
      userId,
      ...tourNames,
      ...(CLUSTERS[cluster] as readonly string[])
    )) as any[];

    const playerAgg = toJSON((playerAggRows && playerAggRows[0]) || {});
    const matchesCluster = safeNum(playerAgg.matches, 0);

    if (!matchesCluster || matchesCluster < MIN_MATCHES_CLUSTER) {
      return NextResponse.json(
        {
          ok: true,
          ready: false,
          currentRole,
          cluster,
          matchesCluster,
          tournamentsUsed: tourNames,
          reason: "Недостаточно матчей в кластере (< 30)",
          debug: {
            seasonMin: OFFICIAL_SEASON_MIN,
            officialFilterApplied: true,
            tournamentsAll: allTournaments,
            tournamentsOfficial: official,
          },
        },
        { status: 200 }
      );
    }

    // -----------------------------
    // 4) Пул игроков кластера (официальные турниры, HAVING COUNT(*) >= 30)
    //    считаем те же агрегаты, чтобы строить перцентили.
    // -----------------------------
    const poolRows = (await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        ums.user_id AS uid,
        COUNT(*)                                        AS matches,
        SUM(COALESCE(ums.goal, ums.goals, 0))          AS goals,
        SUM(COALESCE(ums.assist, ums.assists, ums.goal_passes, 0)) AS assists,
        SUM(COALESCE(ums.goals_expected, 0))           AS xg,
        SUM(COALESCE(ums.kicked, 0))                   AS shots_all,
        SUM(COALESCE(ums.kickedin, 0))                 AS shots_ontarget,
        SUM(COALESCE(ums.pregoal_passes, 0))           AS pregoal,
        SUM(COALESCE(ums.ipasses, 0))                  AS ipasses,
        SUM(COALESCE(ums.passes, 0))                   AS xa,
        SUM(COALESCE(ums.allpasses, 0))                AS allpasses,
        SUM(COALESCE(ums.completedpasses, 0))          AS completedpasses,
        AVG(COALESCE(ums.passes_rate, 0))              AS pass_rate_avg,
        SUM(COALESCE(ums.allstockes, 0))               AS dribb_all,
        SUM(COALESCE(ums.completedstockes, 0))         AS dribb_ok,
        SUM(COALESCE(ums.intercepts, 0))               AS intercepts,
        SUM(COALESCE(ums.completedtackles, 0))         AS tackles_ok,
        SUM(COALESCE(ums.blocks, 0))                   AS blocks,
        SUM(COALESCE(ums.outplayed, 0) + COALESCE(ums.penalised_fails, 0)) AS beaten,
        SUM(COALESCE(ums.duels_air, 0))                AS air_all,
        SUM(COALESCE(ums.duels_air_win, 0))            AS air_win,
        -- GK
        SUM(COALESCE(ums.saved, 0))                    AS saved,
        SUM(COALESCE(ums.scored, 0))                   AS conceded,
        SUM(CASE WHEN COALESCE(ums.dry, 0) = 1 THEN 1 ELSE 0 END) AS dry_cnt
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      INNER JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE t.name IN (${tourNames.map(() => "?").join(",")})
        AND sp.short_name IN (${(CLUSTERS[cluster] as readonly string[])
          .map(() => "?")
          .join(",")})
      GROUP BY ums.user_id
      HAVING COUNT(*) >= ?
      `,
      ...tourNames,
      ...(CLUSTERS[cluster] as readonly string[]),
      MIN_MATCHES_CLUSTER
    )) as any[];

    const pool = toJSON(poolRows || []);

    // -----------------------------
    // 5) Формулы метрик и перцентили
    // -----------------------------
    function perMatch(sum: number) {
      return matchesCluster ? sum / matchesCluster : 0;
    }
    function pctOf(part: number, whole: number) {
      return whole > 0 ? part / whole : 0;
    }

    // значения игрока (raw)
    const goals = safeNum(playerAgg.goals);
    const assists = safeNum(playerAgg.assists);
    const xg = safeNum(playerAgg.xg);
    const shotsAll = safeNum(playerAgg.shots_all);
    const shotsOn = safeNum(playerAgg.shots_ontarget);
    const pregoal = safeNum(playerAgg.pregoal);
    const ipasses = safeNum(playerAgg.ipasses);
    const xa = safeNum(playerAgg.xa);
    const allpasses = safeNum(playerAgg.allpasses);
    const completedpasses = safeNum(playerAgg.completedpasses);
    const passRateAvg = safeNum(playerAgg.pass_rate_avg);
    const drAll = safeNum(playerAgg.dribb_all);
    const drOk = safeNum(playerAgg.dribb_ok);
    const intercepts = safeNum(playerAgg.intercepts);
    const tacklesOk = safeNum(playerAgg.tackles_ok);
    const blocks = safeNum(playerAgg.blocks);
    const beaten = safeNum(playerAgg.beaten);
    const airAll = safeNum(playerAgg.air_all);
    const airWin = safeNum(playerAgg.air_win);
    const saved = safeNum(playerAgg.saved);
    const conceded = safeNum(playerAgg.conceded);
    const dryCnt = safeNum(playerAgg.dry_cnt);

    // компоновка метрик по кластерам (перечень — как мы фиксировали ранее)
    const isGK = cluster === "GK";

    // Общие вспомогательные «сырые» для игрока
    const goal_contrib_raw = perMatch(goals + assists);
    const xg_delta_raw = perMatch(goals - xg);
    const shots_on_target_pct_raw = pctOf(shotsOn, shotsAll); // 
    const creation_raw = perMatch(pregoal + ipasses + 2 * xa);
    const dribble_pct_raw = pctOf(drOk, drAll);
    const pressing_raw = perMatch(intercepts + tacklesOk);
    const passes_pm_raw = perMatch(allpasses);
    const pass_acc_raw = passRateAvg; // уже %
    const def_actions_raw = perMatch(intercepts + tacklesOk + blocks);
    const beaten_rate_raw = (() => {
      const denom = intercepts + tacklesOk + blocks;
      return denom > 0 ? beaten / denom : 0;
    })();
    const air_pct_raw = pctOf(airWin, airAll);

    // GK
    const save_pct_raw = (() => {
      const total = saved + conceded;
      return total > 0 ? saved / total : 0;
    })();
    const saves_pm_raw = perMatch(saved);
    const clean_sheets_pct_raw = pctOf(dryCnt, matchesCluster);

    // pXA по твоей формуле: SUM(allpasses) / SUM(passes/0.5) = 2*allpasses / xa
    const pxa_raw = xa > 0 ? (2 * allpasses) / xa : 0;

    // Пуловые значения (для перцентилей)
    function collectPool(fn: (r: any) => number) {
      const arr: number[] = [];
      for (const r of pool) {
        const m = safeNum(r.matches, 0);
        if (m <= 0) continue;
        arr.push(fn(r));
      }
      return arr.sort((a, b) => a - b);
    }

    // Перцентиль: доля значений <= value (0..100)
    function percentile(sorted: number[], value: number) {
      if (!sorted.length) return null;
      let lo = 0,
        hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] <= value) lo = mid + 1;
        else hi = mid;
      }
      const p = Math.floor((lo / sorted.length) * 100);
      return p;
    }

    // Функции получения «сырых» из пула
    const get = (r: any, k: string) => safeNum(r[k], 0);
    const perM = (r: any, sumKey: string) => {
      const m = safeNum(r.matches, 0);
      return m > 0 ? safeNum(r[sumKey], 0) / m : 0;
    };
    const pct = (num: number, den: number) => (den > 0 ? num / den : 0);

    // Пуловые ряды по кластеру
    const pool_goal_contrib = collectPool((r) =>
      perM(r, "goals") + perM(r, "assists")
    );
    const pool_xg_delta = collectPool((r) => perM(r, "goals") - perM(r, "xg"));
    const pool_shots_on = collectPool((r) => pct(get(r, "shots_ontarget"), get(r, "shots_all")));
    const pool_creation = collectPool(
      (r) => perM(r, "pregoal") + perM(r, "ipasses") + 2 * perM(r, "xa")
    );
    const pool_dribble = collectPool((r) => pct(get(r, "dribb_ok"), get(r, "dribb_all")));
    const pool_pressing = collectPool((r) => perM(r, "intercepts") + perM(r, "tackles_ok"));
    const pool_passes_pm = collectPool((r) => perM(r, "allpasses"));
    const pool_pass_acc = collectPool((r) => safeNum(r.pass_rate_avg, 0));
    const pool_def_actions = collectPool(
      (r) => perM(r, "intercepts") + perM(r, "tackles_ok") + perM(r, "blocks")
    );
    const pool_beaten_rate = collectPool((r) => {
      const denom = get(r, "intercepts") + get(r, "tackles_ok") + get(r, "blocks");
      const br = denom > 0 ? get(r, "beaten") / denom : 0;
      return br;
    });
    const pool_air_pct = collectPool((r) => pct(get(r, "air_win"), get(r, "air_all")));

    // GK
    const pool_save_pct = collectPool((r) => {
      const total = get(r, "saved") + get(r, "conceded");
      return total > 0 ? get(r, "saved") / total : 0;
    });
    const pool_saves_pm = collectPool((r) => perM(r, "saved"));
    const pool_clean_pct = collectPool((r) => {
      const m = safeNum(r.matches, 0);
      return m > 0 ? get(r, "dry_cnt") / m : 0;
    });

    // Компоновка радара под кластер
    let radar: Array<{ key: string; label: string; raw: number; pct: number | null }> = [];

    if (isGK) {
      radar = [
        { key: "save_pct", label: "% сейвов", raw: save_pct_raw, pct: percentile(pool_save_pct, save_pct_raw) },
        { key: "saves_pm", label: "Сейвы/матч", raw: saves_pm_raw, pct: percentile(pool_saves_pm, saves_pm_raw) },
        { key: "intercepts", label: "Перехваты/матч", raw: perMatch(intercepts), pct: percentile(collectPool(r => perM(r,"intercepts")), perMatch(intercepts)) },
        { key: "passes_pm", label: "Пасы/матч", raw: passes_pm_raw, pct: percentile(pool_passes_pm, passes_pm_raw) },
        { key: "clean_pct", label: "% сухих", raw: clean_sheets_pct_raw, pct: percentile(pool_clean_pct, clean_sheets_pct_raw) },
      ];
    } else {
      switch (cluster) {
        case "FW":
          radar = [
            { key: "goal_contrib", label: "Гол+пас", raw: goal_contrib_raw, pct: percentile(pool_goal_contrib, goal_contrib_raw) },
            { key: "xg_delta", label: "Реализация xG", raw: xg_delta_raw, pct: percentile(pool_xg_delta, xg_delta_raw) },
            { key: "shots_on_target_pct", label: "Удары в створ %", raw: shots_on_target_pct_raw, pct: percentile(pool_shots_on, shots_on_target_pct_raw) },
            { key: "creation", label: "Созидание", raw: creation_raw, pct: percentile(pool_creation, creation_raw) },
            { key: "dribble_pct", label: "Дриблинг %", raw: dribble_pct_raw, pct: percentile(pool_dribble, dribble_pct_raw) },
            { key: "pressing", label: "Прессинг", raw: pressing_raw, pct: percentile(pool_pressing, pressing_raw) },
          ];
          break;
        case "AM":
          radar = [
            { key: "xa", label: "xA/матч", raw: perMatch(xa), pct: percentile(collectPool(r => perM(r,"xa")), perMatch(xa)) },
            { key: "pxa", label: "pXA (↓ лучше)", raw: pxa_raw, pct: percentile(collectPool(r => {
                const xaSum = safeNum(r.xa,0);
                const ap = safeNum(r.allpasses,0);
                return xaSum>0 ? (2*ap)/xaSum : 0;
              }), pxa_raw) },
            { key: "goal_contrib", label: "Гол+пас", raw: goal_contrib_raw, pct: percentile(pool_goal_contrib, goal_contrib_raw) },
            { key: "pass_acc", label: "Точность пасов %", raw: pass_acc_raw, pct: percentile(pool_pass_acc, pass_acc_raw) },
            { key: "dribble_pct", label: "Дриблинг %", raw: dribble_pct_raw, pct: percentile(pool_dribble, dribble_pct_raw) },
            { key: "pressing", label: "Прессинг", raw: pressing_raw, pct: percentile(pool_pressing, pressing_raw) },
          ];
          break;
        case "FM":
          radar = [
            { key: "creation", label: "Созидание", raw: creation_raw, pct: percentile(pool_creation, creation_raw) },
            { key: "passes_pm", label: "Пасы/матч", raw: passes_pm_raw, pct: percentile(pool_passes_pm, passes_pm_raw) },
            { key: "pass_acc", label: "Точность пасов %", raw: pass_acc_raw, pct: percentile(pool_pass_acc, pass_acc_raw) },
            { key: "def_actions", label: "Защитн. действия", raw: def_actions_raw, pct: percentile(pool_def_actions, def_actions_raw) },
            { key: "beaten_rate", label: "Beaten Rate (↓ лучше)", raw: beaten_rate_raw, pct: percentile(pool_beaten_rate, beaten_rate_raw) },
            { key: "air_pct", label: "Верховые %", raw: air_pct_raw, pct: percentile(pool_air_pct, air_pct_raw) },
          ];
          break;
        case "CM":
          radar = [
            { key: "creation", label: "Созидание", raw: creation_raw, pct: percentile(pool_creation, creation_raw) },
            { key: "passes_pm", label: "Пасы/матч", raw: passes_pm_raw, pct: percentile(pool_passes_pm, passes_pm_raw) },
            { key: "pass_acc", label: "Точность пасов %", raw: pass_acc_raw, pct: percentile(pool_pass_acc, pass_acc_raw) },
            { key: "def_actions", label: "Защитн. действия", raw: def_actions_raw, pct: percentile(pool_def_actions, def_actions_raw) },
            { key: "beaten_rate", label: "Beaten Rate (↓ лучше)", raw: beaten_rate_raw, pct: percentile(pool_beaten_rate, beaten_rate_raw) },
            { key: "air_pct", label: "Верховые %", raw: air_pct_raw, pct: percentile(pool_air_pct, air_pct_raw) },
          ];
          break;
        case "CB":
          radar = [
            { key: "safety", label: "Кэф безопасности", raw:
                0.5 * pct(completedpasses, allpasses) +
                0.3 * pct(drOk, drAll) +
                0.15 * pct(airWin, airAll) +
                0.05 * ( // «% удачных отборов» (если есть попытки)
                  (() => {
                    const atts = safeNum(playerAgg.tackles_all, 0); // если такой колонки нет, будет 0
                    return atts > 0 ? tacklesOk / atts : 0;
                  })()
                ),
              pct: null // пул для safety можно добавить отдельно, если потребуется
            },
            { key: "def_actions", label: "Защитн. действия", raw: def_actions_raw, pct: percentile(pool_def_actions, def_actions_raw) },
            { key: "tackles_ok_pct", label: "% успешных отборов", raw: (() => {
                const atts = safeNum(playerAgg.tackles_all, 0);
                return atts > 0 ? tacklesOk / atts : 0;
              })(), pct: null },
            { key: "clearances", label: "Выносы/матч", raw: perMatch(safeNum(playerAgg.clearances, 0)), pct: null },
            { key: "pass_acc", label: "Точность пасов %", raw: pass_acc_raw, pct: percentile(pool_pass_acc, pass_acc_raw) },
            { key: "air_pct", label: "Верховые %", raw: air_pct_raw, pct: percentile(pool_air_pct, air_pct_raw) },
            { key: "beaten_rate", label: "Beaten Rate (↓ лучше)", raw: beaten_rate_raw, pct: percentile(pool_beaten_rate, beaten_rate_raw) },
          ];
          break;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        ready: true,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: tourNames,
        radar,
        debug: {
          seasonMin: OFFICIAL_SEASON_MIN,
          officialFilterApplied: true,
          tournamentsAll: allTournaments,
          tournamentsOfficial: official,
        },
      },
      { status: 200 }
    );
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
