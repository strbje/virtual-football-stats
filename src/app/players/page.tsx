// app/players/page.tsx
import { prisma } from "@/lib/prisma";
import FiltersClient from "@/components/players/FiltersClient";
import Link from "next/link";
import React from "react";

type Search = {
  q?: string;
  team?: string;
  tournament?: string;
  role?: string;
  range?: string; // "YYYY-MM-DD:YYYY-MM-DD"
};

type Row = {
  user_id: number;
  gamertag: string;
  username: string;
  role: string; // skills_positions.short_name
  team_name: string;
  tournament_name: string;
  round: number;
};

function parseRange(range?: string): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range.split(":").map((s) => s?.trim()).filter(Boolean);
  return {
    from: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined,
    to: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams ?? {};

  const get = (key: string): string => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };

  const s: Search = {
    q: get("q"),
    team: get("team"),
    tournament: get("tournament"),
    role: get("role"),
    range: get("range"),
  };

  const { from, to } = parseRange(s.range);

  // WHERE и параметры
  const where: string[] = [];
  const params: any[] = [];

  if (s.q) {
    where.push("(u.gamertag LIKE ? OR u.username LIKE ?)");
    params.push(`%${s.q}%`, `%${s.q}%`);
  }
  if (s.team) {
    where.push("c.team_name LIKE ?");
    params.push(`%${s.team}%`);
  }
  if (s.tournament) {
    where.push("t.name LIKE ?");
    params.push(`%${s.tournament}%`);
  }
  if (s.role) {
    where.push("sp.short_name = ?");
    params.push(s.role);
  }
  if (from) {
    // tournament_match.timestamp — UNIX seconds
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // 1) Список ролей (как есть в БД), для селекта
  const rolesRows = (
    (await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT DISTINCT sp.short_name AS role
        FROM tbl_users_match_stats ums
        INNER JOIN skills_positions sp ON ums.skill_id = sp.id
      `
    )) as { role: string }[]
  ).map((r) => r.role);

  // 2) Строки таблицы (без даты)
  const rows = (await prisma.$queryRawUnsafe<Row[]>(
    `
      SELECT
        u.id               AS user_id,
        u.gamertag,
        u.username,
        sp.short_name      AS role,
        c.team_name,
        t.name             AS tournament_name,
        tm.round
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN skills_positions sp  ON ums.skill_id = sp.id
      INNER JOIN tbl_users u          ON ums.user_id  = u.id
      INNER JOIN tournament t         ON tm.tournament_id = t.id
      INNER JOIN teams c              ON ums.team_id = c.id
      ${whereSql}
      ORDER BY tm.timestamp DESC
      LIMIT 200
    `,
    ...params
  )) as Row[];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Игроки</h1>

      {/* Единый контрол для дат: range="YYYY-MM-DD:YYYY-MM-DD" */}
      <FiltersClient
        initial={{
          q: s.q ?? "",
          team: s.team ?? "",
          tournament: s.tournament ?? "",
          role: s.role ?? "",
          range: s.range ?? "",
        }}
        roles={rolesRows}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Игрок</th>
              <th className="py-2 pr-4">Амплуа</th>
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Турнир</th>
              <th className="py-2 pr-4">Раунд</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.user_id}-${i}`} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <Link
                    href={`/players/${r.user_id}${s.range ? `?range=${s.range}` : ""}`}
                    className="hover:underline"
                  >
                    {r.gamertag}
                  </Link>
                </td>
                <td className="py-2 pr-4">{r.role}</td>
                <td className="py-2 pr-4">{r.team_name}</td>
                <td className="py-2 pr-4">{r.tournament_name}</td>
                <td className="py-2 pr-4">{r.round}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={5}>
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
