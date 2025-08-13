cat > src/app/players/page.tsx <<'TS'
import { prisma } from '@/lib/db';

type PlayerRow = {
  id: number;
  name: string;
  team_name: string;
  tournament_name: string;
  date_formatted: string;
  round: number | null;
};

export default async function Page() {
  console.log('✅ Страница /players загружена');

  const rows = await prisma.$queryRaw<PlayerRow[]>`
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

  if (!Array.isArray(rows)) {
    throw new Error('Unexpected DB result shape');
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Последние игроки (по матчам)</h1>
      <ul className="space-y-2">
        {rows.map((player) => (
          <li key={player.id} className="border-b pb-2">
            <strong>{player.name}</strong> — {player.team_name} — {player.tournament_name} — {player.date_formatted}
            {typeof player.round === 'number' && (
              <span className="ml-2 text-sm text-gray-500">Раунд: {player.round}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
TS
