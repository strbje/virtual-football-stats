// src/app/teams/page.tsx

import { prisma } from "@/lib/prisma";
import TeamsFiltersClient from "@/components/teams/TeamsFiltersClient";

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

type Row = {
  team_id: number;
  team_name: string;
  matches: number;
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: SearchParamsDict;
}) {
  const raw = searchParams ?? {};
  const team = getVal(raw, "team");
  const tournament = getVal(raw, "tournament");
  const range = getVal(raw, "range");

  const { from, to } = parseRange(range);

  const where: string[] = [];
  const params: any[] = [];

  if (team) {
    where.push("c.team_name LIKE ?");
    params.push(`%${team}%`);
  }
  if (tournament) {
    where.push("t.name LIKE ?");
    params.push(`%${tournament}%`);
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

  // Агрегация по командам: считаем все матчи, берём последнюю команду
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
      SELECT
        c.id          AS team_id,
        c.team_name   AS team_name,
        COUNT(DISTINCT tm.id) AS matches
      FROM teams c
      JOIN tbl_users_match_stats ums ON ums.team_id = c.id
      JOIN tournament_match tm       ON tm.id = ums.match_id
      JOIN tournament t              ON t.id = tm.tournament_id
      ${whereSql}
      GROUP BY c.id, c.team_name
      ORDER BY matches DESC, c.team_name ASC
      LIMIT 30
    `,
    ...params,
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Команды</h1>

      <TeamsFiltersClient
        initial={{
          team,
          tournament,
          range,
        }}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Матчи</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team_id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  {/* Профиль команды подключим позже */}
                  <span>{r.team_name}</span>
                </td>
                <td className="py-2 pr-4">{r.matches}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={2}>
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
