import { PrismaClient } from "@prisma/client";
import FiltersClient from "@/components/players/FiltersClient";
import React from "react";

const prisma = new PrismaClient();

type Search = {
  q?: string;
  team?: string;
  tournament?: string;
  role?: string;
  from?: string;
  to?: string;
};

type SearchParamsDict = Record<string, string | string[] | undefined>;

type PlayerRow = {
  gamertag: string | null;
  username: string | null;
  team_name: string | null;
  date_formatted: string | null;
  tournament_name: string | null;
  tournament_id: number | null;
  short_name: string | null;
  round: number | null;
};

function val(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

async function getAllRoles(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ role: string }[]>(
    `
    SELECT DISTINCT sp.short_name AS role
    FROM tbl_users_match_stats ums
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    WHERE sp.short_name IS NOT NULL AND sp.short_name <> ''
    ORDER BY sp.short_name
    `
  );
  return rows.map(r => (r.role || "").trim()).filter(Boolean);
}

async function getPlayers(s: Search): Promise<PlayerRow[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (s.q) {
    where.push(`(u.gamertag LIKE ? OR u.username LIKE ?)`);
    params.push(`%${s.q}%`, `%${s.q}%`);
  }
  if (s.team) {
    where.push(`c.team_name LIKE ?`);
    params.push(`%${s.team}%`);
  }
  if (s.tournament) {
    where.push(`t.name LIKE ?`);
    params.push(`%${s.tournament}%`);
  }
  if (s.role) {
    where.push(`sp.short_name = ?`);
    params.push(s.role);
  }
  if (s.from) {
    where.push(`tm.timestamp >= UNIX_TIMESTAMP(STR_TO_DATE(?, '%d.%m.%Y'))`);
    params.push(s.from);
  }
  if (s.to) {
    where.push(
      `tm.timestamp < UNIX_TIMESTAMP(DATE_ADD(STR_TO_DATE(?, '%d.%m.%Y'), INTERVAL 1 DAY))`
    );
    params.push(s.to);
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      u.gamertag,
      u.username,
      c.team_name,
      DATE_FORMAT(FROM_UNIXTIME(tm.timestamp), '%d.%m.%Y %H:%i:%s') AS date_formatted,
      t.name AS tournament_name,
      tm.tournament_id,
      sp.short_name,
      tm.round,
      ums.*
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    INNER JOIN tbl_users u ON ums.user_id = u.id
    INNER JOIN tournament t ON tm.tournament_id = t.id
    INNER JOIN teams c ON ums.team_id = c.id
    ${whereSQL}
    ORDER BY tm.timestamp DESC
    LIMIT 500
  `;

  return (await prisma.$queryRawUnsafe(sql, ...params)) as PlayerRow[];
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp: SearchParamsDict = searchParams ? await searchParams : {};

  const s: Search = {
    q: val(sp.q),
    team: val(sp.team),
    tournament: val(sp.tournament),
    role: val(sp.role),
    from: val(sp.from),
    to: val(sp.to),
  };

  const [roles, rows] = await Promise.all([getAllRoles(), getPlayers(s)]);

  return (
    <div className="p-4 space-y-4">
      <FiltersClient
        initial={{
          q: s.q || "",
          team: s.team || "",
          tournament: s.tournament || "",
          // соберём единое текстовое поле периода для клиента
          range:
            s.from && s.to
              ? `${s.from} — ${s.to}`
              : s.from
              ? `${s.from}`
              : s.to
              ? `— ${s.to}`
              : "",
          role: s.role || "",
        }}
        roles={roles}
      />

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {/* Дату убрали */}
              <th className="p-2 text-left">Игрок</th>
              <th className="p-2 text-left">Амплуа</th>
              <th className="p-2 text-left">Команда</th>
              <th className="p-2 text-left">Турнир</th>
              <th className="p-2 text-left">Раунд</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-center" colSpan={5}>
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={`${r.username ?? r.gamertag ?? "u"}-${i}`}
                  className={i % 2 ? "bg-white" : "bg-gray-50/50"}
                >
                  {/* Дату не отображаем */}
                  <td className="p-2 whitespace-nowrap">
                    {r.gamertag || r.username || "-"}
                  </td>
                  <td className="p-2 whitespace-nowrap">{r.short_name || "-"}</td>
                  <td className="p-2 whitespace-nowrap">{r.team_name || "-"}</td>
                  <td className="p-2 whitespace-nowrap">
                    {r.tournament_name || "-"}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {r.round ?? "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Источник данных: <code>tbl_users_match_stats</code>,{" "}
        <code>tournament_match</code>, <code>skills_positions</code>,{" "}
        <code>tbl_users</code>, <code>tournament</code>, <code>teams</code>.
      </p>
    </div>
  );
}
