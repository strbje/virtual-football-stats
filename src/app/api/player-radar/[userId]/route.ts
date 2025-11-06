// src/app/api/player-radar/[userId]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---- Кластеры ролей (то, как у нас на странице) ----
type ClusterKey = "FW" | "AM" | "FM" | "CM" | "CB" | "GK";
type RoleCode = string;

const CLUSTERS: Record<ClusterKey, RoleCode[]> = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЦП", "ЛЦП", "ПЦП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВРТ"],
};

// инвертируем вычисление перцентиля для метрик «меньше = лучше»
const INVERTED_PCT = new Set<string>(["beaten_rate", "gk_conceded_per_match"]);

// ---- утилиты ----
const json = (data: any, init?: number) =>
  NextResponse.json(data, { status: init ?? 200 });

function safeNum(v: any, d = 0) {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
}

// Парсим «…(18 сезон)», «(24 сезон)» и т.п.; остальные (LastDance и т.п.) отсеиваем
function extractSeason(name: string): number | null {
  const m = name.toLowerCase().match(/сезон\D*(\d{1,3})/i);
  if (!m) return null;
  const s = Number(m[1]);
  return Number.isFinite(s) ? s : null;
}

function resolveClusterByRole(role: RoleCode): ClusterKey | null {
  for (const k of Object.keys(CLUSTERS) as ClusterKey[]) {
    if (CLUSTERS[k].includes(role)) return k;
  }
  return null;
}

// Если страница не передала ?role=… — fallback: берём самую частую роль из последних 30 матчей
async function autoDetectRole(prisma: PrismaClient, userId: number): Promise<RoleCode | null> {
  // skills_positions.short_name — это «ФРВ», «ЦАП» и т.д.
  const rows: { role: string; cnt: bigint }[] = await prisma.$queryRawUnsafe(`
    SELECT sp.short_name AS role, COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    JOIN skills_positions sp ON sp.id = ums.skill_id
    WHERE ums.user_id = ?
    ORDER BY ums.match_id DESC
    LIMIT 200
  `, userId);

  if (!rows?.length) return null;
  // берём моду
  const byRole = new Map<string, number>();
  for (const r of rows) {
    byRole.set(r.role, (byRole.get(r.role) ?? 0) + Number(r.cnt));
  }
  let best: string | null = null;
  let bestCnt = -1;
  for (const [k, v] of byRole.entries()) {
    if (v > bestCnt) { best = k; bestCnt = v; }
  }
  return best;
}

// Список официальных турниров игрока (название + матчи), фильтр >= seasonMin
async function getOfficialTournaments(prisma: PrismaClient, userId: number, seasonMin = 18) {
  const raw: { name: string; matches: bigint }[] = await prisma.$queryRawUnsafe(`
    SELECT t.name AS name, COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    WHERE ums.user_id = ?
    GROUP BY t.id, t.name
  `, userId);

  const detailed = raw.map(r => {
    const season = extractSeason(r.name);
    return { name: r.name, season, matches: Number(r.matches) };
  });

  const official = detailed.filter(d => d.season !== null && (d.season as number) >= seasonMin);
  return { official, all: detailed };
}

// Собираем список match_id игрока в официальных турнирах (для дальнейших фильтров)
async function getOfficialMatchIds(prisma: PrismaClient, userId: number, seasonMin = 18): Promise<number[]> {
  const rows: { id: number; tname: string }[] = await prisma.$queryRawUnsafe(`
    SELECT tm.id, t.name AS tname
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    WHERE ums.user_id = ?
  `, userId);

  const ids: number[] = [];
  for (const r of rows) {
    const s = extractSeason(r.tname);
    if (s !== null && s >= seasonMin) ids.push(r.id);
  }
  return ids;
}

// ---- метрики по кластерам ----
// Универсальные суммирования для полевых (FW/AM/FM/CM/CB)
// (все величины делятся на matches, кроме долей/процентов)
const FIELD_METRICS_SQL = `
  SUM(goals + assists)                               / NULLIF(COUNT(*),0)                                  AS goal_contrib,          -- Гол+пас/матч
  (SUM(goals) - SUM(goals_expected))                 / NULLIF(COUNT(*),0)                                  AS xg_delta,              -- Реализация xG/матч
  SUM(kickedin)                                     / NULLIF(SUM(kicked),0)                                AS shots_on_target_pct,   -- Удары в створ / все удары
  (SUM(pregoal_passes) + SUM(ipasses) + 2*SUM(passes)) / NULLIF(COUNT(*),0)                                AS creation,              -- Созидание/матч
  SUM(completedstockes)                             / NULLIF(SUM(allstockes),0)                            AS dribble_pct,           -- Дриблинг %
  (SUM(intercepts) + SUM(completedtackles))         / NULLIF(COUNT(*),0)                                   AS pressing,              -- Перехват+удачный отбор / матч
  (SUM(intercepts)+SUM(completedtackles)+SUM(completedtackles_slide)+SUM(blocks)) / NULLIF(COUNT(*),0)     AS def_actions,           -- Защитные действия/матч (для CM/CB/FM)
  SUM(completedpasses)                              / NULLIF(SUM(allpasses),0)                             AS pass_acc,              -- Точность паса %
  SUM(duels_air_win)                                / NULLIF(SUM(duels_air),0)                             AS air_win_pct,           -- Верховые %
  SUM(outplayed + penalised_fails)                  / NULLIF(SUM(intercepts)+SUM(completedtackles)+SUM(completedtackles_slide)+SUM(blocks),0) AS beaten_rate -- Beaten Rate
`;

