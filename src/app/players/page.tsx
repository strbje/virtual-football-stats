// src/app/players/page.tsx
import FiltersClient from "@/components/players/FiltersClient";
import { getDb } from "@/lib/db";

// Если нужен принудительный рендер без кэша, раскомментируй:
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

const FALLBACK_ROLES_RU = [
  "Вратарь",
  "Центральный защитник",
  "Крайний защитник",
  "Оборонительный полузащитник",
  "Центральный полузащитник",
  "Атакующий полузащитник",
  "Фланговый атакующий",
  "Нападающий",
];

function toStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function fmtDate(d: Date | string | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default async function PlayersPage({
  // В Next 15 searchParams — это Promise
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const prisma = await getDb();
  const sp = await searchParams;

  const q = toStr(sp.q); // игрок
  const team = toStr(sp.team); // команда
  const tournament = toStr(sp.tournament); // турнир
  const from = toStr(sp.from); // YYYY-MM-DD
  const to = toStr(sp.to); // YYYY-MM-DD
  const role = toStr(sp.role); // амплуа

  // База может быть отключена (SKIP_DB=1) — не падаем
  if (!prisma) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Игроки</h1>
        <FiltersClient initial={{ q, team, tournament, from, to, role }} roles={FALLBACK_ROLES_RU} />
        <p className="text-sm opacity-70">База данных недоступна (SKIP_DB=1 или PrismaClient не сгенерирован).</p>
      </main>
    );
  }

  // ---- 1) Список амплуа ----------------------------------------------------
  // Пытаемся вытащить амплуа из БД. Идём по стратегиям — первая удачная победила.
  let roles: string[] = [];

  async function tryGetRoles(): Promise<string[] | null> {
    // Стратегия A: отдельная таблица "positions" (или аналог) с колонкой "name"
    try {
      const rows = await prisma.$queryRaw<{ name: string }[]>`
        SELECT DISTINCT name
        FROM positions
        WHERE name IS NOT NULL AND name <> ''
        ORDER BY name
      `;
      if (rows.length) return rows.map((r) => r.name);
    } catch {}

    // Стратегия B: колонка позиции прямо в статистике матчей (user_match_stats.position / position_name)
    try {
      const rows = await prisma.$queryRaw<{ position: string }[]>`
        SELECT DISTINCT position
        FROM user_match_stats
        WHERE position IS NOT NULL AND position <> ''
        ORDER BY position
      `;
      if (rows.length) return rows.map((r) => r.position);
    } catch {}

    try {
      const rows = await prisma.$queryRaw<{ position_name: string }[]>`
        SELECT DISTINCT position_name
        FROM user_match_stats
        WHERE position_name IS NOT NULL AND position_name <> ''
        ORDER BY position_name
      `;
      if (rows.length) return rows.map((r) => r.position_name);
    } catch {}

    // Стратегия C: роль хранится в users.role
    try {
      const rows = await prisma.$queryRaw<{ role: string }[]>`
        SELECT DISTINCT role
        FROM users
        WHERE role IS NOT NULL AND role <> ''
        ORDER BY role
      `;
      if (rows.length) return rows.map((r) => r.role);
    } catch {}

    return null;
  }

  try {
    roles = (await tryGetRoles()) ?? FALLBACK_ROLES_RU;
  } catch {
    roles = FALLBACK_ROLES_RU;
  }

  // ---- 2) Данные игроков ----------------------------------------------------
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
    where.push(`tm.timestamp >= ?`);
    params.push(new Date(`${from}T00:00:00.000Z`));
  }
  if (to) {
    where.push(`tm.timestamp <= ?`);
    params.push(new Date(`${to}T23:59:59.999Z`));
  }
  if (role) {
    // Пытаемся фильтровать по возможным местам хранения роли
    where.push(`COALESCE(ums.position, ums.position_name, u.role) = ?`);
    params.push(role);
  }

  // ВАЖНО: подгони имена таблиц/полей под свою схему при необходимости.
  const baseSql = `
    SELECT
      u.gamertag                           AS gamertag,
      c.team_name                          AS team_name,
      t.name                               AS tournament_name,
      tm.timestamp                         AS match_time,
      tm.round                             AS round,
      COALESCE(ums.position, ums.position_name, u.role) AS role
    FROM user_match_stats ums
      INNER JOIN users u           ON u.id = ums.user_id
      LEFT  JOIN teams c           ON c.id = ums.team_id
      LEFT  JOIN tournament_matches tm ON tm.id = ums.match_id
      LEFT  JOIN tournaments t     ON t.id = tm.tournament_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY tm.timestamp DESC NULLS LAST, u.gamertag ASC
    LIMIT 500
  ` as const;

  let rows: Row[] = [];
  try {
    rows = (await prisma.$queryRawUnsafe(baseSql, ...params)) as Row[];
  } catch (e) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Игроки</h1>
        <FiltersClient initial={{ q, team, tournament, from, to, role }} roles={roles} />
        <p className="mt-4 text-red-600">
          Не удалось загрузить данные игроков. Проверь SQL и имена таблиц/полей в{" "}
          <code className="px-1">/app/players/page.tsx</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Игроки</h1>

      <FiltersClient initial={{ q, team, tournament, from, to, role }} roles={roles} />

      <section className="space-y-3">
        {rows.length === 0 && <div className="opacity-60">По заданным фильтрам ничего не найдено.</div>}

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
