// src/app/players/[userId]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerPeriodPicker from "./PeriodPickerClient"; // клиентский календарь-диапазон
import { parseRange } from "@/app/players/_utils/parseRange"; // уже есть у нас

type PageProps = {
  params: { userId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

type Row = {
  date_formatted: string;
  tournament_name: string;
  round: number | null;
  team_name: string;
  short_name: string | null; // амплуа
  goals?: number | null;
  assists?: number | null;
  // … добавь поля из ums, которые реально есть
};

export default async function PlayerPage({ params, searchParams }: PageProps) {
  const userId = Number(params.userId);
  if (!Number.isFinite(userId)) notFound();

  const sp = searchParams ?? {};
  const { from, to } = parseRange(typeof sp.range === "string" ? sp.range : "");

  // Базовая инфа (ник/команда/амплуа по последнему матчу)
  const header = await prisma.$queryRawUnsafe<{
    gamertag: string;
    team_name: string | null;
    role: string | null;
  }[]>(`
    SELECT u.gamertag,
           (SELECT c.team_name FROM tbl_users_match_stats ums
             INNER JOIN teams c ON ums.team_id = c.id
             WHERE ums.user_id = u.id
             ORDER BY ums.match_id DESC LIMIT 1) AS team_name,
           (SELECT sp.short_name FROM tbl_users_match_stats ums
             INNER JOIN skills_positions sp ON ums.skill_id = sp.id
             WHERE ums.user_id = u.id
             ORDER BY ums.match_id DESC LIMIT 1) AS role
    FROM tbl_users u
    WHERE u.id = ?
    LIMIT 1
  `, userId);

  if (!header.length) notFound();
  const h = header[0];

  // Список матчей за период
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT
      DATE_FORMAT(FROM_UNIXTIME(tm.timestamp), '%d.%m.%Y %H:%i:%s') AS date_formatted,
      t.name AS tournament_name,
      tm.round,
      c.team_name,
      sp.short_name,
      ums.goals,
      ums.assists
      -- добавь ещё поля ums.* которые нужны в таблицу
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN tournament t ON tm.tournament_id = t.id
    INNER JOIN teams c ON ums.team_id = c.id
    LEFT JOIN skills_positions sp ON ums.skill_id = sp.id
    WHERE ums.user_id = ?
      ${from ? "AND tm.timestamp >= UNIX_TIMESTAMP(?)" : ""}
      ${to   ? "AND tm.timestamp <= UNIX_TIMESTAMP(?)"   : ""}
    ORDER BY tm.timestamp DESC
    LIMIT 200
  `, ...(from && to ? [userId, from, to] : from ? [userId, from] : to ? [userId, to] : [userId]));

  // Агрегаты по периоду (пример — матчи/голы/передачи)
  const agg = await prisma.$queryRawUnsafe<{
    matches: number;
    goals: number | null;
    assists: number | null;
    // добавить SUM/AVG по тем полям, что есть
  }[]>(`
    SELECT
      COUNT(*) AS matches,
      SUM(ums.goals)   AS goals,
      SUM(ums.assists) AS assists
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    WHERE ums.user_id = ?
      ${from ? "AND tm.timestamp >= UNIX_TIMESTAMP(?)" : ""}
      ${to   ? "AND tm.timestamp <= UNIX_TIMESTAMP(?)"   : ""}
  `, ...(from && to ? [userId, from, to] : from ? [userId, from] : to ? [userId, to] : [userId]));

  const a = agg[0] ?? { matches: 0, goals: 0, assists: 0 };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{h.gamertag}</h1>
          <div className="text-sm text-muted-foreground">
            {h.team_name ?? "—"} · {h.role ?? "—"}
          </div>
        </div>
        <PlayerPeriodPicker initialRange={typeof sp.range === "string" ? sp.range : ""} />
      </div>

      {/* KPI */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Матчи" value={a.matches} />
        <Kpi label="Голы" value={a.goals ?? 0} />
        <Kpi label="ГП" value={a.assists ?? 0} />
        {/* сюда легко добавить ещё KPI, когда подтвердим поля */}
      </div>

      {/* Матчи */}
      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Дата</th>
              <th className="px-4 py-2 text-left">Турнир</th>
              <th className="px-4 py-2 text-left">Раунд</th>
              <th className="px-4 py-2 text-left">Команда</th>
              <th className="px-4 py-2 text-left">Амплуа</th>
              <th className="px-4 py-2 text-left">Г</th>
              <th className="px-4 py-2 text-left">П</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2">{r.date_formatted}</td>
                <td className="px-4 py-2">{r.tournament_name}</td>
                <td className="px-4 py-2">{r.round ?? "—"}</td>
                <td className="px-4 py-2">{r.team_name}</td>
                <td className="px-4 py-2">{r.short_name ?? "—"}</td>
                <td className="px-4 py-2">{r.goals ?? 0}</td>
                <td className="px-4 py-2">{r.assists ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <Link href="/players" className="text-primary hover:underline">← Назад к списку</Link>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
