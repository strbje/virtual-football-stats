// app/page.tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// официальный сезон — номер из названия турнира, берём ≥ 18
const SEASON_MIN = 18;

// безопасное число
function num(x: any, d = 0): number {
  if (x === null || x === undefined) return d;
  if (typeof x === "bigint") return Number(x);
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

// парсим номер сезона из имени турнира: "... (18 сезон)"
function extractSeason(name: any): number | null {
  const s = String(name ?? "");
  const m = s.match(/(?:^|\s)\(?(\d+)\s*сезон\)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// общий хелпер: превращаем сырые строки из $queryRawUnsafe в обычные объекты и map’им BigInt
function rows<T = any>(x: unknown): T[] {
  const a = Array.isArray(x) ? x : [];
  return a.map((r: any) => {
    const o: any = {};
    for (const k of Object.keys(r)) o[k] = num(r[k], r[k]);
    return o;
  });
}

type TopRow = { user_id: number; gamertag: string; val: number };
type BreakdownRow = { user_id: number; season: number; val: number; matches?: number; saved?: number; conceded?: number };

// ----------- КОНКРЕТНЫЕ ЗАПРОСЫ -----------

// 1) Топ по матчам
async function topMatches() {
  const perUser = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag,
           COUNT(*) AS val
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    WHERE 1
    GROUP BY u.id, u.gamertag
    ORDER BY val DESC
    LIMIT 12
  `)) as TopRow[];

  // разбивка по сезонам
  const perSeason = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag, t.name AS tournament_name,
           COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag, t.name
  `)) as any[];

  const breakdown: BreakdownRow[] = perSeason
    .map(r => {
      const season = extractSeason(r.tournament_name);
      return season !== null ? { user_id: r.user_id, season, val: num(r.matches), matches: num(r.matches) } : null;
    })
    .filter(Boolean) as BreakdownRow[];

  return { top: perUser, debug: breakdown };
}

// 2) Топ по голам
async function topGoals() {
  const perUser = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag,
           SUM(ums.goals) AS val
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag
    ORDER BY val DESC
    LIMIT 12
  `)) as TopRow[];

  const perSeason = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag, t.name AS tournament_name,
           SUM(ums.goals) AS goals
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag, t.name
  `)) as any[];

  const breakdown: BreakdownRow[] = perSeason
    .map(r => {
      const season = extractSeason(r.tournament_name);
      return season !== null ? { user_id: r.user_id, season, val: num(r.goals) } : null;
    })
    .filter(Boolean) as BreakdownRow[];

  return { top: perUser, debug: breakdown };
}

// 3) Топ по голевым
async function topAssists() {
  const perUser = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag,
           SUM(ums.assists) AS val
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag
    ORDER BY val DESC
    LIMIT 12
  `)) as TopRow[];

  const perSeason = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag, t.name AS tournament_name,
           SUM(ums.assists) AS assists
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag, t.name
  `)) as any[];

  const breakdown: BreakdownRow[] = perSeason
    .map(r => {
      const season = extractSeason(r.tournament_name);
      return season !== null ? { user_id: r.user_id, season, val: num(r.assists) } : null;
    })
    .filter(Boolean) as BreakdownRow[];

  return { top: perUser, debug: breakdown };
}

