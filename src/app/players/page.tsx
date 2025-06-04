export interface Player {
  id: number;
  name: string;
}

export default async function Page() {
  // Подключение к базе или моковые данные
  const rows: Player[] = [
    { id: 1, name: "Игрок 1" },
    { id: 2, name: "Игрок 2" }
  ];

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Список игроков</h1>
      <ul>
        {rows.map((player) => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>
    </div>
  );
}

