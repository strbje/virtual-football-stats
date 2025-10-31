// src/app/players/[userId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PositionPitchHeatmap from "@/components/PositionPitchHeatmap";

export const dynamic = "force-dynamic";

// ----------------- helpers -----------------
type SearchParamsDict = Record<string, string | string[] | undefined>;

function getVal(d: SearchParamsDict | undefined, k: string): string {
  if (!d) return "";
  const v = d[k];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function parseRange(range?: string): { fromTs: number; toTs: number } {
  if (!range) return { fromTs: 0, toTs: 32503680000 }; // до 3000 года :)
  const [start, end] = range.split(":").map(s => s?.trim()).filter(Boolean);
  const from =
    start && /^\d{4}-\d{2}-\d{2}$/.test(start)
      ? Math.floor(new Date(`${start} 00:00:00`).getTime() / 1000)
      : 0;
  const to =
    end && /^\d{4}-\d{2}-\d{2}$/.test(end)
      ? Math.floor(new Date(`${end} 23:59:59`).getTime() / 1000)
      : 32503680000;
  return { fromTs: from, toTs: to };
}

// ----------------- page -----------------
export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams?: SearchParamsDict;
}) {
  const userIdNum = Number(params.userId);
  if (!Number.isFinite(userIdNum)) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Неверный ID игрока</h1>
        <Link href="/players" className="text-blue-600 hover:underline">
          ← Вернуться к списку игроков
        </Link>
      </div>
    );
  }

  const { fromTs, toTs } = parseRange(getVal(searchParams, "range"));

  // --- базовая инфа по игроку
  const user = await prisma.$queryRawUnsafe<
    { id: number; gamertag: string | null; username: string | null }[]
  >(
    `
    SELECT u.id, u.gamertag, u.username
    FROM tbl_users u
    WHERE u.id = ?
    LIMIT 1
  `,
    userIdNum,
  );

  if (!user.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Игрок не найден</h1>
        <Link href="/players" className="text-blue-600 hover:underline">
          ← Вернуться к списку игроков
        </Link>
      </div>
    );
  }

  // --- агрегаты + последнее амплуа/команда
  const agg = await prisma.$queryRawUnsafe<
    {
      matches: number;
      goals: number | null;
      assists: number | null;
      last_role: string | null; // ВАЖНО: берем sp.code/short_name
      last_team: string | null;
    }[]
  >(
    `
    SELECT
      COUNT(*)                         AS matches,
      SUM(ums.goals)                   AS goals,
      SUM(ums.assists)                 AS assists,
      (
        SELECT COALESCE(sp.code, sp.short_name)
        FROM tbl_users_match_stats ums2
        JOIN tournament_match tm2 ON tm2.id = ums2.match_id
        JOIN skills_positions sp  ON sp.id  = ums2.skill_id
        WHERE ums2.user_id = ?
          AND tm2.timestamp BETWEEN ? AND ?
        ORDER BY tm2.timestamp DESC
        LIMIT 1
      ) AS last_role,
      (
        SELECT t2.team_name
        FROM tbl_users_match_stats ums3
        JOIN tournament_match tm3 ON tm3.id = ums3.match_id
        JOIN teams t2            ON t2.id  = ums3.team_id
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
    // подзапрос 1
    userIdNum,
    fromTs,
    toTs,
    // подзапрос 2
    userIdNum,
    fromTs,
    toTs,
    // основной
    userIdNum,
    fromTs,
    toTs,
  );

  const a = {
    matches: Number(agg?.[0]?.matches ?? 0),
    goals: Number(agg?.[0]?.goals ?? 0),
    assists: Number(agg?.[0]?.assists ?? 0),
    last_role: agg?.[0]?.last_role ?? null,
    last_team: agg?.[0]?.last_team ?? null,
  };

  // --- распределение по амплуа (ВАЖНО: по коду амплуа)
  const rolesRows = await prisma.$queryRawUnsafe<{ role: string; cnt: number }[]>(
    `
      SELECT COALESCE(sp.code, sp.short_name) AS role, COUNT(*) AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN skills_positions  sp ON sp.id = ums.skill_id
      WHERE ums.user_id = ?
        AND tm.timestamp BETWEEN ? AND ?
      GROUP BY COALESCE(sp.code, sp.short_name)
      ORDER BY cnt DESC
    `,
    userIdNum,
    fromTs,
    toTs,
  );

  const totalCnt = rolesRows.reduce((s, r) => s + Number(r.cnt), 0) || 1;

  const rolePct = rolesRows.map(r => ({
    role: r.role,
    pct: Math.round((Number(r.cnt) * 100) / totalCnt),
  }));

  // данные для тепловой карты
  const heatmapData: { role: string; count: number }[] = rolesRows.map(r => ({
    role: r.role,
    count: Number(r.cnt),
  }));

  const title = user[0]?.gamertag || user[0]?.username || `User #${userIdNum}`;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-gray-500">
            {a.last_team ? `${a.last_team} · ` : ""}
            {a.last_role ?? "—"}
          </p>
        </div>

        <Link
          href="/players"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Ко всем игрокам
        </Link>
      </header>

      {/* KPI-блоки */}
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

      {/* распределение по амплуа */}
      <section className="mt-2">
        <h2 className="font-semibold mb-2">Распределение амплуа, % матчей</h2>
        <ul className="list-disc pl-6">
          {rolePct.length > 0
            ? rolePct.map(r => (
                <li key={r.role}>
                  {r.role}: {r.pct}%
                </li>
              ))
            : <li>Данных за выбранный период нет</li>}
        </ul>
      </section>

      {/* тепловая карта позиций */}
      <section className="mt-4">
        <h2 className="font-semibold mb-2">Тепловая карта амплуа</h2>
        <div className="max-w-[360px]">
          {/* Масштаб можно подкрутить: 0.7–1.0 */}
          <PositionPitchHeatmap data={heatmapData} scale={0.82} />
        </div>
      </section>
    </div>
  );
}
