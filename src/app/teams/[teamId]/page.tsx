// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import OpponentsHistoryClient from "@/components/teams/OpponentsHistoryClient";

export const dynamic = "force-dynamic";

type Params = { teamId: string };

function mapTournamentToLeagueLabel(name: string | null | undefined): string {
  const n = (name ?? "").toUpperCase();

  if (n.includes("ПРЕМЬЕР") || n.includes(" ПЛ")) return "ПЛ";
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

type OpponentMatchClient = {
  opponentId: number;
  opponentName: string;
  res: "W" | "D" | "L" | "-";
  scored: number;
  missed: number;
  date: string;
  tournament: string;
};

export default async function TeamPage({ params }: { params: Params }) {
  const teamIdNum = Number(params.teamId);

  if (!teamIdNum || Number.isNaN(teamIdNum)) {
    return <div className="p-6">Неверный ID команды.</div>;
  }

  // 1) Основная инфа по команде
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
  const leagueRows = await prisma.$queryRawUnsafe<{
    league_label: string;
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
      CASE
        WHEN UPPER(tournament_name) LIKE '%ПРЕМЬЕР%' OR UPPER(tournament_name) LIKE '% ПЛ%' THEN 'ПЛ'
        WHEN UPPER(tournament_name) LIKE '%ФНЛ%'  THEN 'ФНЛ'
        WHEN UPPER(tournament_name) LIKE '%ПФЛ%'  THEN 'ПФЛ'
        WHEN UPPER(tournament_name) LIKE '%ЛФЛ%'  THEN 'ЛФЛ'
        ELSE 'Прочие'
      END AS league_label,
      COUNT(*) AS cnt
    FROM team_matches
    GROUP BY league_label
    `,
    teamIdNum,
  );

  const totalMatches =
    leagueRows.reduce((s, r) => s + Number(r.cnt || 0), 0) ||
    Number(info.matches || 0);

  const leagues = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие"].map((label) => {
    const row = leagueRows.find((r) => r.league_label === label);
    const cnt = row ? Number(row.cnt) : 0;
    const pct = totalMatches > 0 ? Math.round((cnt / totalMatches) * 100) : 0;
    return { label, cnt, pct };
  });

  // 3) Все официальные матчи против соперников
  const headToHeadRaw = await prisma.$queryRawUnsafe<{
    opponent_id: number;
    opponent_name: string | null;
    scored: number | null;
    missed: number | null;
    win: number | null;
    draw: number | null;
    lose: number | null;
    tm: number | null;
    tournament_name: string | null;
  }[]>(
    `
    SELECT
      opp.team_id       AS opponent_id,
      oppTeam.team_name AS opponent_name,
      main.scored,
      main.missed,
      main.win,
      main.draw,
      main.lose,
      main.tm,
      tr.name           AS tournament_name
    FROM tbl_teams_match_stats main
    JOIN tbl_teams_match_stats opp
      ON opp.match_id = main.match_id
     AND opp.team_id <> main.team_id
    JOIN tournament tr       ON tr.id = main.tournament_id
    JOIN teams     oppTeam   ON oppTeam.id = opp.team_id
    WHERE main.team_id = ?
      AND tr.name LIKE '%сезон%'
    ORDER BY main.tm DESC
    `,
    teamIdNum,
  );

  const opponentMatches: OpponentMatchClient[] = headToHeadRaw.map((r) => {
    const scored = Number(r.scored ?? 0);
    const missed = Number(r.missed ?? 0);

    const res: "W" | "D" | "L" | "-" =
      Number(r.win) === 1
        ? "W"
        : Number(r.draw) === 1
        ? "D"
        : Number(r.lose) === 1
        ? "L"
        : "-";

    const date =
      r.tm && Number.isFinite(r.tm)
        ? new Date(Number(r.tm) * 1000).toISOString().slice(0, 10)
        : "";

    return {
      opponentId: Number(r.opponent_id),
      opponentName: r.opponent_name ?? "Без названия",
      res,
      scored,
      missed,
      date,
      tournament: r.tournament_name ?? "",
    };
  });

  // агрегат по соперникам — для топ-3 удобных/неудобных
  type OpponentAgg = {
    id: number;
    name: string;
    matches: number;
    wins: number;
    draws: number;
    loses: number;
    ourPoints: number;
    oppPoints: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
  };

  const aggMap = new Map<number, OpponentAgg>();

  for (const m of opponentMatches) {
    if (!aggMap.has(m.opponentId)) {
      aggMap.set(m.opponentId, {
        id: m.opponentId,
        name: m.opponentName,
        matches: 0,
        wins: 0,
        draws: 0,
        loses: 0,
        ourPoints: 0,
        oppPoints: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
      });
    }
    const agg = aggMap.get(m.opponentId)!;

    agg.matches += 1;
    agg.goalsFor += m.scored;
    agg.goalsAgainst += m.missed;
    agg.goalDiff = agg.goalsFor - agg.goalsAgainst;

    if (m.res === "W") {
      agg.wins += 1;
      agg.ourPoints += 3;
    } else if (m.res === "D") {
      agg.draws += 1;
      agg.ourPoints += 1;
      agg.oppPoints += 1;
    } else if (m.res === "L") {
      agg.loses += 1;
      agg.oppPoints += 3;
    }
  }

  const allOpponentsAgg = Array.from(aggMap.values());

  const bestOpponents = [...allOpponentsAgg].sort(
    (a, b) =>
      b.ourPoints - a.ourPoints ||
      b.goalDiff - a.goalDiff ||
      b.matches - a.matches ||
      a.name.localeCompare(b.name),
  );

  const worstOpponents = [...allOpponentsAgg].sort(
    (a, b) =>
      b.oppPoints - a.oppPoints ||
      a.goalDiff - b.goalDiff ||
      b.matches - a.matches ||
      a.name.localeCompare(b.name),
  );

  // 4) Форма = 10 последних официальных матчей
  const form = opponentMatches.slice(0, 10);

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

      {/* Вторая строка: слева распределение по лигам, справа форма + head-to-head */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Распределение по лигам + топ-3 соперников */}
        <section className="rounded-xl border border-zinc-200 p-4">
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
                <div className="w-24 text-right text-xs text-zinc-500">
                  {l.cnt} ({l.pct}%)
                </div>
              </div>
            ))}
          </div>

          {/* Самые удобные / неудобные соперники */}
          {allOpponentsAgg.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Удобные */}
              <div>
                <h4 className="font-semibold mb-1">
                  Самые удобные соперники
                </h4>
                <ul className="space-y-1">
                  {bestOpponents.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between gap-2"
                    >
                      <span className="text-emerald-700">{o.name}</span>
                      <span className="text-emerald-700 font-semibold">
                        {o.wins}-{o.draws}-{o.loses}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Неудобные */}
              <div>
                <h4 className="font-semibold mb-1">
                  Самые неудобные соперники
                </h4>
                <ul className="space-y-1">
                  {worstOpponents.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between gap-2"
                    >
                      <span className="text-red-700">{o.name}</span>
                      <span className="text-red-700 font-semibold">
                        {o.wins}-{o.draws}-{o.loses}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Форма команды + история соперников */}
        <section className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-zinc-800">
            Форма (10 последних официальных матчей)
          </h3>

          {form.length === 0 ? (
            <div className="text-xs text-zinc-500">
              Недостаточно данных по официальным матчам.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Линейка W/D/L с подсказками */}
              <div className="flex flex-wrap gap-1">
                {form.map((m, idx) => {
                  let bg = "bg-zinc-100 text-zinc-700";
                  if (m.res === "W") bg = "bg-emerald-100 text-emerald-700";
                  else if (m.res === "L") bg = "bg-red-100 text-red-700";

                  const title = [m.date || "", m.opponentName, m.tournament]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <span
                      key={idx}
                      title={title}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg}`}
                    >
                      {m.res} {m.scored}:{m.missed}
                    </span>
                  );
                })}
              </div>

              {/* Селектор соперника + список очных матчей */}
              <OpponentsHistoryClient matches={opponentMatches} />
            </div>
          )}
        </section>
      </div>

      {/* дальше будем добавлять радар, ключевых игроков и т.п. */}
    </div>
  );
}
