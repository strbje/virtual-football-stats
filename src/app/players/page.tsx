// src/app/players/page.tsx
import { prisma } from "@/lib/prisma";
import FiltersClient from "@/components/players/FiltersClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParamsDict = Record<string, string | string[] | undefined>;

function getVal(d: SearchParamsDict, k: string): string {
  const v = d[k];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function parseRange(range?: string): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range
    .split(":")
    .map((s) => s?.trim())
    .filter(Boolean);
  return {
    from: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined,
    to: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined,
  };
}

type Row = {
  user_id: number;
  gamertag: string | null;
  username: string | null;
  team_name: string | null;
  matches: number;
};

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParamsDict;
}) {
  const raw = searchParams ?? {};
  const q = getVal(raw, "q");
  const team = getVal(raw, "team");
  const tournament = getVal(raw, "tournament");
  const role = getVal(raw, "role");
  const range = getVal(raw, "range");

  const { from, to } = parseRange(range);

  const where: string[] = [];
  const params: any[] = [];

  // Фильтр по игроку (ник / username)
  if (q) {
    where.push("(u.gamertag LIKE ? OR u.username LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  // Фильтр по команде (по участию в матчах за эту команду)
  if (team) {
    where.push("c.team_name LIKE ?");
    params.push(`%${team}%`);
  }

  // Фильтр по турниру
  if (tournament) {
    where.push("t.name LIKE ?");
    params.push(`%${tournament}%`);
  }

  // Фильтр по амплуа
  if (role) {
    where.push("sp.short_name = ?");
    params.push(role);
  }

  // Диапазон дат по timestamp матча
  if (from) {
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // значения для выпадашки амплуа
  const rolesRows = (
    await prisma.$queryRawUnsafe<{ role: string }[]>(
      `
      SELECT DISTINCT sp.short_name AS role
      FROM tbl_users_match_stats ums
      JOIN skills_positions sp ON ums.skill_id = sp.id
    `,
    )
  ).map((r) => r.role);

  // Основная выборка:
  // 1) сначала считаем матчи по игрокам с учётом фильтров
  // 2) затем берём топ-30 по матчам
  // 3) к каждому игроку подтягиваем последнюю команду по времени матча
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
      WITH per_user AS (
        SELECT
          ums.user_id,
          CAST(COUNT(*) AS UNSIGNED) AS matches
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON ums.match_id = tm.id
        JOIN tournament t        ON tm.tournament_id = t.id
        JOIN teams c             ON ums.team_id = c.id
        JOIN skills_positions sp ON ums.skill_id = sp.id
        JOIN tbl_users u         ON ums.user_id = u.id
        ${whereSql}
        GROUP BY ums.user_id
      )
      SELECT
        pu.user_id,
        u.gamertag,
        u.username,
        (
          SELECT c2.team_name
          FROM tbl_users_match_stats ums2
          JOIN tournament_match tm2 ON tm2.id = ums2.match_id
          JOIN teams c2             ON c2.id  = ums2.team_id
          WHERE ums2.user_id = pu.user_id
          ORDER BY tm2.timestamp DESC
          LIMIT 1
        ) AS team_name,
        pu.matches
      FROM per_user pu
      JOIN tbl_users u ON u.id = pu.user_id
      ORDER BY pu.matches DESC
      LIMIT 30
    `,
    ...params,
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Игроки</h1>

      <FiltersClient
        initial={{ q, team, tournament, role, range }}
        roles={rolesRows}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Игрок</th>
              <th className="py-2 pr-4">Команда (последний матч)</th>
              <th className="py-2 pr-4">Матчи</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.user_id}
                className="border-b last:border-b-0 hover:bg-zinc-50"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/players/${r.user_id}${range ? `?range=${range}` : ""}`}
                    className="hover:underline"
                  >
                    {r.gamertag || r.username || `User #${r.user_id}`}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {r.team_name || <span className="text-zinc-400">—</span>}
                </td>
                <td className="py-2 pr-4">{r.matches}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={3}>
                  Ничего не найдено.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
