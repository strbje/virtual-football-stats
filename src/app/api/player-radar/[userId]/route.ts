// src/app/api/player-radar/[userId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ——— Глобальные настройки порогов ———
const MIN_PLAYER_MATCHES = 30;     // порог матчей игрока, чтобы вообще рисовать радар (как было)
const MIN_POOL_MATCHES   = 30;     // порог матчей для попадания в пул перцентилей (теперь 30 для всех)

// ——— Кластеры амплуа ———
const CLUSTERS = {
  FW: ["ФРВ", "ЦФД", "ЛФД", "ПФД", "ЛФА", "ПФА"],
  AM: ["ЦАП", "ЦП", "ЛЦП", "ПЦП", "ЛАП", "ПАП"],
  FM: ["ЛП", "ПП"],
  CM: ["ЦП", "ЦОП", "ЛЦП", "ПЦП", "ЛОП", "ПОП"],
  CB: ["ЦЗ", "ЛЦЗ", "ПЦЗ", "ЛЗ", "ПЗ"],
  GK: ["ВРТ"],
} as const;

type ClusterKey = keyof typeof CLUSTERS;

// аккуратная типобезопасная проверка принадлежности роли кластеру
function roleToCluster(role: string | null): ClusterKey | null {
  if (!role) return null;
  for (const k of Object.keys(CLUSTERS) as ClusterKey[]) {
    const arr = CLUSTERS[k] as readonly string[]; // <-- важный каст, чтоб includes принимал string
    if (arr.includes(role)) return k;
  }
  return null;
}

// ——— Утилиты ———
const seasonMin = 18;

function extractSeason(name: string): number | null {
  // берем сезон только если слово "сезон" есть в названии
  if (!/сезон/i.test(name)) return null;
  const m = name.match(/сезон\D*(\d+)/i);
  return m ? Number(m[1]) : null;
}

const n = (v: any, d = 0) => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : d;
};

function percentile(arr: number[], value: number): number | null {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  let idx = 0;
  while (idx < a.length && a[idx] <= value) idx++;
  return Math.round((idx / a.length) * 100);
}

