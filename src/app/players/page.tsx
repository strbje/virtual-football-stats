export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
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
  // дата в формате YYYY-MM-DD -> unix (начало дня / конец дня)
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const team = typeof searchParams.team === "string" ? searchParams.team.trim() : "";
  const tournament = typeof searchParams.tournament === "string" ? searchParams.tournament.trim() : "";
  const from = toUnix(typeof searchParams.from === "string" ? searchParams.from : undefined);
  const to = toUnix(typeof searchParams.to === "string" ? searchParams.to : undefined);
  const offset = (page - 1) * PER_PAGE;

  // Конструируем WHERE динамически (безопасно — через шаблон $queryRaw)
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
      ${q ? prisma.sql`AND u.gamertag LIKE ${'%' + q + '%'}` : prisma.empty}
      ${team ? prisma.sql`AND c.team_name LIKE ${'%' + team + '%'}` : prisma.empty}
      ${tournament ? prisma.sql`AND t.name LIKE ${'%' + tournament + '%'}` : prisma.empty}
      ${from ? prisma.sql`AND tm.timestamp >= ${from}` : prisma.empty}
      ${to ? prisma.sql`AND tm.timestamp < ${to + 86400}` : prisma.empty}
    ORDER BY tm.timestamp DESC
    LIMIT ${PER_PAGE} OFFSET ${offset}
  `;

  // простая навигация по страницам
  const hasNext = rows.length === PER_PAGE;
  const hasPrev = page > 1;

  // Соберём строку с текущими фильтрами, чтобы не терять их в пагинации
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (team) baseParams.set("team", team);
  if (tournament) baseParams.set("tournament", tournament);
  if (typeof searchParams.from === "string") baseParams.set("from", searchParams.from);
  if (typeof searchParams.to === "string") baseParams.set("to", searchParams.to);

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
      <h1 className="text-2xl font-bold mb-2">Последние игроки (по матчам)</h1>

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
        {hasPrev && (
          <Link href={prevUrl} className="border rounded px-3 py-1">← Назад</Link>
        )}
        {hasNext && (
          <Link href={nextUrl} className="border rounded px-3 py-1">Вперёд →</Link>
        )}
        <span className="text-sm text-gray-500 ml-auto">Стр. {page}</span>
      </div>
    </div>
  );
}
