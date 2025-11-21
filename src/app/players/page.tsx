// src/app/players/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Row = {
  user_id: number;
  gamertag: string | null;
  username: string | null;
  team_name: string | null;
  matches: number;
};

export default async function Page() {
  // Вытаскиваем уникальных игроков + суммарное число матчей
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT
      u.id AS user_id,
      u.gamertag,
      u.username,
      c.team_name,
      COUNT(DISTINCT ums.match_id) AS matches
    FROM tbl_users_match_stats ums
    JOIN tbl_users u ON ums.user_id = u.id
    LEFT JOIN teams c ON ums.team_id = c.id
    GROUP BY ums.user_id
    ORDER BY matches DESC
    LIMIT 300;
  `);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Игроки</h1>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Игрок</th>
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Матчи</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <Link
                    href={`/players/${r.user_id}`}
                    className="hover:underline"
                  >
                    {r.gamertag || r.username || `User #${r.user_id}`}
                  </Link>
                </td>

                <td className="py-2 pr-4">
                  {r.team_name || "—"}
                </td>

                <td className="py-2 pr-4 font-medium">
                  {r.matches}
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={3}>
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
