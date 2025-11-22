// src/app/teams/page.tsx
import { prisma } from "@/lib/prisma";
import TeamsFiltersClient from "@/components/teams/TeamsFiltersClient";
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
  team_id: number;
  team_name: string;
  matches: number;
};

export default async function Page({
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

  // фильтр по команде
  if (team) {
    where.push("c.team_name LIKE ?");
    params.push(`%${team}%`);
  }

  // фильтр по турниру
  if (tournament) {
    where.push("t.name LIKE ?");
    params.push(`%${tournament}%`);
  }

  // фильтр по датам
  if (from) {
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Основная выборка: топ-30 команд по числу матчей
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
      WITH base AS (
        SELECT
          ums.team_id,
          c.team_name,
          ums.match_id,
          tm.timestamp
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON ums.match_id = tm.id
        JOIN tournament t       ON tm.tournament_id = t.id
        JOIN teams c            ON ums.team_id = c.id
        ${whereSql}
      ),
      per_team AS (
        SELECT
          team_id,
          MAX(team_name) AS team_name,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches
        FROM base
        GROUP BY team_id
      )
      SELECT
        team_id,
        team_name,
        matches
      FROM per_team
      ORDER BY matches DESC
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
              <th className="py-2 pr-4 text-right">Матчи</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team_id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <Link
                    href={`/teams/${r.team_id}${
                      range ? `?range=${encodeURIComponent(range)}` : ""
                    }`}
                    className="hover:underline"
                  >
                    {r.team_name}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-right">{r.matches}</td>
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
