// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { teamId: string };

// --- хелпер для приведения bigint -> number ---
function toJSON<T = any>(x: unknown): T {
  return JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}

// --- маппинг названия турнира в «лигу» ---
function leagueFromTournamentName(name: string | null): string {
  if (!name) return "Прочие";
  const n = name.toLowerCase();

  if (n.startsWith("премьер лига") || n.startsWith("премьер-лига")) return "ПЛ";
  if (n.startsWith("фнл")) return "ФНЛ";
  if (n.startsWith("пфл")) return "ПФЛ";
  if (n.startsWith("лфл")) return "ЛФЛ";
  return "Прочие";
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const teamId = Number(params.teamId) || 0;
  let title = "Команда — Virtual Football Stats";

  if (teamId > 0) {
    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { team_name: true },
      });
      if (team?.team_name) {
        title = `${team.team_name} — Virtual Football Stats`;
      }
    } catch {
      // ignore
    }
  }

  return { title };
}

export default async function TeamPage({ params }: { params: Params }) {
  const teamId = Number(params.teamId);
  if (!teamId || Number.isNaN(teamId)) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold">Команда</h1>
        <p className="mt-4 text-red-600">Некорректный идентификатор команды.</p>
        <Link href="/teams" className="mt-3 inline-block text-blue-600">
          ← Ко всем командам
        </Link>
      </div>
    );
  }

  // 1) базовая информация о команде
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { team_name: true },
  });

  const teamName = team?.team_name ?? `Team #${teamId}`;

  // 2) общие матчи + распределение по лигам + турниры + актуальная лига
  const [totalsRaw, leaguesRaw, tournamentsRaw, lastLeagueRaw] =
    await Promise.all([
      // всего матчей (все официальные сезоны: есть "(N сезон)" в названии турнира)
      prisma.$queryRawUnsafe<
        { matches: number }[]
      >(
        `
        SELECT COUNT(DISTINCT ums.match_id) AS matches
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON tm.id = ums.match_id
        JOIN tournament t        ON t.id  = tm.tournament_id
        WHERE ums.team_id = ?
          AND t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
      `,
        teamId,
      ),

      // матчи по лигам
      prisma.$queryRawUnsafe<
        { league: string; matches: number }[]
      >(
        `
        SELECT
          CASE
            WHEN LOWER(t.name) LIKE 'премьер лига%' OR LOWER(t.name) LIKE 'премьер-лига%' THEN 'ПЛ'
            WHEN LOWER(t.name) LIKE 'фнл%'  THEN 'ФНЛ'
            WHEN LOWER(t.name) LIKE 'пфл%'  THEN 'ПФЛ'
            WHEN LOWER(t.name) LIKE 'лфл%'  THEN 'ЛФЛ'
            ELSE 'Прочие'
          END AS league,
          COUNT(DISTINCT ums.match_id) AS matches
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON tm.id = ums.match_id
        JOIN tournament t        ON t.id  = tm.tournament_id
        WHERE ums.team_id = ?
          AND t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
        GROUP BY league
      `,
        teamId,
      ),

      // матчи по турнирам (как у тебя на скрине)
      prisma.$queryRawUnsafe<
        { tournament: string; matches: number }[]
      >(
        `
        SELECT
          t.name AS tournament,
          COUNT(DISTINCT ums.match_id) AS matches
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON tm.id = ums.match_id
        JOIN tournament t        ON t.id  = tm.tournament_id
        WHERE ums.team_id = ?
          AND t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
        GROUP BY t.id, t.name
        ORDER BY MIN(tm.timestamp) DESC
      `,
        teamId,
      ),

      // актуальная лига — по последнему матчу
      prisma.$queryRawUnsafe<
        { tournament_name: string | null }[]
      >(
        `
        SELECT t.name AS tournament_name
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON tm.id = ums.match_id
        JOIN tournament t        ON t.id  = tm.tournament_id
        WHERE ums.team_id = ?
          AND t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
        ORDER BY tm.timestamp DESC
        LIMIT 1
      `,
        teamId,
      ),
    ]);

  const totals = toJSON<{ matches: number }[]>(totalsRaw)[0] ?? { matches: 0 };
  const leaguesArr = toJSON<{ league: string; matches: number }[]>(leaguesRaw);
  const tournaments = toJSON<{ tournament: string; matches: number }[]>(
    tournamentsRaw,
  );
  const lastLeagueRow = toJSON<{ tournament_name: string | null }[]>(
    lastLeagueRaw,
  )[0];

  const totalMatches = totals.matches ?? 0;

  // актуальная лига
  const currentLeague = lastLeagueRow
    ? leagueFromTournamentName(lastLeagueRow.tournament_name)
    : "—";

  // подготовка данных по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ/Прочие) + проценты
  const baseLeagues = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие"] as const;
  const leaguesMap = new Map<string, number>();
  for (const row of leaguesArr) {
    leaguesMap.set(row.league, row.matches ?? 0);
  }

  const leagues = baseLeagues.map(label => {
    const m = leaguesMap.get(label) ?? 0;
    const pct =
      totalMatches > 0 ? Math.round((m * 1000) / totalMatches) / 10 : 0; // один знак после запятой
    return { label, matches: m, pct };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{teamName}</h1>
        <div className="mt-1 text-sm text-zinc-500">
          Матчи: {totalMatches.toLocaleString("ru-RU")} (все доступные)
        </div>
        <Link href="/teams" className="mt-3 inline-block text-blue-600">
          ← Ко всем командам
        </Link>
      </div>

      {/* Верхние плитки, как у игроков */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-h-[80px] flex-col justify-center rounded-xl border border-zinc-200 p-3">
          <div className="mb-1 text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold">
            {totalMatches.toLocaleString("ru-RU")}
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">
            *без учета товарищеских (если такие есть в БД)
          </div>
        </div>

        <div className="flex min-h-[80px] flex-col justify-center rounded-xl border border-zinc-200 p-3">
          <div className="mb-1 text-sm text-zinc-500">Актуальная лига</div>
          <div className="text-2xl font-semibold">{currentLeague}</div>
          <div className="mt-2 text-[11px] text-zinc-400">
            по последнему официальному матчу
          </div>
        </div>
      </div>

      {/* Распределение по лигам (барчарт в стиле страницы игрока) */}
      <section className="rounded-xl border border-zinc-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800">
          Распределение по лигам
        </h3>
        <div className="space-y-2 text-sm">
          {leagues.map(l => (
            <div key={l.label} className="flex items-center gap-3">
              <div className="w-20 text-zinc-600">{l.label}</div>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-zinc-200">
                  <div
                    className="h-1.5 rounded-full bg-blue-600"
                    style={{ width: `${Math.min(l.pct, 100)}%` }}
                  />
                </div>
              </div>
              <div className="w-24 text-right text-xs text-zinc-500">
                {l.matches} матчей
                {totalMatches > 0 ? ` (${l.pct.toFixed(1)}%)` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Таблица турниров, как была раньше */}
      <section className="rounded-xl border border-zinc-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800">Турниры</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left">Турнир</th>
                <th className="py-2 pr-4 text-right">Матчи</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t, i) => (
                <tr
                  key={`${t.tournament}-${i}`}
                  className="border-b last:border-b-0"
                >
                  <td className="py-2 pr-4">{t.tournament}</td>
                  <td className="py-2 pr-4 text-right">{t.matches}</td>
                </tr>
              ))}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-3 text-sm text-zinc-500">
                    Официальные турниры для этой команды не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
