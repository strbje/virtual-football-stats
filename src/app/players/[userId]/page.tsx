// src/app/players/[userId]/page.tsx
import prisma from "@/lib/prisma";
import { parseRange } from "@/app/players/_utils/parseRange";
import PositionMap from "@/app/players/_components/PositionMap";
import PositionPitchHeatmap from '@/components/PositionPitchHeatmap';

export const dynamic = "force-dynamic";

type SearchParamsDict = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<SearchParamsDict>;
};

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Профиль игрока
 * URL: /players/[userId]?range=YYYY-MM-DD_to_YYYY-MM-DD
 */
export default async function Page({ params, searchParams }: PageProps) {
  // --- params (Next 15: Promise) ---
  const { userId } = await params;
  if (!userId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Игрок не указан</h1>
      </div>
    );
  }

  // --- search params: диапазон дат ---
  const sp = (await (searchParams ?? Promise.resolve({}))) as SearchParamsDict;
  const rangeRaw = first(sp?.range);
  const { from, to } = parseRange(rangeRaw);
  const fromTs = from ? Math.floor(new Date(from).getTime() / 1000) : 0;
  const toTs = to ? Math.floor(new Date(to).getTime() / 1000) : 32503680000; // до 01.01.3000

  // --- базовая инфа об игроке ---
  const user = await prisma.$queryRawUnsafe<
    { id: number; gamertag: string | null; username: string | null }[]
  >(
    `
      SELECT u.id, u.gamertag, u.username
      FROM tbl_users u
      WHERE u.id = ?
      LIMIT 1
    `,
    Number(userId)
  );

  if (!user.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Игрок не найден</h1>
      </div>
    );
  }

  // --- агрегаты + последняя роль/команда за период ---
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
        COUNT(*)                         AS matches,
        SUM(ums.goals)                   AS goals,
        SUM(ums.assists)                 AS assists,
        (
          SELECT sp.short_name
          FROM tbl_users_match_stats ums2
          JOIN tournament_match tm2 ON tm2.id = ums2.match_id
          JOIN skills_positions sp ON sp.id = ums2.skill_id
          WHERE ums2.user_id = ?
            AND tm2.timestamp BETWEEN ? AND ?
          ORDER BY tm2.timestamp DESC
          LIMIT 1
        ) AS last_role,
        (
          SELECT t2.team_name
          FROM tbl_users_match_stats ums3
          JOIN tournament_match tm3 ON tm3.id = ums3.match_id
          JOIN teams t2 ON t2.id = ums3.team_id
          WHERE ums3.user_id = ?
            AND tm3.timestamp BETWEEN ? AND ?
          ORDER BY tm3.timestamp DESC
          LIMIT 1
        ) AS last_team
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.user_id = ?
        AND tm.timestamp BETWEEN ? AND ?
    `,
    Number(userId), fromTs, toTs, // подзапрос 1 (роль)
    Number(userId), fromTs, toTs, // подзапрос 2 (команда)
    Number(userId), fromTs, toTs  // основной запрос
  );

  const a = {
    matches: Number(agg?.[0]?.matches ?? 0),
    goals: Number(agg?.[0]?.goals ?? 0),
    assists: Number(agg?.[0]?.assists ?? 0),
    last_team: agg?.[0]?.last_team ?? null,
    last_role: agg?.[0]?.last_role ?? null,
  };

  // --- распределение по амплуа (доля матчей) ---
  const rolesRows = await prisma.$queryRawUnsafe<{ role: string; cnt: number }[]>(
    `
      SELECT sp.short_name AS role, COUNT(*) AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN skills_positions  sp ON sp.id = ums.skill_id
      WHERE ums.user_id = ?
        AND tm.timestamp BETWEEN ? AND ?
      GROUP BY sp.short_name
      ORDER BY cnt DESC
    `,
    Number(userId), fromTs, toTs
  );

  const totalCnt = rolesRows.reduce((s, r) => s + Number(r.cnt), 0) || 1;
  const rolePct = rolesRows.map(r => ({
    role: r.role,
    pct: Math.round((Number(r.cnt) * 100) / totalCnt),
  }));

  // --- рендер ---
  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user[0]?.gamertag || user[0]?.username || `User #${userId}`}
          </h1>
          <p className="text-sm text-gray-500">
            {a.last_team ? `${a.last_team} · ` : ""}
            {a.last_role ?? "—"}
          </p>
        </div>
        {/* сюда позже добавим кликабельный date-range в одном контроле */}
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Матчи</div>
          <div className="text-2xl font-semibold">{a.matches}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Голы</div>
          <div className="text-2xl font-semibold">{a.goals}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Передачи</div>
          <div className="text-2xl font-semibold">{a.assists}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Амплуа (последнее)</div>
          <div className="text-2xl font-semibold">{a.last_role ?? "—"}</div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Карта амплуа за период */}
        <div className="xl:col-span-2">
         <PositionPitchHeatmap
  data={rolePct /* [{role:'ЦАП', pct:81}, ...] */}
  caption="Карта амплуа (доля матчей за период)"
/>
        </div>
      </div>

      {/* ниже позже добавим таблицу матчей игрока */}
    </div>
  );
}
