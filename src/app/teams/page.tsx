// src/app/teams/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParamsDict = Record<string, string | string[] | undefined>;

function getVal(d: SearchParamsDict, k: string): string {
  const v = d[k];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function parseRange(range?: string): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range.split(":").map((s) => s?.trim()).filter(Boolean);
  return {
    from: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined,
    to: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined,
  };
}

type TeamRow = {
  team_id: number;
  team_name: string | null;
  last_tournament_name: string | null;
  matches: number;
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: SearchParamsDict;
}) {
  const raw = searchParams ?? {};
  const q = getVal(raw, "q");          // поиск по названию команды
  const tournament = getVal(raw, "tournament"); // фильтр по названию турнира
  const range = getVal(raw, "range");  // YYYY-MM-DD:YYYY-MM-DD

  const { from, to } = parseRange(range);

  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    where.push("c.team_name LIKE ?");
    params.push(`%${q}%`);
  }

  if (tournament) {
    // Подстрока по названию турнира (например, "Премьер-лига", "ФНЛ 24")
    where.push("t.name LIKE ?");
    params.push(`%${tournament}%`);
  }

  if (from) {
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }

  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Группируем по команде: считаем ВСЕ матчи, берём последнюю лигу по таймстемпу
  const rows = await prisma.$queryRawUnsafe<TeamRow[]>(
    `
      WITH base AS (
        SELECT
          ums.team_id,
          c.team_name,
          t.name      AS tournament_name,
          tm.id       AS match_id,
          tm.timestamp AS ts
        FROM tbl_users_match_stats ums
        JOIN teams            c  ON ums.team_id = c.id
        JOIN tournament_match tm ON ums.match_id = tm.id
        JOIN tournament       t  ON tm.tournament_id = t.id
        ${whereSql}
      )
      SELECT
        team_id,
        -- последняя известная команда и турнир по максимальному ts
        SUBSTRING_INDEX(
          MAX(CONCAT(ts, '|', COALESCE(team_name, ''))),
          '|',
          -1
        ) AS team_name,
        SUBSTRING_INDEX(
          MAX(CONCAT(ts, '|', COALESCE(tournament_name, ''))),
          '|',
          -1
        ) AS last_tournament_name,
        COUNT(DISTINCT match_id) AS matches
      FROM base
      GROUP BY team_id
      ORDER BY matches DESC
      LIMIT 200
    `,
    ...params,
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Команды</h1>

      {/* Фильтры (простая форма GET, как на /players по смыслу) */}
      <form className="flex flex-wrap gap-3 items-end mb-4" method="get">
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500 mb-1" htmlFor="q">
            Команда
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="border border-zinc-300 rounded-md px-2 py-1 text-sm"
            placeholder="Название команды"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-zinc-500 mb-1" htmlFor="tournament">
            Турнир
          </label>
          <input
            id="tournament"
            name="tournament"
            defaultValue={tournament}
            className="border border-zinc-300 rounded-md px-2 py-1 text-sm"
            placeholder="Напр. Премьер-лига"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-zinc-500 mb-1" htmlFor="range">
            Период (YYYY-MM-DD:YYYY-MM-DD)
          </label>
          <input
            id="range"
            name="range"
            defaultValue={range}
            className="border border-zinc-300 rounded-md px-2 py-1 text-sm"
            placeholder="2024-01-01:2024-12-31"
          />
        </div>

        <button
          type="submit"
          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm"
        >
          Показать
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Последний турнир</th>
              <th className="py-2 pr-4">Матчи (все)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.team_id}
                className="border-b last:border-b-0 hover:bg-zinc-50"
              >
                <td className="py-2 pr-4">
                  <Link
                    href={`/teams/${r.team_id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {r.team_name || `Team #${r.team_id}`}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {r.last_tournament_name || "—"}
                </td>
                <td className="py-2 pr-4">
                  {r.matches}
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-zinc-500">
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
