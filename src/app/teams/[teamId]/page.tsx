// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

type Params = { teamId: string };

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

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const teamIdNum = Number(params.teamId) || 0;
  let title = `Команда #${params.teamId} — Virtual Football Stats`;

  if (teamIdNum) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ team_name: string }[]>(
        `
        SELECT team_name
        FROM teams
        WHERE id = ${teamIdNum}
        LIMIT 1
      `,
      );
      if (rows[0]?.team_name) {
        title = `${rows[0].team_name} — Virtual Football Stats`;
      }
    } catch {
      // игнорируем, оставляем дефолтный тайтл
    }
  }

  return { title };
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: { range?: string };
}) {
  const teamIdNum = Number(params.teamId);
  if (!teamIdNum || Number.isNaN(teamIdNum)) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold">Некорректный ID команды</h1>
        <Link href="/teams" className="text-blue-600 mt-3 inline-block">
          ← Ко всем командам
        </Link>
      </div>
    );
  }

  const range = searchParams?.range ?? "";
  const { from, to } = parseRange(range);

  const where: string[] = ["ums.team_id = ?"];
  const paramsSql: any[] = [teamIdNum];

  if (from) {
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    paramsSql.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    paramsSql.push(`${to} 23:59:59`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  // summary: матчи + актуальное название команды
  const [summary] = await prisma.$queryRawUnsafe<
    { matches: number; team_name: string | null }[]
  >(
    `
      SELECT
        CAST(COUNT(DISTINCT ums.match_id) AS UNSIGNED) AS matches,
        MAX(c.team_name) AS team_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN teams c            ON ums.team_id = c.id
      ${whereSql}
    `,
    ...paramsSql,
  );

  const teamName = summary?.team_name ?? `Команда #${teamIdNum}`;
  const matches = Number(summary?.matches ?? 0);

  // разбиение по турнирам (для первой версии вместо полноценного радара/стиля)
  const leagues = await prisma.$queryRawUnsafe<
    { tournament_name: string; matches: number }[]
  >(
    `
      SELECT
        t.name AS tournament_name,
        CAST(COUNT(DISTINCT ums.match_id) AS UNSIGNED) AS matches
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament t       ON tm.tournament_id = t.id
      ${whereSql}
      GROUP BY t.id, t.name
      ORDER BY matches DESC
      LIMIT 10
    `,
    ...paramsSql,
  );

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{teamName}</h1>
        <div className="text-sm text-zinc-500 mt-1">
          Матчи: {matches}
          {range ? ` (период: ${range})` : " (все доступные)"}
        </div>
        <Link href="/teams" className="text-blue-600 mt-3 inline-block">
          ← Ко всем командам
        </Link>
      </div>

      {/* Турниры / лиги */}
      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold mb-3">Турниры</h2>
        {leagues.length === 0 ? (
          <div className="text-sm text-zinc-500">
            Пока нет данных по матчам этой команды в выбранном периоде.
          </div>
        ) : (
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-4 text-left">Турнир</th>
                <th className="py-1 text-right">Матчи</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map((l, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="py-1 pr-4">{l.tournament_name}</td>
                  <td className="py-1 text-right">{l.matches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Заглушка под будущие блоки */}
      <section className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        Здесь позже появятся:
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Форма команды по последним 10 матчам (WLWD…);</li>
          <li>Радар стиля игры (голы, удары, пасов на удар, навесы, защитные действия, % воздуха и т.д.);</li>
          <li>Ключевые игроки (по доле пасов, xG+голы, защитным действиям);</li>
          <li>Полная командная статистика с разбивкой по сезонам.</li>
        </ul>
      </section>
    </div>
  );
}