// 4) Топ по защитным действиям (перехват + отбор + блок + удачный подкат)
// используем тот же состав, что и в твоём AGG_SQL: intercepts + selection + completedtackles + blocks
async function topDefActions() {
  const perUser = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag,
           SUM(ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS val
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag
    ORDER BY val DESC
    LIMIT 12
  `)) as TopRow[];

  const perSeason = rows(await prisma.$queryRawUnsafe(`
    SELECT u.id AS user_id, u.gamertag, t.name AS tournament_name,
           SUM(ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS def_actions
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN tbl_users u ON u.id = ums.user_id
    GROUP BY u.id, u.gamertag, t.name
  `)) as any[];

  const breakdown: BreakdownRow[] = perSeason
    .map(r => {
      const season = extractSeason(r.tournament_name);
      return season !== null ? { user_id: r.user_id, season, val: num(r.def_actions) } : null;
    })
    .filter(Boolean) as BreakdownRow[];

  return { top: perUser, debug: breakdown };
}

// 5) Топ вратарей по % сейвов (≥100 матчей).
// короткий код роли в БД — 'ВР'. Матчи — просто количество записей в ums, отфильтрованных по skills_positions.
async function topGkSavePct() {
  const perUser = rows(await prisma.$queryRawUnsafe(`
    SELECT
      u.id AS user_id,
      u.gamertag,
      SUM(ums.saved) AS saved,
      SUM(ums.scored) AS conceded,
      COUNT(*) AS matches,
      (SUM(ums.saved) / NULLIF(SUM(ums.saved) + SUM(ums.scored), 0)) AS val
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN skills_positions sp ON sp.id = ums.skill_id
    JOIN tbl_users u ON u.id = ums.user_id
    WHERE sp.short_name = 'ВР'
    GROUP BY u.id, u.gamertag
    HAVING matches >= 100
    ORDER BY val DESC
    LIMIT 12
  `)) as (TopRow & { saved: number; conceded: number; matches: number })[];

  const perSeason = rows(await prisma.$queryRawUnsafe(`
    SELECT
      u.id AS user_id,
      u.gamertag,
      t.name AS tournament_name,
      SUM(ums.saved) AS saved,
      SUM(ums.scored) AS conceded,
      COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t ON t.id = tm.tournament_id
    JOIN skills_positions sp ON sp.id = ums.skill_id
    JOIN tbl_users u ON u.id = ums.user_id
    WHERE sp.short_name = 'ВР'
    GROUP BY u.id, u.gamertag, t.name
  `)) as any[];

  const breakdown: BreakdownRow[] = perSeason
    .map(r => {
      const season = extractSeason(r.tournament_name);
      if (season === null) return null;
      const saved = num(r.saved);
      const conceded = num(r.conceded);
      const matches = num(r.matches);
      const val = (saved + conceded) > 0 ? saved / (saved + conceded) : 0;
      return { user_id: r.user_id, season, val, saved, conceded, matches };
    })
    .filter(Boolean) as BreakdownRow[];

  return { top: perUser, debug: breakdown };
}

// ---------------- PAGE ----------------
export default async function Home({ searchParams }: { searchParams?: Record<string, string> }) {
  // собираем данные параллельно
  const [m, g, a, d, gk] = await Promise.all([
    topMatches(),
    topGoals(),
    topAssists(),
    topDefActions(),
    topGkSavePct(),
  ]);

  // если ?debug=1 — выводим JSON с разбивкой
  if (searchParams?.debug === "1") {
    const payload = {
      season_min: SEASON_MIN,
      // Важно: оставляем и список «топов» и полную разбивку
      matches: { top: m.top, breakdown: m.debug.filter(x => x.season >= SEASON_MIN) },
      goals:   { top: g.top, breakdown: g.debug.filter(x => x.season >= SEASON_MIN) },
      assists: { top: a.top, breakdown: a.debug.filter(x => x.season >= SEASON_MIN) },
      def:     { top: d.top, breakdown: d.debug.filter(x => x.season >= SEASON_MIN) },
      gk_save: { top: gk.top, breakdown: gk.debug.filter(x => x.season >= SEASON_MIN) },
    };
    // простая разметка — без JSON.stringify BigInt проблем (мы превратили всё в number)
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-4">DEBUG / Главная</h1>
        <pre className="text-xs bg-gray-50 p-4 rounded border overflow-auto">
{JSON.stringify(payload, null, 2)}
        </pre>
      </main>
    );
  }

  // обычный UI — используй твои карточки; ниже каркас (показываем только ники и значения)
  const Section = ({ title, items }: { title: string; items: TopRow[] }) => (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="grid md:grid-cols-3 gap-3">
        {items.slice(0, 12).map((r) => (
          <div key={`${title}-${r.user_id}`} className="rounded-xl border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold">
                {String(r.gamertag ?? "?").slice(0,1).toUpperCase()}
              </div>
              <div className="font-medium">{r.gamertag ?? `ID ${r.user_id}`}</div>
            </div>
            <div className="text-blue-600 font-semibold">
              {title.includes("сейвов") ? `${(num((r as any).val) * 100).toFixed(1)}%` : num(r.val)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <main className="max-w-6xl mx-auto p-6">
      <Section title="Топ по матчам" items={m.top} />
      <Section title="Топ по голам" items={g.top} />
      <Section title="Топ по голевым" items={a.top} />
      <Section title="Топ по защитным действиям" items={d.top} />
      <Section title="Топ вратарей по % сейвов (≥100 матчей)" items={gk.top} />
    </main>
  );
}
