// app/page.tsx
import Link from "next/link";
import { Users, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";

// --- utils ---
function toJSON<T = any>(rows: unknown): T {
  return JSON.parse(
    JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}
const SEASON_MIN = 18;

// официальный турнир (как в API радаров)
const WHERE_OFFICIAL = `
  t.name LIKE '%сезон%'
  AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}
`;

// --- SQL (везде тянем u.gamertag / u.username как display_name) ---
const SQL_TOP_MATCHES = `
  SELECT
    ums.user_id,
    COALESCE(NULLIF(u.gamertag,''), NULLIF(u.username,''), CONCAT('User #', ums.user_id)) AS display_name,
    COUNT(DISTINCT ums.match_id) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  LEFT JOIN tbl_users u    ON u.id  = ums.user_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id, display_name
  ORDER BY val DESC
  LIMIT 3
`;

const SQL_TOP_GOALS = `
  SELECT
    ums.user_id,
    COALESCE(NULLIF(u.gamertag,''), NULLIF(u.username,''), CONCAT('User #', ums.user_id)) AS display_name,
    SUM(ums.goals) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  LEFT JOIN tbl_users u    ON u.id  = ums.user_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id, display_name
  ORDER BY val DESC
  LIMIT 3
`;

const SQL_TOP_ASSISTS = `
  SELECT
    ums.user_id,
    COALESCE(NULLIF(u.gamertag,''), NULLIF(u.username,''), CONCAT('User #', ums.user_id)) AS display_name,
    SUM(ums.assists) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  LEFT JOIN tbl_users u    ON u.id  = ums.user_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id, display_name
  ORDER BY val DESC
  LIMIT 3
`;

const SQL_TOP_DEFENSE = `
  SELECT
    ums.user_id,
    COALESCE(NULLIF(u.gamertag,''), NULLIF(u.username,''), CONCAT('User #', ums.user_id)) AS display_name,
    SUM(ums.intercepts + ums.selection + ums.completedtackles + ums.blocks) AS val
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm ON tm.id = ums.match_id
  JOIN tournament t        ON t.id  = tm.tournament_id
  LEFT JOIN tbl_users u    ON u.id  = ums.user_id
  WHERE ${WHERE_OFFICIAL}
  GROUP BY ums.user_id, display_name
  ORDER BY val DESC
  LIMIT 3
`;

// GK: ВР/ВРТ, >=100 матчей, сортировка по save%
const SQL_TOP_GK_SAVEPCT = `
  SELECT
    ums.user_id,
    COALESCE(NULLIF(u.gamertag,''), NULLIF(u.username,''), CONCAT('User #', ums.user_id)) AS display_name,
    COUNT(DISTINCT ums.match_id) AS matches,
    SUM(ums.saved)   AS saved,
    SUM(ums.scored)  AS conceded,
    (CAST(SUM(ums.saved) AS DECIMAL(18,6)) / NULLIF(CAST(SUM(ums.saved)+SUM(ums.scored) AS DECIMAL(18,6)),0)) AS save_pct
  FROM tbl_users_match_stats ums
  JOIN tournament_match tm   ON tm.id = ums.match_id
  JOIN tournament t          ON t.id  = tm.tournament_id
  LEFT JOIN tbl_field_positions fp ON fp.id = ums.position_id
  LEFT JOIN tbl_users u      ON u.id  = ums.user_id
  WHERE ${WHERE_OFFICIAL}
    AND fp.code IN ('ВР','ВРТ')
  GROUP BY ums.user_id, display_name
  HAVING matches >= 100 AND (saved + conceded) > 0
  ORDER BY save_pct DESC
  LIMIT 3
`;

// --- UI ---
function PlayerCard({
  userId,
  name,
  value,
  suffix,
  place,
}: {
  userId: number;
  name: string;
  value: number;
  suffix?: string;
  place?: number;
}) {
  let trophyClasses = "bg-gray-200 text-gray-600";

  if (place === 1) {
    // золотой кубок
    trophyClasses = "bg-yellow-100 text-yellow-700";
  } else if (place === 2) {
    // серебряный кубок
    trophyClasses = "bg-gray-100 text-gray-700";
  } else if (place === 3) {
    // бронзовый кубок
    trophyClasses = "bg-amber-100 text-amber-700";
  }

  return (
    <Link href={`/players/${userId}`}>
      <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center space-x-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${trophyClasses}`}
          >
            {/* условный кубок по месту */}
            <span className="text-xl">🏆</span>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-800">{name}</h4>
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
  const [m1, m2, m3, m4, gk] = await Promise.all([
    prisma.$queryRawUnsafe(SQL_TOP_MATCHES),
    prisma.$queryRawUnsafe(SQL_TOP_GOALS),
    prisma.$queryRawUnsafe(SQL_TOP_ASSISTS),
    prisma.$queryRawUnsafe(SQL_TOP_DEFENSE),
    prisma.$queryRawUnsafe(SQL_TOP_GK_SAVEPCT),
  ]);

  const topMatches = toJSON<{ user_id: number; display_name: string; val: number }[]>(m1);
  const topGoals   = toJSON<{ user_id: number; display_name: string; val: number }[]>(m2);
  const topAssists = toJSON<{ user_id: number; display_name: string; val: number }[]>(m3);
  const topDefense = toJSON<{ user_id: number; display_name: string; val: number }[]>(m4);
  const topGk = toJSON<{
    user_id: number; display_name: string; matches: number; saved: number; conceded: number; save_pct: number;
  }[]>(gk);

  return { topMatches, topGoals, topAssists, topDefense, topGk };
}

export default async function HomePage() {
  const { topMatches, topGoals, topAssists, topDefense, topGk } = await fetchTop();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
            Поиск игроков и команд
          </h2>
        </div>

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
                <p className="text-gray-600">
                  Детальная статистика и рейтинги
                </p>
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
                <p className="text-gray-600">
                  Составы и информация о командах
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Изучите составы команд, основную информацию и статистику
            </div>
          </Link>
        </div>

        {/* Номинации слева направо, внутри каждой — топ-3 сверху вниз */}
        <div className="mt-12 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-8">
            <Section title="Топ по матчам">
              {topMatches.map((r, idx) => (
                <PlayerCard
                  key={r.user_id}
                  userId={r.user_id}
                  name={r.display_name}
                  value={r.val}
                  place={idx + 1}
                />
              ))}
            </Section>

            <Section title="Топ по голам">
              {topGoals.map((r, idx) => (
                <PlayerCard
                  key={r.user_id}
                  userId={r.user_id}
                  name={r.display_name}
                  value={r.val}
                  place={idx + 1}
                />
              ))}
            </Section>

            <Section title="Топ по голевым">
              {topAssists.map((r, idx) => (
                <PlayerCard
                  key={r.user_id}
                  userId={r.user_id}
                  name={r.display_name}
                  value={r.val}
                  place={idx + 1}
                />
              ))}
            </Section>

            <Section title="Топ по защитным действиям">
              {topDefense.map((r, idx) => (
                <PlayerCard
                  key={r.user_id}
                  userId={r.user_id}
                  name={r.display_name}
                  value={r.val}
                  place={idx + 1}
                />
              ))}
            </Section>

            <Section title="Топ вратарей по % сейвов (≥100 матчей)">
              {topGk.map((r, idx) => (
                <PlayerCard
                  key={r.user_id}
                  userId={r.user_id}
                  name={r.display_name}
                  value={Math.round(r.save_pct * 1000) / 10}
                  suffix="%"
                  place={idx + 1}
                />
              ))}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      {/* топ-3 сверху вниз */}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
