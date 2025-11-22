// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { teamId: string };

type LeagueLabel = "ПЛ" | "ФНЛ" | "ПФЛ" | "ЛФЛ" | "Прочие";

function mapTournamentToLeagueLabel(
  name: string | null | undefined,
): LeagueLabel {
  const n = (name ?? "").toUpperCase();

  // Премьер-лига
  if (n.includes("ПРЕМЬЕР")) return "ПЛ";

  // ФНЛ / ПФЛ / ЛФЛ
  if (n.includes("ФНЛ")) return "ФНЛ";
  if (n.includes("ПФЛ")) return "ПФЛ";
  if (n.includes("ЛФЛ")) return "ЛФЛ";

  return "Прочие";
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const idNum = Number(params.teamId);
  const fallbackTitle = `Команда #${params.teamId} — Virtual Football Stats`;

  if (!idNum || Number.isNaN(idNum)) {
    return { title: fallbackTitle };
  }

  try {
    const rows = await prisma.$queryRawUnsafe<{ team_name: string }[]>(
      `
        SELECT team_name
        FROM teams
        WHERE id = ?
        LIMIT 1
      `,
      idNum,
    );

    const name = rows[0]?.team_name;
    if (!name) return { title: fallbackTitle };

    return { title: `${name} — Virtual Football Stats` };
  } catch {
    return { title: fallbackTitle };
  }
}

export default async function TeamPage({ params }: { params: Params }) {
  const teamIdNum = Number(params.teamId);

  if (!teamIdNum || Number.isNaN(teamIdNum)) {
    return <div className="p-6">Неверный ID команды.</div>;
  }

  // 1) Основная инфа: название команды, всего матчей, последний турнир
  const infoRows = await prisma.$queryRawUnsafe<{
    team_id: number;
    team_name: string;
    matches: number;
    last_tournament: string | null;
  }[]>(
    `
    WITH team_matches AS (
      SELECT
        c.id          AS team_id,
        c.team_name   AS team_name,
        ums.match_id  AS match_id,
        tm.timestamp  AS ts,
        tr.name       AS tournament_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament tr       ON tm.tournament_id = tr.id
      JOIN teams c             ON ums.team_id = c.id
      WHERE c.id = ?
    ),
    agg AS (
      SELECT
        team_id,
        team_name,
        COUNT(DISTINCT match_id) AS matches,
        MAX(ts)                  AS last_ts
      FROM team_matches
      GROUP BY team_id, team_name
    ),
    last_match AS (
      SELECT
        tm.team_id,
        tm.tournament_name
      FROM team_matches tm
      JOIN agg a
        ON a.team_id = tm.team_id
       AND a.last_ts = tm.ts
      LIMIT 1
    )
    SELECT
      a.team_id,
      a.team_name,
      a.matches,
      lm.tournament_name AS last_tournament
    FROM agg a
    LEFT JOIN last_match lm ON lm.team_id = a.team_id
    LIMIT 1
    `,
    teamIdNum,
  );

  const info = infoRows[0];

  if (!info) {
    return <div className="p-6">Команда не найдена.</div>;
  }

  const currentLeagueShort = mapTournamentToLeagueLabel(info.last_tournament);

  // 2) Распределение по лигам
  // Сначала собираем турниры и матчи по ним
  const leagueSrcRows = await prisma.$queryRawUnsafe<{
    tournament_name: string | null;
    cnt: number;
  }[]>(
    `
    WITH team_matches AS (
      SELECT DISTINCT
        ums.match_id  AS match_id,
        tr.name       AS tournament_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament tr       ON tm.tournament_id = tr.id
      WHERE ums.team_id = ?
    )
    SELECT
      tournament_name,
      COUNT(*) AS cnt
    FROM team_matches
    GROUP BY tournament_name
    `,
    teamIdNum,
  );

  // Агрегируем по "коротким" лигам через тот же хелпер
  const buckets: Record<LeagueLabel, number> = {
    ПЛ: 0,
    ФНЛ: 0,
    ПФЛ: 0,
    ЛФЛ: 0,
    Прочие: 0,
  };

  for (const row of leagueSrcRows) {
    const label = mapTournamentToLeagueLabel(row.tournament_name);
    const cnt = Number(row.cnt || 0);
    buckets[label] += cnt;
  }

  const totalMatchesFromBuckets = (Object.values(buckets).reduce(
    (s, v) => s + v,
    0,
  ) || 0) as number;

  const totalMatches =
    totalMatchesFromBuckets > 0
      ? totalMatchesFromBuckets
      : Number(info.matches || 0);

  const leagueOrder: LeagueLabel[] = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие"];

  const leagues = leagueOrder.map((label) => {
    const cnt = buckets[label] || 0;
    const pct =
      totalMatches > 0 ? Math.round((cnt / totalMatches) * 100) : 0;
    return { label, cnt, pct };
  });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{info.team_name}</h1>
      </div>

      {/* Верхние плитки */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Матчи</div>
          <div className="text-2xl font-semibold">{info.matches}</div>
          <div className="text-[11px] text-zinc-400 mt-2">
            *учтены только матчи с записью статистики
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Актуальная лига</div>
          <div className="text-2xl font-semibold">{currentLeagueShort}</div>
          {info.last_tournament && (
            <div className="text-[11px] text-zinc-400 mt-2">
              по последнему матчу: {info.last_tournament}
            </div>
          )}
        </div>
      </div>

      {/* Распределение по лигам */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-800 mb-3">
          Распределение матчей по лигам
        </h3>
        <div className="space-y-2">
          {leagues.map((l) => (
            <div key={l.label} className="flex items-center gap-2 text-sm">
              <div className="w-14">{l.label}</div>
              <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${l.pct}%` }}
                />
              </div>
              <div className="w-20 text-right text-xs text-zinc-500">
                {l.cnt} ({l.pct}%)
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* дальше добавим форму, радар, ключевых игроков и т.д. */}
    </div>
  );
}
