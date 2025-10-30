// src/app/players/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

// --- helpers ---
function getParam(sp: SearchParams, key: string): string {
  const v = sp[key];
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

function buildQS(qs: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => {
    if (v && v.length) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ВАЖНО: в Next 15 props должны соответствовать PageProps — используем Promise-тип
type Props = {
  searchParams?: Promise<SearchParams>;
};

export default async function PlayersPage({ searchParams }: Props) {
  const sp = await (searchParams ?? Promise.resolve({} as SearchParams));

  const q = getParam(sp, "q").trim();
  const range = getParam(sp, "range").trim();
  const { from, to } = parseRange(range);

  const page = Math.max(1, parseInt(getParam(sp, "p") || "1", 10) || 1);
  const size = Math.min(100, Math.max(5, parseInt(getParam(sp, "s") || "20", 10) || 20));
  const offset = (page - 1) * size;

  // where-условия
  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    where.push("(u.gamertag LIKE ? OR u.username LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  // Фильтр по диапазону дат накладываем на матч (tm.timestamp)
  if (from) {
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql =
    where.length > 0
      ? `WHERE ${where.join(" AND ")}`
      : "";

  // Подсчёт игроков в выборке (только те, кто сыграл >=1 матча по фильтрам)
  const totalRow = (
    await prisma.$queryRawUnsafe<{ total: number }[]>(
      `
      SELECT COUNT(*) AS total FROM (
        SELECT u.id
        FROM tbl_users u
        LEFT JOIN tbl_users_match_stats ums ON ums.user_id = u.id
        LEFT JOIN tournament_match tm ON tm.id = ums.match_id
        ${whereSql}
        GROUP BY u.id
        HAVING COUNT(ums.id) > 0
      ) t
      `,
      ...params
    )
  )[0];

  const total = totalRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));

  // Данные списка
  const rows = await prisma.$queryRawUnsafe<
    { id: number; gamertag: string; username: string; matches: number }[]
  >(
    `
    SELECT 
      u.id,
      u.gamertag,
      u.username,
      COUNT(ums.id) AS matches
    FROM tbl_users u
    LEFT JOIN tbl_users_match_stats ums ON ums.user_id = u.id
    LEFT JOIN tournament_match tm ON tm.id = ums.match_id
    ${whereSql}
    GROUP BY u.id, u.gamertag, u.username
    HAVING COUNT(ums.id) > 0
    ORDER BY matches DESC, u.gamertag ASC
    LIMIT ? OFFSET ?
    `,
    ...params,
    size,
    offset
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Игроки</h1>
          <p className="text-sm text-gray-600">
            Диапазон: {from ? from : "—"} — {to ? to : "—"} · Найдено игроков: {total}
          </p>
        </div>

        {/* Форма фильтров */}
        <form className="flex items-end gap-3" action="/players" method="get">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Поиск (ник / username)</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="gamertag или username"
              className="border rounded-md px-3 py-1 h-9"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Диапазон (YYYY-MM-DD:YYYY-MM-DD)</label>
            <input
              name="range"
              defaultValue={range}
              placeholder="2025-09-01:2025-10-31"
              className="border rounded-md px-3 py-1 h-9 w-[240px]"
            />
          </div>
          <button
            type="submit"
            className="h-9 px-4 rounded-md bg-black text-white hover:opacity-90"
          >
            Фильтровать
          </button>
        </form>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto">
        <table className="min-w-[720px] border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Игрок</th>
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Матчей в выборке</th>
              <th className="py-2 pr-4">Открыть</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{r.gamertag || `#${r.id}`}</td>
                <td className="py-2 pr-4 text-gray-700">@{r.username}</td>
                <td className="py-2 pr-4">{r.matches}</td>
                <td className="py-2 pr-4">
                  <Link
                    className="text-blue-600 hover:underline"
                    href={`/players/${r.id}${range ? `?range=${encodeURIComponent(range)}` : ""}`}
                  >
                    профиль →
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={4}>
                  По текущим фильтрам нет игроков.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => {
            const n = i + 1;
            const link = buildQS({
              q,
              range,
              p: String(n),
              s: String(size),
            });
            const isActive = n === page;
            return (
              <Link
                key={n}
                href={`/players${link}`}
                className={`px-3 py-1 rounded-md border ${
                  isActive ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                }`}
              >
                {n}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
