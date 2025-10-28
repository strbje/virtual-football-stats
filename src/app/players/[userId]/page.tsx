// src/app/players/[userId]/page.tsx
import prisma from "@/lib/prisma";
import { parseRange } from "@/app/players/_utils/parseRange";

// чтобы страница всегда генерировалась на сервере и брала свежие данные
export const dynamic = "force-dynamic";

type SearchParamsDict = Record<string, string | string[] | undefined>;

type PageProps = {
  params?: Promise<{ userId: string }>;
  searchParams?: Promise<SearchParamsDict>;
};

// удобные хелперы
const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function PlayerPage({ params, searchParams }: PageProps) {
  // --- params ---
  const p = params ? await params : ({ userId: "" } as { userId: string });
  const userId = p.userId;

  if (!userId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Игрок не указан</h1>
      </div>
    );
  }

  // --- searchParams ---
  const sp: SearchParamsDict = (await (searchParams ?? Promise.resolve({}))) || {};

  // поддерживаем и range=YYYY-MM-DD_to_YYYY-MM-DD, и from/to (на будущее)
  const rangeRaw = first(sp.range);
  const fromRaw = first(sp.from);
  const toRaw = first(sp.to);

  let fromISO: string | undefined;
  let toISO: string | undefined;

  if (rangeRaw) {
    const r = parseRange(rangeRaw);
    fromISO = r.from ?? undefined;
    toISO = r.to ?? undefined;
  } else {
    fromISO = fromRaw ?? undefined;
    toISO = toRaw ?? undefined;
  }

  // --- дата в unix секундах для фильтра к tournament_match.timestamp ---
  const fromTs = fromISO ? Math.floor(Date.parse(fromISO) / 1000) : undefined;
  const toTs = toISO ? Math.floor(Date.parse(toISO) / 1000) : undefined;

  // --- профиль игрока (gamertag, username) ---
  const user = await prisma.$queryRawUnsafe<{
    id: number;
    gamertag: string | null;
    username: string | null;
  }[]>(
    `
      SELECT u.id, u.gamertag, u.username
      FROM tbl_users u
      WHERE u.id = ?
      LIMIT 1
    `,
    userId
  );

  if (!user.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Игрок не найден</h1>
      </div>
    );
  }

  // --- агрегаты по выбранному периоду ---
  // Пример: матчи/голы/ассисты + роль (последняя за период) и команда (последняя за период)
  // При необходимости расширим (xG, передачи и т.д.) — данные есть в ums.*
  const whereDate =
    fromTs && toTs
      ? "AND tm.timestamp BETWEEN ? AND ?"
      : fromTs
      ? "AND tm.timestamp >= ?"
      : toTs
      ? "AND tm.timestamp <= ?"
      : "";

  const paramsDate: (string | number)[] = [userId];
  if (fromTs && toTs) paramsDate.push(fromTs, toTs);
  else if (fromTs) paramsDate.push(fromTs);
  else if (toTs) paramsDate.push(toTs);

  const agg = await prisma.$queryRawUnsafe<
    {
      matches: number;
      goals: number | null;
      assists: number | null;
      last_role: string | null;
      last_team: string | null;
    }[]
  >(
    `
      SELECT
        COUNT(*)                            AS matches,
        SUM(ums.goals)                      AS goals,
        SUM(ums.assists)                    AS assists,
        (
          SELECT sp.short_name
          FROM tbl_users_match_stats ums2
          JOIN tournament_match tm2 ON tm2.id = ums2.match_id
          JOIN skills_positions sp ON sp.id = ums2.skill_id
          WHERE ums2.user_id = ?
            ${whereDate.replaceAll("tm.", "tm2.")}
          ORDER BY tm2.timestamp DESC
          LIMIT 1
        ) AS last_role,
        (
          SELECT t2.team_name
          FROM tbl_users_match_stats ums3
          JOIN tournament_match tm3 ON tm3.id = ums3.match_id
          JOIN teams t2 ON t2.id = ums3.team_id
          WHERE ums3.user_id = ?
            ${whereDate.replaceAll("tm.", "tm3.")}
          ORDER BY tm3.timestamp DESC
          LIMIT 1
        ) AS last_team
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.user_id = ?
        ${whereDate}
    `,
    // подзапрос 1 (role)
    ...paramsDate,
    // подзапрос 2 (team)
    ...paramsDate,
    // основной where
    ...paramsDate
  );

  const a = agg[0] || {
    matches: 0,
    goals: 0,
    assists: 0,
    last_role: null,
    last_team: null,
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user[0].gamertag || user[0].username || `User #${userId}`}
          </h1>
          <p className="text-sm text-gray-500">
            {a.last_team ? `${a.last_team} · ` : ""}
            {a.last_role ?? "—"}
          </p>
        </div>
        {/* сюда позже добавим date-range фильтр (тот же формат range=YYYY-MM-DD_to_YYYY-MM-DD),
            чтобы фильтровать прямо в профиле */}
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Матчи</div>
          <div className="text-2xl font-semibold">{a.matches ?? 0}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Голы</div>
          <div className="text-2xl font-semibold">{a.goals ?? 0}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Передачи</div>
          <div className="text-2xl font-semibold">{a.assists ?? 0}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Амплуа (последнее)</div>
          <div className="text-2xl font-semibold">{a.last_role ?? "—"}</div>
        </div>
      </section>

      {/* ниже можно добавить таблицу матчей игрока с пагинацией — добьём на следующем шаге */}
    </div>
  );
}
