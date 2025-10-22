// src/app/players/page.tsx
import { getDb } from "@/lib/db";
import FiltersClient from "@/components/players/FiltersClient";

// Если у тебя строгий кеш, можно форсить динамику:
// export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

type Row = {
  gamertag: string;
  team_name: string | null;
  tournament_name: string | null;
  match_time: Date | string | null;
  round: number | null;
  role?: string | null;
};

function toStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function fmtDate(d: Date | string | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  // dd.mm.yyyy hh:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const prisma = await getDb();

  const q = toStr(searchParams.q);
  const team = toStr(searchParams.team);
  const tournament = toStr(searchParams.tournament);
  const from = toStr(searchParams.from); // YYYY-MM-DD
  const to = toStr(searchParams.to); // YYYY-MM-DD
  const role = toStr(searchParams.role);

  // Когда БД отключена (SKIP_DB=1, клиент не сгенерен и т.п.) — мягкая заглушка.
  if (!prisma) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Игроки</h1>
        <FiltersClient
          initial={{ q, team, tournament, from, to, role }}
          roles={[]}
        />
        <p className="text-sm opacity-70">
          База данных недоступна (SKIP_DB=1 или не сгенерирован PrismaClient).
        </p>
      </main>
    );
  }

  // 1) Список амплуа для выпадашки
  let roles: string[] = [];
  try {
    const rolesRows = await prisma.$queryRaw<{ role: string }[]>`
      SELECT DISTINCT role
      FROM users
      WHERE role IS NOT NULL AND role <> ''
      ORDER BY role
    `;
    roles = rolesRows.map((r) => r.role);
  } catch {
    roles = [];
  }

  // 2) Данные игроков
  // ВНИМАНИЕ: ниже — ориентировочный SQL по тем именам, что мелькали в логах/скринах.
  // Если у тебя таблицы/поля называются иначе — поправь SELECT/FROM/JOIN/WHERE.
  //
  // Идея: собираем WHERE динамически и передаём параметры безопасно.
  const where: string[] = [];
  const params: unknown[] = [];

  if (q) {
    where.push(`u.gamertag LIKE ?`);
    params.push(`%${q}%`);
  }
  if (team) {
    where.push(`c.team_name LIKE ?`);
    params.push(`%${team}%`);
  }
  if (tournament) {
    where.push(`t.name LIKE ?`);
    params.push(`%${tournament}%`);
  }
  if (from) {
    // from — включительно, начало дня
    where.push(`tm.timestamp >= ?`);
    params.push(new Date(`${from}T00:00:00Z`));
  }
  if (to) {
    // to — включительно, конец дня
    where.push(`tm.timestamp <= ?`);
    params.push(new Date(`${to}T23:59:59.999Z`));
  }
  if (role) {
    where.push(`u.role = ?`);
    params.push(role);
  }

  // Базовый запрос. Подстрой под свою схему, если нужно.
  // u — users (gamertag, role)
  // ums — user_match_stats (user_id, team_id, match_id, ... )
  // c — teams (team_name)
  // t — tournaments (name)
  // tm — tournament_matches (timestamp, round, tournament_id, id)
  const baseSql = `
    SELECT
      u.gamertag                AS gamertag,
      c.team_name               AS team_name,
      t.name                    AS tournament_name,
      tm.timestamp              AS match_time,
      tm.round                  AS round,
      u.role                    AS role
    FROM user_match_stats ums
    INNER JOIN users u ON u.id = ums.user_id
    LEFT  JOIN teams c ON c.id = ums.team_id
    LEFT  JOIN tournament_matches tm ON tm.id = ums.match_id
    LEFT  JOIN tournaments t ON t.id = tm.tournament_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY tm.timestamp DESC NULLS LAST, u.gamertag ASC
    LIMIT 500
  ` as const;

  let rows: Row[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    rows = (await prisma.$queryRawUnsafe(baseSql, ...params)) as Row[];
  } catch (e) {
    // Если возникла ошибка выполнения SQL — показываем мягкое сообщение
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Игроки</h1>
        <FiltersClient initial={{ q, team, tournament, from, to, role }} roles={roles} />
        <p className="mt-4 text-red-600">
          Не удалось загрузить данные игроков. Проверь SQL-запрос в
          <code className="px-1">/app/players/page.tsx</code> и имена таблиц/полей.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Игроки</h1>

      <FiltersClient initial={{ q, team, tournament, from, to, role }} roles={roles} />

      <section className="space-y-3">
        {rows.length === 0 && (
          <div className="opacity-60">По заданным фильтрам ничего не найдено.</div>
        )}

        {rows.map((r, i) => (
          <div key={`${r.gamertag}-${i}`} className="border-b pb-2">
            <div className="font-semibold">{r.gamertag}</div>
            <div className="text-sm opacity-80">
              {r.team_name ?? "—"} — {r.tournament_name ?? "—"}
              {r.match_time ? ` — ${fmtDate(r.match_time)}` : ""}
              {typeof r.round === "number" ? ` — Раунд: ${r.round}` : ""}
              {r.role ? ` — ${r.role}` : ""}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