// Метрики для GK
const GK_METRICS_SQL = `
  SUM(saved)                                         / NULLIF(SUM(saved)+SUM(scored),0)                    AS gk_save_pct,           -- % сейвов
  SUM(saved)                                         / NULLIF(COUNT(*),0)                                  AS gk_saves_per_match,    -- сейвы/матч
  SUM(intercepts)                                    / NULLIF(COUNT(*),0)                                  AS gk_intercepts,         -- перехваты/матч
  SUM(allpasses)                                     / NULLIF(COUNT(*),0)                                  AS gk_passes,             -- пасы/матч
  SUM(CASE WHEN dry=1 THEN 1 ELSE 0 END)             / NULLIF(COUNT(*),0)                                  AS gk_clean_pct,          -- % сухих
  SUM(scored)                                        / NULLIF(COUNT(*),0)                                  AS gk_conceded_per_match  -- пропущено/матч (для контекста и инверсии)
`;

// Считаем перцентиль игрока на фоне пула (Having 30+ матчей в кластере)
function percentileFromCohort(playerValue: number, cohortValues: number[], metricKey: string): number {
  const vals = cohortValues.filter(v => Number.isFinite(v));
  if (!vals.length || !Number.isFinite(playerValue)) return 0;
  vals.sort((a, b) => a - b);
  // позиция игрока в отсортированном массиве
  let rank = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] <= playerValue) rank = i + 1;
    else break;
  }
  let pct = Math.round((rank / vals.length) * 100);
  if (INVERTED_PCT.has(metricKey)) pct = 100 - pct;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

