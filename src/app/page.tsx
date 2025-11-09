// app/page.tsx  (или твой файл главной страницы)
// Server Component: без "use client"

import Link from "next/link";
import { Search, Users, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";

// ---------- утилиты ----------
function toJSON<T = any>(rows: unknown): T {
  return JSON.parse(
    JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}
const SEASON_MIN = 18;

// ---------- SQL-запросы ----------
const WHERE_OFFICIAL = `t.season IS NOT NULL AND t.season >= ${SEASON_MIN}`;

const SQL_TOP_MATCHES = `
  SELECT ums.user_id, COUNT(DISTINCT ums.match_id) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id
  ORDER BY val DESC
  LIMIT 10
`;

const SQL_TOP_GOALS = `
  SELECT ums.user_id, SUM(ums.goals) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id
  ORDER BY val DESC
  LIMIT 10
`;

const SQL_TOP_ASSISTS = `
  SELECT ums.user_id, SUM(ums.assists) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id
  ORDER BY val DESC
  LIMIT 10
`;

const SQL_TOP_DEFENSE = `
  SELECT
    ums.user_id,
    SUM(ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id
  ORDER BY val DESC
  LIMIT 10
`;

// GK: позиция «ВР», ≥100 матчей; сортировка по save%
const SQL_TOP_GK_SAVEPCT = `
  SELECT
    ums.user_id,
    COUNT(DISTINCT ums.match_id) AS matches,
    SUM(ums.saved)   AS saved,
    SUM(ums.scored)  AS conceded
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  LEFT JOIN tbl_field_positions fp ON fp.id = ums.position_id
  WHERE ${WHERE_OFFICIAL}
    AND (fp.code = 'ВР')
  GROUP BY ums.user_id
  HAVING matches >= 100 AND (saved + conceded) > 0
  ORDER BY (saved / (saved + conceded)) DESC
  LIMIT 10
`;

// Небольшая карточка игрока
function PlayerCard({
  userId,
  value,
  suffix,
}: {
  userId: number;
  value: number;
  suffix?: string;
}) {
  // Имя игрока сейчас не тяну: схема таблицы пользователей у тебя в разных местах отличается.
  // Сразу ведём на страницу игрока.
  return (
    <Link href={`/players/${userId}`}>
      <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-600 font-semibold">{userId}</span>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-800">ID: {userId}</h4>
            <p className="text-sm text-gray-600">перейти в профиль</p>
          </div>
          <div className="text-lg font-bold text-blue-600">
            {suffix ? `${value}${suffix}` : value}
          </div>
        </div>
      </div>
    </Link>
  );
}

async function fetchTop() {
  // все пять запросов параллельно
  const [m1, m2, m3, m4, gk] = await Promise.all([
    prisma.$queryRawUnsafe(SQL_TOP_MATCHES),
    prisma.$queryRawUnsafe(SQL_TOP_GOALS),
    prisma.$queryRawUnsafe(SQL_TOP_ASSISTS),
    prisma.$queryRawUnsafe(SQL_TOP_DEFENSE),
    prisma.$queryRawUnsafe(SQL_TOP_GK_SAVEPCT),
  ]);

  const topMatches = toJSON<{ user_id: number; val: number }[]>(m1);
  const topGoals = toJSON<{ user_id: number; val: number }[]>(m2);
  const topAssists = toJSON<{ user_id: number; val: number }[]>(m3);
  const topDefense = toJSON<{ user_id: number; val: number }[]>(m4);

  const topGk = toJSON<
    { user_id: number; matches: number; saved: number; conceded: number }[]
  >(gk).map((r) => ({
    user_id: r.user_id,
    val: r.saved / (r.saved + r.conceded),
  }));

  return { topMatches, topGoals, topAssists, topDefense, topGk };
}

export default async function HomePage() {
  const { topMatches, topGoals, topAssists, topDefense, topGk } =
    await fetchTop();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Поиск */}
        <div className="max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
            Поиск игроков и команд
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Введите имя игрока или команды..."
              className="w-full pl-10 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Быстрые ссылки */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Link
            href="/players"
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  Профили игроков
                </h3>
                <p className="text-gray-600">Детальная статистика и рейтинги</p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Просмотрите статистику игроков, их рейтинги, сильные и слабые
              стороны
            </div>
          </Link>

          <Link
            href="/teams"
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-green-100 p-3 rounded-full">
                <Trophy className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  Профили команд
                </h3>
                <p className="text-gray-600">Составы и информация о командах</p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Изучите составы команд, основную информацию и статистику
            </div>
          </Link>
        </div>

        {/* Топы */}
        <div className="mt-12 space-y-10 max-w-6xl mx-auto">
          <Section title="Топ по матчам">
            {topMatches.map((r) => (
              <PlayerCard key={r.user_id} userId={r.user_id} value={r.val} />
            ))}
          </Section>

          <Section title="Топ по голам">
            {topGoals.map((r) => (
              <PlayerCard key={r.user_id} userId={r.user_id} value={r.val} />
            ))}
          </Section>

          <Section title="Топ по голевым">
            {topAssists.map((r) => (
              <PlayerCard key={r.user_id} userId={r.user_id} value={r.val} />
            ))}
          </Section>

          <Section title="Топ по защитным действиям (П+О+Б+УП)">
            {topDefense.map((r) => (
              <PlayerCard key={r.user_id} userId={r.user_id} value={r.val} />
            ))}
          </Section>

          <Section title="Топ вратарей по % сейвов (≥100 матчей)">
            {topGk.map((r) => (
              <PlayerCard
                key={r.user_id}
                userId={r.user_id}
                value={Math.round(r.val * 1000) / 10}
                suffix="%"
              />
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

// Вспомогательный компонент секции
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-2xl font-bold text-gray-800 mb-4">{title}</h3>
      <div className="grid md:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}
