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

  if (q) {
    where.push("(u.gamertag LIKE ? OR u.username LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (team) {
    where.push("c.team_name LIKE ?");
    params.push(`%${team}%`);
  }
  if (tournament) {
    where.push("t.name LIKE ?");
    params.push(`%${tournament}%`);
  }
  if (role) {
    where.push("sp.short_name = ?");
    params.push(role);
  }
  if (from) {
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // значения для выпадашки амплуа (как было)
  const rolesRows = (
    await prisma.$queryRawUnsafe<{ role: string }[]>(
      `
      SELECT DISTINCT sp.short_name AS role
      FROM tbl_users_match_stats ums
      JOIN skills_positions sp ON ums.skill_id = sp.id
    `,
    )
  ).map((r) => r.role);

  // основная выборка: агрегируем по игроку
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,
          u.gamertag,
          u.username,
          c.team_name,
          tm.timestamp
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON ums.match_id = tm.id
        JOIN skills_positions sp ON ums.skill_id = sp.id
        JOIN tbl_users u        ON ums.user_id  = u.id
        JOIN tournament t       ON tm.tournament_id = t.id
        JOIN teams c            ON ums.team_id = c.id
        ${whereSql}
      ),
      matches_per_user AS (
        SELECT
          user_id,
          COUNT(DISTINCT match_id) AS matches
        FROM base
        GROUP BY user_id
      ),
      latest_team AS (
        SELECT
          user_id,
          team_name,
          gamertag,
          username,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) AS rn
        FROM base
      )
      SELECT
        m.user_id,
        lt.gamertag,
        lt.username,
        lt.team_name,
        m.matches
      FROM matches_per_user m
      LEFT JOIN latest_team lt
        ON lt.user_id = m.user_id AND lt.rn = 1
      ORDER BY m.matches DESC, m.user_id ASC
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
              <tr key={r.user_id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <Link
                    href={`/players/${r.user_id}${
                      range ? `?range=${range}` : ""
                    }`}
                    className="hover:underline"
                  >
                    {r.gamertag || r.username || `User #${r.user_id}`}
                  </Link>
                </td>
                <td className="py-2 pr-4">{r.team_name ?? "—"}</td>
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
