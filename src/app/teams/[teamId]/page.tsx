// src/app/teams/[teamId]/page.tsx

import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { teamId: string };

export async function generateMetadata({ params }: { params: Params }) {
  const id = Number(params.teamId) || 0;
  let title = `Команда #${id} — Virtual Football Stats`;

  if (id > 0) {
    try {
      const team = await prisma.team.findUnique({
        where: { id },
        select: { team_name: true },
      });
      if (team?.team_name) {
        title = `${team.team_name} — Virtual Football Stats`;
      }
    } catch {
      // игнорируем, оставляем дефолтный title
    }
  }

  return { title };
}

type TournamentRow = {
  tournament_name: string;
  matches: number;
};

async function getTeamData(teamId: number) {
  const tournaments = await prisma.$queryRawUnsafe<TournamentRow[]>(
    `
      SELECT
        t.name AS tournament_name,
        COUNT(*) AS matches
      FROM tournament_match tm
      JOIN tournament t ON t.id = tm.tournament_id
      JOIN tbl_users_match_stats ums ON ums.match_id = tm.id
      WHERE ums.team_id = ?
      GROUP BY t.id
      ORDER BY matches DESC
    `,
    teamId,
  );

  const totalMatches = tournaments.reduce(
    (sum, r) => sum + Number(r.matches ?? 0),
    0,
  );

  return { tournaments, totalMatches };
}

export default async function TeamPage({ params }: { params: Params }) {
  const teamId = Number(params.teamId) || 0;
  if (!teamId) {
    return (
      <div className="p-6">
        Неверный идентификатор команды.
        <div className="mt-2">
          <Link href="/teams" className="text-blue-600">
            ← Ко всем командам
          </Link>
        </div>
      </div>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { team_name: true },
  });

  const name = team?.team_name ?? `Команда #${teamId}`;
  const { tournaments, totalMatches } = await getTeamData(teamId);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{name}</h1>
        <div className="text-sm text-zinc-500 mt-1">
          Матчи: {totalMatches} (все доступные)
        </div>
        <Link href="/teams" className="text-blue-600 mt-3 inline-block">
          ← Ко всем командам
        </Link>
      </div>

      {/* Таблица турниров */}
      <section className="rounded-xl border border-zinc-200 overflow-hidden">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold">
          Турниры
        </div>
        <div className="text-sm divide-y divide-zinc-100">
          <div className="flex px-4 py-2 font-medium text-zinc-500">
            <div className="flex-1">Турнир</div>
            <div className="w-24 text-right">Матчи</div>
          </div>
          {tournaments.map((t, idx) => (
            <div key={idx} className="flex px-4 py-2">
              <div className="flex-1">{t.tournament_name}</div>
              <div className="w-24 text-right">{t.matches}</div>
            </div>
          ))}
          {tournaments.length === 0 && (
            <div className="px-4 py-3 text-zinc-500">
              Нет данных по матчам этой команды.
            </div>
          )}
        </div>
      </section>

      {/* Заглушка под будущие блоки */}
      <section className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
        <p className="mb-2">Здесь позже появятся:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Форма команды по последним 10 матчам (W/L/D…)</li>
          <li>
            Радар стиля игры (голы, удары, пасов на удар, навесы, защитные
            действия, % воздуха и т.д.).
          </li>
          <li>
            Ключевые игроки (по доле пасов, xG+голы, защитным действиям).
          </li>
          <li>Полная командная статистика с разбивкой по сезонам и лигам.</li>
        </ul>
      </section>
    </div>
  );
}
