// src/app/players/page.tsx
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import PlayersFilter from "@/components/players/PlayersFilter";
import Link from "next/link";

type PlayerRow = {
  id: number;
  name: string;
  team_name: string;
  tournament_name: string;
  date_formatted: string;
  round: number | null;
};

const PER_PAGE = 50;

function toUnix(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

export default async function Page({
  // В Next 15 searchParams — Promise
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  const page = Math.max(1, Number(sp.page ?? 1));
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const team = typeof sp.team === "string" ? sp.team.trim() : "";
  const tournament = typeof sp.tournament === "string" ? sp.tournament.trim() : "";
  const from = toUnix(typeof sp.from === "string" ? sp.from : undefined);
  const to = toUnix(typeof sp.to === "string" ? sp.to : undefined);
  const offset = (page - 1) * PER_PAGE;

  const rows = await prisma.$queryRaw<PlayerRow[]>`
    SELECT 
      u.id AS id,
      u.gamertag AS name,
      c.team_name,
      DATE_FORMAT(FROM_UNIXTIME(tm.timestamp), '%d.%m.%Y %H:%i:%s') AS date_formatted,
      t.name AS tournament_name,
      tm.round
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    INNER JOIN tbl_users u ON ums.user_id = u.id
    INNER JOIN tournament t ON tm.tournament_id = t.id
    INNER JOIN teams c ON ums.team_id = c.id
    WHERE 1=1
      ${q ? Prisma.sql`AND u.gamertag LIKE ${'%' + q + '%'}` : Prisma.empty}
      ${team ? Prisma.sql`AND c.team_name LIKE ${'%' + team + '%'}` : Prisma.empty}
      ${tournament ? Prisma.sql`AND t.name LIKE ${'%' + tournament + '%'}` : Prisma.empty}
      ${from ? Prisma.sql`AND tm.timestamp >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND tm.timestamp < ${to + 86400}` : Prisma.empty}
    ORDER BY tm.timestamp DESC
    LIMIT ${PER_PAGE} OFFSET ${offset}
  `;

  const hasNext = rows.length === PER_PAGE;
  const hasPrev = page > 1;

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (team) baseParams.set("team", team);
  if (tournament) baseParams.set("tournament", tournament);
  if (typeof sp.from === "string") baseParams.set("from", sp.from);
  if (typeof sp.to === "string") baseParams.set("to", sp.to);

  const prevUrl = (() => {
    const p = new URLSearchParams(baseParams);
    p.set("page", String(page - 1));
    return `/players?${p.toString()}`;
  })();

  const nextUrl = (() => {
    const p = new URLSearchParams(baseParams);
    p.set("page", String(page + 1));
    return `/players?${p.toString()}`;
  })();

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">Игроки</h1>

      <PlayersFilter />

      <ul className="space-y-2 mb-4">
        {rows.map((player) => (
          <li key={player.id} className="border-b pb-2">
            <strong>{player.name}</strong> — {player.team_name} — {player.tournament_name} — {player.date_formatted}
            {typeof player.round === "number" && (
              <span className="ml-2 text-sm text-gray-500">Раунд: {player.round}</span>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="text-gray-500">Ничего не найдено</li>}
      </ul>

      <div className="flex gap-2">
        {hasPrev && <Link href={prevUrl} className="border rounded px-3 py-1">← Назад</Link>}
        {hasNext && <Link href={nextUrl} className="border rounded px-3 py-1">Вперёд →</Link>}
        <span className="text-sm text-gray-500 ml-auto">Стр. {page}</span>
      </div>
    </div>
  );
}

