// src/app/teams/[teamId]/page.tsx

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

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
    const cnt = row ? Number(r.cnt) : 0;
    const pct = totalMatches > 0 ? Math.round((cnt / totalMatches) * 100) : 0;
    return { label, cnt, pct };
  });

  // 3) Форма команды — последние 10 официальных матчей (только турниры с "сезон")
  type FormRow = {
    match_id: number;
    scored: number | null;
    missed: number | null;
    win: number | null;
    draw: number | null;
    lose: number | null;
    tm: number | null;
    opponent_name: string | null;
  };

  const formRows = await prisma.$queryRawUnsafe<FormRow[]>(
    `
    WITH base AS (
      SELECT
        tms.match_id,
        tms.scored,
        tms.missed,
        tms.win,
        tms.draw,
        tms.lose,
        tms.tm,
        opp.team_name AS opponent_name
      FROM tbl_teams_match_stats tms
      JOIN tournament tr
        ON tr.id = tms.tournament_id
      JOIN tbl_teams_match_stats tms_opp
        ON tms_opp.match_id = tms.match_id
       AND tms_opp.team_id <> tms.team_id
      JOIN teams opp
        ON opp.id = tms_opp.team_id
      WHERE tms.team_id = ?
        AND tr.name LIKE '%сезон%'
    )
    SELECT *
    FROM base
    ORDER BY tm DESC
    LIMIT 10
    `,
    teamIdNum,
  );

  const form = formRows.map((r) => {
    const scored = Number(r.scored ?? 0);
    const missed = Number(r.missed ?? 0);

    let res: "W" | "D" | "L" | "-" = "-";
    if (Number(r.win) === 1) res = "W";
    else if (Number(r.draw) === 1) res = "D";
    else if (Number(r.lose) === 1) res = "L";

    const date =
      r.tm && Number.isFinite(r.tm)
        ? new Date(Number(r.tm) * 1000).toISOString().slice(0, 10)
        : "";

    return {
      res,
      scored,
      missed,
      date,
      opponent: r.opponent_name ?? "Неизвестный соперник",
    };
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

      {/* Вторая строка: слева распределение по лигам, справа форма */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Распределение по лигам */}
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
        </section>

        {/* Форма команды */}
        <section className="rounded-xl border border-zinc-200 p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">
            Форма (10 последних матчей)
          </h3>

          {form.length === 0 ? (
            <div className="text-xs text-zinc-500">
              Недостаточно данных по официальным матчам.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Линейка W/D/L */}
              <div className="flex flex-wrap gap-1">
                {form.map((m, idx) => {
                  let bg = "bg-zinc-100 text-zinc-700";
                  if (m.res === "W") bg = "bg-emerald-100 text-emerald-700";
                  else if (m.res === "L") bg = "bg-red-100 text-red-700";

                  return (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg}`}
                      title={`Соперник: ${m.opponent}`}
                    >
                      {m.res} {m.scored}:{m.missed}
                    </span>
                  );
                })}
              </div>

              {/* Список матчей (без турниров) */}
              <div className="space-y-1 text-xs text-zinc-500">
                {form.map((m, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span>{m.date || "—"}</span>
                    <span
                      className="font-medium text-zinc-700"
                      title={`Соперник: ${m.opponent}`}
                    >
                      {m.scored}:{m.missed} ({m.res})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* дальше будем добавлять радар, ключевых игроков и т.п. */}
    </div>
  );
}
