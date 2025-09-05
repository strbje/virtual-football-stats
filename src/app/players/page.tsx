// src/app/players/page.tsx
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type PlayerRow = {
  id: number;
  name: string;
  team_name: string;
  tournament_name: string;
  date_formatted: string;
  round: number | null;
};

export default async function Page() {
  const db = await getDb();

  // БД выключена/клиент не сгенерён → возвращаем заглушку
  if (!db) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Игроки</h1>
        <p className="text-sm text-gray-500">
          База данных временно отключена (SKIP_DB=1). Страница работает в режиме заглушки.
        </p>
      </div>
    );
  }

  // Реальный запрос (MySQL), типизован через дженерик
  const rows = await db.$queryRaw<PlayerRow[]>`
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
    ORDER BY tm.timestamp DESC
    LIMIT 50
  `;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Игроки</h1>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="bg-white rounded border p-3">
            <div className="font-semibold">{r.name}</div>
            <div className="text-sm text-gray-600">
              Команда: {r.team_name} • Турнир: {r.tournament_name} • Раунд: {r.round ?? "—"} • {r.date_formatted}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
