import { getConnection } from "@/lib/db";

export default async function PlayersPage() {
  //const connection = await getConnection();

  // Выполним простой тестовый запрос к таблице игроков
  //const [rows] = await connection.execute("SELECT id, name FROM players LIMIT 10");
  //await connection.end();

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Список игроков</h1>
      <ul>
        {(rows as any[]).map((player) => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>
    </div>
  );
}
