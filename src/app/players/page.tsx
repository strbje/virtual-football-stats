export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/db";
import FiltersClient from "@/components/players/FiltersClient";

// --------- types & helpers ---------
type SearchParamsDict = Record<string, string | string[] | undefined>;

type Search = {
  q?: string;
  team?: string;
  tournament?: string;
  role?: string;   // Амплуа
  from?: string;   // YYYY-MM-DD
  to?: string;     // YYYY-MM-DD
};

type PlayerRow = {
  user_id: number;
  gamertag: string;
  team_name: string | null;
  tournament_name: string | null;
  matches: number;
  goals: number;
  assists: number;
  rating: number | null;
  role?: string | null;
};

function val(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v || undefined;
}

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`;
}

// --------- role (амплуа) detection ---------
/**
 * Пробуем понять, где лежит «амплуа» в вашей БД.
 * По очереди проверяем:
 *   - user_match_stats.position
 *   - user_match_stats.role
 *   - users.role
 * Возвращаем выражение колонки + список distinct-значений.
 */
async function detectRoleFieldAndValues(
  prisma: PrismaClient
): Promise<{ columnExpr: "ums.position" | "ums.role" | "u.role"; values: string[] }> {
  async function tryDistinct(columnExpr: "ums.position" | "ums.role" | "u.role") {
    try {
      const rows = await prisma.$queryRawUnsafe<{ val: string }[]>(
        `
          SELECT DISTINCT ${columnExpr} AS val
          FROM user_match_stats ums
          LEFT JOIN users u ON u.id = ums.user_id
          WHERE ${columnExpr} IS NOT NULL AND ${columnExpr} <> ''
          ORDER BY ${columnExpr} ASC
        `
      );
      const vals = rows
        .map((r) => (typeof r.val === "string" ? r.val.trim() : ""))
        .filter((s) => s.length > 0);
      if (vals.length > 0) return vals;
    } catch {
      // колонка/таблица могла отсутствовать — двигаемся дальше
    }
    return [];
  }

  const v1 = await tryDistinct("ums.position");
  if (v1.length) return { columnExpr: "ums.position", values: v1 };

  const v2 = await tryDistinct("ums.role");
  if (v2.length) return { columnExpr: "ums.role", values: v2 };

  const v3 = await tryDistinct("u.role");
  if (v3.length) return { columnExpr: "u.role", values: v3 };

  return { columnExpr: "ums.position", values: [] };
}

// --------- main query ---------
/**
 * Основной запрос игроков с фильтрами.
 * Все значения передаём параметрами (без шаблонной подстановки в SQL).
 */
async function getPlayers(prisma: PrismaClient, s: Search): Promise<PlayerRow[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (s.q) {
    where.push(`u.gamertag LIKE ?`);
    params.push(`%${s.q}%`);
  }
  if (s.team) {
    where.push(`c.team_name LIKE ?`);
    params.push(`%${s.team}%`);
  }
  if (s.tournament) {
    where.push(`t.name LIKE ?`);
    params.push(`%${s.tournament}%`);
  }
  if (s.from) {
    where.push(`tm.timestamp >= ?`);
    params.push(s.from);
  }
  if (s.to) {
    where.push(`tm.timestamp <= ?`);
    params.push(`${s.to} 23:59:59`);
  }
  if (s.role) {
    // фильтруем по любому возможному месту хранения амплуа
    where.push(`(
      (ums.position IS NOT NULL AND ums.position <> '' AND ums.position = ?)
      OR (ums.role IS NOT NULL AND ums.role <> '' AND ums.role = ?)
      OR (u.role IS NOT NULL AND u.role <> '' AND u.role = ?)
    )`);
    params.push(s.role, s.role, s.role);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      u.id AS user_id,
      u.gamertag,
      c.team_name,
      t.name AS tournament_name,
      COUNT(DISTINCT tm.id) AS matches,
      SUM(COALESCE(ums.goals, 0)) AS goals,
      SUM(COALESCE(ums.assists, 0)) AS assists,
      AVG(ums.rating) AS rating,
      COALESCE(ums.position, ums.role, u.role) AS role
    FROM user_match_stats ums
    INNER JOIN users u ON u.id = ums.user_id
    LEFT JOIN team_members tm ON tm.user_id = u.id
    LEFT JOIN teams c ON tm.team_id = c.id
    LEFT JOIN tournaments t ON t.id = ums.tournament_id
    ${whereSql}
    GROUP BY u.id, u.gamertag, c.team_name, t.name, role
    ORDER BY matches DESC, goals DESC, assists DESC, gamertag ASC
    LIMIT 500
  `;

  const rows = (await prisma.$queryRawUnsafe(sql, ...params)) as PlayerRow[];
  return rows;
}

// --------- page ---------
export default async function PlayersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsDict>;
}) {
  // корректно получаем query params из Promise (App Router)
  const sp: SearchParamsDict = searchParams ? await searchParams : {};

  const s: Search = {
    q: val(sp.q),
    team: val(sp.team),
    tournament: val(sp.tournament),
    role: val(sp.role),
    from: val(sp.from),
    to: val(sp.to),
  };

  const prisma = await getDb();
  const base = await getBaseUrl();

  let roles: string[] = [];
  let players: PlayerRow[] = [];
  let errorMsg = "";

  if (prisma) {
    try {
      // 1) список амплуа из БД (DISTINCT)
      const roleInfo = await detectRoleFieldAndValues(prisma);
      roles = roleInfo.values;

      // 2) сами игроки
      players = await getPlayers(prisma, s);
    } catch (e: any) {
      console.error("Players page DB error:", e);
      errorMsg =
        "Не удалось загрузить данные игроков. Проверь SQL-структуру/права пользователя базы данных.";
      roles = [];
      players = [];
    }
  } else {
    errorMsg = "База данных недоступна (нет соединения).";
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Игроки</h1>
        <Link href="/" className="text-blue-600 underline">
          На главную
        </Link>
      </div>

      {/* Фильтры (если ролей нет, селект всё равно будет с «любое») */}
      <FiltersClient
        initial={{
          q: s.q || "",
          team: s.team || "",
          tournament: s.tournament || "",
          role: s.role || "",
          from: s.from || "",
          to: s.to || "",
        }}
        roles={roles}
      />

      {errorMsg && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-3">
        {players.length === 0 && !errorMsg && (
          <div className="text-gray-500">Ничего не найдено (поменяйте фильтры).</div>
        )}

        {players.map((p) => (
          <div
            key={`${p.user_id}-${p.tournament_name ?? "any"}`}
            className="border rounded p-4 hover:shadow"
          >
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="font-semibold">{p.gamertag}</div>
              <div className="text-sm text-gray-500">
                {p.team_name ? `Команда: ${p.team_name}` : "Без команды"}
              </div>
              <div className="text-sm text-gray-500">
                {p.tournament_name ? `Турнир: ${p.tournament_name}` : ""}
              </div>
              {p.role && (
                <div className="text-sm px-2 py-0.5 rounded bg-gray-100 border text-gray-700">
                  Амплуа: {p.role}
                </div>
              )}
            </div>

            <div className="mt-2 text-sm text-gray-700">
              Матчи: <b>{p.matches}</b>, Голы: <b>{p.goals}</b>, Пасы: <b>{p.assists}</b>
              {p.rating != null && `, Рейтинг: ${p.rating.toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6 text-xs text-gray-400">
        Источник API: <code>{base}</code>
      </div>
    </div>
  );
}
