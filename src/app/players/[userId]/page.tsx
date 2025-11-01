// src/app/players/[userId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PositionPitchHeatmap from "@/components/PositionPitchHeatmap";

export const dynamic = "force-dynamic";

type SearchParamsDict = Record<string, string | string[] | undefined>;

function getVal(d: SearchParamsDict, k: string): string {
  const v = d[k];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function parseRange(range?: string): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range.split(":").map((s) => s?.trim()).filter(Boolean);
  return {
    from: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined,
    to: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined,
  };
}

// ВАЖНО: не типизируем аргументы как PageProps из Next 15 — там другая форма.
// Берём any и дальше приводим params вручную.
export default async function PlayerPage(props: any) {
  const params = (props?.params ?? {}) as { userId?: string };
  const searchParams = (props?.searchParams ?? {}) as SearchParamsDict;

  const userIdStr = params.userId ?? "";
  const userIdNum = Number(userIdStr);

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

  // --- диапазон дат из ?range=YYYY-MM-DD:YYYY-MM-DD (необязателен) ---
  const range = getVal(searchParams, "range");
  const { from, to } = parseRange(range);
  const fromTs = from ? Math.floor(new Date(`${from} 00:00:00`).getTime() / 1000) : 0;
  const toTs =
    to ? Math.floor(new Date(`${to} 23:59:59`).getTime() / 1000) : 32503680000; // ~ year 3000

  // --- базовая инфа по игроку ---
  const user = await prisma.$queryRawUnsafe<
    { id: number; gamertag: string | null; username: string | null }[]
  >(
    `
      SELECT u.id, u.gamertag, u.username
      FROM tbl_users u
      WHERE u.id = ?
      LIMIT 1
    `,
    userIdNum
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

  // --- агрегаты + последнее амплуа/команда (ВАЖНО: код амплуа из tbl_field_positions) ---
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
          SELECT COALESCE(fp.code, sp.short_name)
          FROM tbl_users_match_stats ums2
          JOIN tournament_match tm2     ON tm2.id = ums2.match_id
          JOIN skills_positions sp      ON sp.id  = ums2.skill_id
          LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
          WHERE ums2.user_id = ?
            AND tm2.timestamp BETWEEN ? AND ?
          ORDER BY tm2.timestamp DESC
          LIMIT 1
        ) AS last_role,
        (
          SELECT t2.team_name
          FROM tbl_users_match_stats ums3
          JOIN tournament_match tm3 ON tm3.id = ums3.match_id
          JOIN teams t2             ON t2.id = ums3.team_id
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
    // подзапрос last_role
    userIdNum, fromTs, toTs,
    // подзапрос last_team
    userIdNum, fromTs, toTs,
    // основной
    userIdNum, fromTs, toTs
  );

  const a = {
    matches: Number(agg?.[0]?.matches ?? 0),
    goals: Number(agg?.[0]?.goals ?? 0),
    assists: Number(agg?.[0]?.assists ?? 0),
    last_role: agg?.[0]?.last_role ?? null,
    last_team: agg?.[0]?.last_team ?? null,
  };

  // --- распределение по амплуа (fp.code приоритетно, иначе sp.short_name) ---
  const rolesRows = await prisma.$queryRawUnsafe<{ role: string; cnt: number }[]>(
    `
      SELECT COALESCE(fp.code, sp.short_name) AS role, COUNT(*) AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm         ON tm.id = ums.match_id
      JOIN skills_positions  sp        ON sp.id = ums.skill_id
      LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
      WHERE ums.user_id = ?
        AND tm.timestamp BETWEEN ? AND ?
      GROUP BY COALESCE(fp.code, sp.short_name)
      ORDER BY cnt DESC
    `,
    userIdNum,
    fromTs,
    toTs
  );

  const totalCnt = rolesRows.reduce((s, r) => s + Number(r.cnt), 0) || 1;
  const rolePct = rolesRows.map((r) => ({
    role: r.role,
    pct: Math.round((Number(r.cnt) * 100) / totalCnt),
  }));

  // данные для теплокарты (ожидает role/count)
  const heatmapData = rolesRows.map((r) => ({
    role: r.role,
    count: Number(r.cnt),
  }));

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user[0]?.gamertag || user[0]?.username || `User #${userIdNum}`}
          </h1>
          <p className="text-sm text-gray-500">
            {a.last_team ? `${a.last_team} · ` : ""}
            {a.last_role ?? "—"}
          </p>
        </div>
        <Link href="/players" className="text-blue-600 hover:underline text-sm">
          ← Ко всем игрокам
        </Link>
      </header>

      {/* агрегаты */}
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

      {/* список распределения */}
      <section>
        <h2 className="font-semibold mb-2">Распределение амплуа, % матчей</h2>
        <ul className="list-disc pl-6">
          {rolePct.map((r) => (
            <li key={r.role}>
              {r.role}: {r.pct}%
            </li>
          ))}
          {rolePct.length === 0 && <li>Данных за выбранный период нет</li>}
        </ul>
      </section>

      {/* тепловая карта позиций */}
      <section className="mt-4">
        <h2 className="font-semibold mb-2">Тепловая карта амплуа</h2>
        <PositionPitchHeatmap data={heatmapData} />
      </section>
    </div>
  );
}