// ---- handler ----
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const userIdNum = Number(params.userId);
  if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
    return json({ ok: false, error: "Bad userId" }, 400);
  }

  const url = new URL(req.url);
  const roleFromClient = (url.searchParams.get("role") || "").trim() as RoleCode | "";

  // 1) «Актуальное амплуа»: если страница передала — используем; иначе авто-детект по последним матчам
  let currentRole: RoleCode | null = roleFromClient || null;
  if (!currentRole) currentRole = await autoDetectRole(prisma, userIdNum);
  const cluster: ClusterKey | null = currentRole ? resolveClusterByRole(currentRole) : null;

  if (!currentRole || !cluster) {
    return json({
      ok: true,
      ready: false,
      currentRole: currentRole ?? null,
      cluster: cluster ?? null,
      matchesCluster: 0,
      tournamentsUsed: [],
      reason: "Не удалось определить амплуа",
      debug: { seasonMin: 18, officialFilterApplied: false, tournaments: [] }
    });
  }

  // 2) Официальные турниры
  const { official, all } = await getOfficialTournaments(prisma, userIdNum, 18);
  if (!official.length) {
    return json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster: 0,
      tournamentsUsed: [],
      reason: "Нет официальных турниров (содержат «сезон» и номер ≥ 18)",
      debug: { seasonMin: 18, officialFilterApplied: false, tournaments: all }
    });
  }

  const officialMatchIds = await getOfficialMatchIds(prisma, userIdNum, 18);
  if (!officialMatchIds.length) {
    return json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster: 0,
      tournamentsUsed: official.map(t => t.name),
      reason: "Не нашли матчей игрока в официальных турнирах",
      debug: { seasonMin: 18, officialFilterApplied: true, tournaments: official }
    });
  }

  // 3) Матчи игрока в нужном кластере (официальные + роль ∈ кластер)
  const rolesList = CLUSTERS[cluster].map(r => `'${r}'`).join(",");
  const myRows: { matches: bigint }[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    JOIN skills_positions sp ON sp.id = ums.skill_id
    WHERE ums.user_id = ?
      AND ums.match_id IN (${officialMatchIds.join(",")})
      AND sp.short_name IN (${rolesList})
  `, userIdNum);

  const matchesCluster = myRows?.length ? Number(myRows[0].matches) : 0;
  if (matchesCluster < 30) {
    return json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: official.map(t => t.name),
      reason: "Недостаточно матчей в кластере (< 30), радар недоступен.",
      debug: { seasonMin: 18, officialFilterApplied: true, tournaments: official }
    });
  }

  // 4) Метрики игрока (по кластеру) и пул для перцентилей (users с >=30 в этом кластере)
  // --- индивидуальные метрики игрока ---
  const fieldSql = cluster === "GK" ? GK_METRICS_SQL : FIELD_METRICS_SQL;

  const meAgg: any[] = await prisma.$queryRawUnsafe(`
    SELECT ${fieldSql}
    FROM tbl_users_match_stats ums
    JOIN skills_positions sp ON sp.id = ums.skill_id
    WHERE ums.user_id = ?
      AND ums.match_id IN (${officialMatchIds.join(",")})
      AND sp.short_name IN (${rolesList})
  `, userIdNum);

  const me = meAgg?.[0] ?? {};

  // --- пул (все игроки с 30+ матчами в этом кластере) ---
  // Сначала собираем user_id с количеством матчей в этом же кластере
  const cohortUsers: { user_id: number }[] = await prisma.$queryRawUnsafe(`
    SELECT ums.user_id
    FROM tbl_users_match_stats ums
    JOIN skills_positions sp ON sp.id = ums.skill_id
    WHERE ums.match_id IN (${officialMatchIds.join(",")})
      AND sp.short_name IN (${rolesList})
    GROUP BY ums.user_id
    HAVING COUNT(*) >= 30
  `);

  const cohortIds = cohortUsers.map((u) => u.user_id).filter((id) => id !== userIdNum);
  let cohort: any[] = [];
  if (cohortIds.length) {
    cohort = await prisma.$queryRawUnsafe(`
      SELECT ums.user_id,
             ${fieldSql}
      FROM tbl_users_match_stats ums
      JOIN skills_positions sp ON sp.id = ums.skill_id
      WHERE ums.match_id IN (${officialMatchIds.join(",")})
        AND sp.short_name IN (${rolesList})
        AND ums.user_id IN (${cohortIds.join(",")})
      GROUP BY ums.user_id
    `);
  }

  // 5) Сбор радара: названия и ключи зависят от кластера
  type RadarPoint = { key: string; label: string; raw: number; pct: number };
  let radar: RadarPoint[] = [];

  if (cluster === "GK") {
    const keys: { key: string; label: string; col: string }[] = [
      { key: "gk_save_pct",         label: "% сейвов",             col: "gk_save_pct" },
      { key: "gk_saves_per_match",  label: "Сейвы/матч",            col: "gk_saves_per_match" },
      { key: "gk_intercepts",       label: "Перехваты/матч",        col: "gk_intercepts" },
      { key: "gk_passes",           label: "Пасы/матч",             col: "gk_passes" },
      { key: "gk_clean_pct",        label: "% сухих",               col: "gk_clean_pct" },
      { key: "gk_conceded_per_match", label: "Пропущено/матч",     col: "gk_conceded_per_match" }, // инвертируем
    ];

    radar = keys.map(({ key, label, col }) => {
      const raw = safeNum(me[col], 0);
      const cohortVals = cohort.map((c) => safeNum(c[col], 0));
      const pct = percentileFromCohort(raw, cohortVals, key);
      return { key, label, raw, pct };
    });

  } else {
    // полевые (FW/AM/FM/CM/CB)
    // общий набор, а в зависимости от кластера будем показывать нужные подписи
    const BASE = {
      goal_contrib: { label: "Гол+пас", col: "goal_contrib" },
      xg_delta:     { label: "Реализация xG", col: "xg_delta" },
      shots_on_target_pct: { label: "Удары в створ %", col: "shots_on_target_pct" },
      creation:     { label: "Созидание", col: "creation" },
      dribble_pct:  { label: "Дриблинг %", col: "dribble_pct" },
      pressing:     { label: "Прессинг", col: "pressing" },
      def_actions:  { label: "Защитные действия", col: "def_actions" },
      pass_acc:     { label: "Точность паса %", col: "pass_acc" },
      air_win_pct:  { label: "Верховые %", col: "air_win_pct" },
      beaten_rate:  { label: "Beaten Rate ↓", col: "beaten_rate" },
    };

    // какие метрики показываем на радаре для каждого кластера
    const LAYOUT: Record<ClusterKey, (keyof typeof BASE)[]> = {
      FW: ["goal_contrib","xg_delta","shots_on_target_pct","creation","dribble_pct","pressing"],
      AM: ["xg_delta","goal_contrib","pass_acc","dribble_pct","pressing","creation"], // для ЦАП — как согласовали
      FM: ["creation","pass_acc","def_actions","beaten_rate","air_win_pct","goal_contrib"],
      CM: ["creation","pass_acc","def_actions","beaten_rate","air_win_pct","pressing"],
      CB: ["def_actions","pass_acc","air_win_pct","beaten_rate","creation","pressing"], // CB — твой зафиксированный набор
      GK: [] // не используется
    };

    const keys = LAYOUT[cluster];
    radar = keys.map((k) => {
      const col = BASE[k].col;
      const raw = safeNum(me[col], 0);
      const cohortVals = cohort.map((c) => safeNum(c[col], 0));
      const pct = percentileFromCohort(raw, cohortVals, k);
      return { key: k, label: BASE[k].label, raw, pct };
    });
  }

  return json({
    ok: true,
    ready: true,
    currentRole,
    cluster,
    matchesCluster,
    tournamentsUsed: official.map(t => t.name),
    radar,
    debug: {
      seasonMin: 18,
      officialFilterApplied: true,
      tournaments: official
    }
  });
}