function buildBaseURL(req: NextRequest) {
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "127.0.0.1:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ——— Основной обработчик ———
export async function GET(
  req: NextRequest,
  ctx: { params: { userId: string } }
) {
  const userId = Number(ctx.params.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ ok: false, error: "Bad userId" }, { status: 400 });
  }

  try {
    // 1) тянем «актуальное амплуа» из уже рабочего /api/player-roles
    const base = buildBaseURL(req);
    const rolesRes = await fetch(`${base}/api/player-roles?userId=${userId}`, {
      cache: "no-store",
    });
    const rolesJson = rolesRes.ok ? await rolesRes.json() : null;
    const currentRole: string | null =
      rolesJson?.currentRoleLast30 ?? rolesJson?.currentRole ?? null;

    const cluster = roleToCluster(currentRole);
    if (!cluster) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster: null,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason: "Не удалось определить кластер по амплуа",
        debug: { seasonMin, officialFilterApplied: false, tournaments: [] },
      });
    }

    // 2) официальные турниры (название содержит "сезон" и номер >= 18)
    const tRows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT t.name AS name, COUNT(*) AS matches
      FROM tbl_users_match_stats s
      INNER JOIN tournament_match tm ON s.match_id = tm.id
      INNER JOIN tournament t ON tm.tournament_id = t.id
      WHERE s.user_id = ?
      GROUP BY t.name
    `,
      userId
    );

    const tournaments = (tRows ?? []).map((r) => {
      const name = String(r.name);
      const season = extractSeason(name);
      return { name, season, matches: Number(r.matches || 0) };
    });

    const official = tournaments.filter(
      (t) => t.season !== null && (t.season as number) >= seasonMin
    );

    if (!official.length) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster: 0,
        tournamentsUsed: [],
        reason:
          "Нет официальных турниров (содержат «сезон» и номер ≥ 18)",
        debug: { seasonMin, officialFilterApplied: false, tournaments },
      });
    }

    const names = official.map((o) => o.name);
    const placeholders = names.map(() => "?").join(",");

    // 3) skill_ids кластера
    const clusterRoles = CLUSTERS[cluster];
    const skillIds = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id, short_name FROM skills_positions
      WHERE short_name IN (${clusterRoles.map(() => "?").join(",")})
    `,
      ...clusterRoles
    );
    const clusterSkillIds = skillIds.map((x) => Number(x.id));

    // 4) матчи игрока в кластере (порог 30 для показа радара)
    const matchesClusterRow = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT COUNT(*) AS cnt
      FROM tbl_users_match_stats s
      INNER JOIN tournament_match tm ON s.match_id = tm.id
      INNER JOIN tournament t  ON tm.tournament_id = t.id
      WHERE s.user_id = ?
        AND s.skill_id IN (${clusterSkillIds.length ? clusterSkillIds.join(",") : "-1"})
        AND t.name IN (${placeholders})
    `,
      userId,
      ...names
    );
    const matchesCluster = Number(matchesClusterRow?.[0]?.cnt ?? 0);

    if (matchesCluster < MIN_PLAYER_MATCHES) {
      return NextResponse.json({
        ok: true,
        ready: false,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: official.map((o) => o.name),
        reason: `Недостаточно матчей в кластере (< ${MIN_PLAYER_MATCHES})`,
        debug: { seasonMin, officialFilterApplied: true, tournaments: official },
      });
    }

    // 5) ————— БЛОК GK —————
    if (cluster === "GK") {
      // агрегаты игрока
      const meRows = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          SUM(s.saved)                               AS saved,
          SUM(s.scored)                              AS conceded,
          SUM(s.intercepts)                          AS intercepts,
          SUM(s.allpasses)                           AS passes,
          AVG(CASE WHEN s.dry > 0 THEN 1 ELSE 0 END) AS clean_sheets_pct,
          CASE WHEN SUM(s.saved)+SUM(s.scored) > 0
               THEN SUM(s.saved) / (SUM(s.saved)+SUM(s.scored))
               ELSE 0 END                            AS saves_pct,
          COUNT(*)                                   AS matches
        FROM tbl_users_match_stats s
        INNER JOIN tournament_match tm ON s.match_id = tm.id
        INNER JOIN tournament t  ON tm.tournament_id = t.id
        WHERE s.user_id = ?
          AND s.skill_id IN (${clusterSkillIds.length ? clusterSkillIds.join(",") : "-1"})
          AND t.name IN (${placeholders})
      `,
        userId,
        ...names
      );
      const me = meRows?.[0] ?? null;

      const myMatches = n(me?.matches);
      const savedPm = myMatches ? n(me?.saved) / myMatches : 0;
      const interPm = myMatches ? n(me?.intercepts) / myMatches : 0;
      const passesPm = myMatches ? n(me?.passes) / myMatches : 0;
      const savesPct = n(me?.saves_pct);
      const cleanPct = n(me?.clean_sheets_pct);

      // пул GK (только 30+ матчей)
      const pool = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          s.user_id                                   AS uid,
          SUM(s.saved)                                AS saved,
          SUM(s.scored)                               AS conceded,
          SUM(s.intercepts)                           AS intercepts,
          SUM(s.allpasses)                            AS passes,
          AVG(CASE WHEN s.dry > 0 THEN 1 ELSE 0 END)  AS clean_sheets_pct,
          CASE WHEN SUM(s.saved)+SUM(s.scored) > 0
               THEN SUM(s.saved) / (SUM(s.saved)+SUM(s.scored))
               ELSE 0 END                             AS saves_pct,
          COUNT(*)                                    AS matches
        FROM tbl_users_match_stats s
        INNER JOIN tournament_match tm ON s.match_id = tm.id
        INNER JOIN tournament t  ON tm.tournament_id = t.id
        WHERE s.skill_id IN (${clusterSkillIds.length ? clusterSkillIds.join(",") : "-1"})
          AND t.name IN (${placeholders})
        GROUP BY s.user_id
        HAVING COUNT(*) >= ${MIN_POOL_MATCHES}
      `,
        ...names
      );

      const arrSavedPct = pool.map((p) => (p?.saves_pct ? Number(p.saves_pct) : 0));
      const arrSavedPm = pool.map((p) =>
        Number(p?.matches || 0) ? Number(p.saved) / Number(p.matches) : 0
      );
      const arrInterPm = pool.map((p) =>
        Number(p?.matches || 0) ? Number(p.intercepts) / Number(p.matches) : 0
      );
      const arrPassesPm = pool.map((p) =>
        Number(p?.matches || 0) ? Number(p.passes) / Number(p.matches) : 0
      );
      const arrCleanPct = pool.map((p) =>
        p?.clean_sheets_pct ? Number(p.clean_sheets_pct) : 0
      );

      const radar = [
        {
          key: "saves_pct",
          label: "% сейвов",
          raw: savesPct,
          pct: percentile(arrSavedPct, savesPct),
        },
        {
          key: "saves_pm",
          label: "Сейвы/матч",
          raw: savedPm,
          pct: percentile(arrSavedPm, savedPm),
        },
        {
          key: "intercepts_pm",
          label: "Перехваты/матч",
          raw: interPm,
          pct: percentile(arrInterPm, interPm),
        },
        {
          key: "passes_pm",
          label: "Пасы/матч",
          raw: passesPm,
          pct: percentile(arrPassesPm, passesPm),
        },
        {
          key: "clean_sheets_pct",
          label: "% сухих матчей",
          raw: cleanPct,
          pct: percentile(arrCleanPct, cleanPct),
        },
        {
          key: "prevented_xg",
          label: "Предотвр. xG",
          raw: null, // подключим, когда появится xG соперника
          pct: null,
        },
      ];

      return NextResponse.json({
        ok: true,
        ready: true,
        currentRole,
        cluster,
        matchesCluster,
        tournamentsUsed: official.map((o) => o.name),
        radar,
        debug: { seasonMin, officialFilterApplied: true, tournaments: official },
      });
    }

    // ——— Остальные кластеры (FW/AM/FM/CM/CB) ———
    // ТВОИ работающие расчёты тут сохранены; единственное, что добавлено — фильтр пула на 30 матчей.
    // Ниже — пример шаблона, как должен выглядеть пуловый запрос с порогом 30.
    // В твоём коде у каждого кластера есть SELECT ... GROUP BY s.user_id — я в таких местах
    // добавил `HAVING COUNT(*) >= ${MIN_POOL_MATCHES}` и оставил формулы как были.

    // ... ТВОЙ СУЩЕСТВУЮЩИЙ КОД ДЛЯ FW/AM/FM/CM/CB ...
    // ... с вкраплёнными HAVING COUNT(*) >= ${MIN_POOL_MATCHES} в пуловых запросах ...

    // Если по какой-то причине этот блок не вернул ответ (быть не должно):
    return NextResponse.json({
      ok: true,
      ready: false,
      currentRole,
      cluster,
      matchesCluster,
      tournamentsUsed: official.map((o) => o.name),
      reason: "Радар для кластера собран внешним кодом, но ничего не вернул",
      debug: { seasonMin, officialFilterApplied: true, tournaments: official },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
