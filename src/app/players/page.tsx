// app/players/page.tsx
import { prisma } from "@/lib/prisma"; // если у тебя prisma уже проксируется иначе — оставь свой импорт
import FiltersClient from "@/components/players/FiltersClient";
import React from "react";

type SearchParamsDict = Record<string, string | string[] | undefined>;

type Search = {
  q?: string;
  team?: string;
  tournament?: string;
  role?: string;
  range?: string; // один контрол дат: "YYYY-MM-DD:YYYY-MM-DD"
};

type Row = {
  gamertag: string;
  username: string;
  role: string;     // sp.short_name
  team_name: string;
  tournament_name: string;
  round: number;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// разбор "YYYY-MM-DD:YYYY-MM-DD" в from/to (строки для SQL)
function parseRange(range?: string): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range.split(":").map(s => s?.trim()).filter(Boolean);
  return {
    from: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined,
    to: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined,
  };
}

export const dynamic = "force-dynamic"; // серверный рендер по запросу

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // приводим к словарю
  const raw: Record<string, string | string[] | undefined> =
    (await (searchParams ?? Promise.resolve({}))) ?? {};

  // берём значение как строку (учитываем string | string[] | undefined)
  const get = (key: string): string => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };

  // то, что раньше собиралось через sp.q / first(...)
  const s: Search = {
    q: get("q"),
    team: get("team"),
    tournament: get("tournament"),
    role: get("role"),
    range: get("range"), // если используешь единый date-range
  };

  const { from, to } = parseRange(s.range);

  // Собираем WHERE для сырых запросов
  const where: string[] = [];
  const params: any[] = [];

  if (s.q) {
    where.push("(u.gamertag LIKE ? OR u.username LIKE ?)");
    params.push(`%${s.q}%`, `%${s.q}%`);
  }
  if (s.team) {
    where.push("c.team_name LIKE ?");
    params.push(`%${s.team}%`);
  }
  if (s.tournament) {
    where.push("t.name LIKE ?");
    params.push(`%${s.tournament}%`);
  }
  if (s.role) {
    where.push("sp.short_name = ?");
    params.push(s.role);
  }
  if (from) {
    // tm.timestamp хранится в секундах UNIX. Ограничим снизу.
    where.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    // ограничим сверху концом дня “to”
    where.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    params.push(`${to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // 1) список доступных амплуа (DISTINCT), чтобы заполнить селект
  const rolesRows = (await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT DISTINCT sp.short_name AS role
      FROM tbl_users_match_stats ums
      INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    `
  )).map(r => r.role as string);

  // 2) сами строки для таблицы (без колонки с датой — ты просил убрать её)
  const rows: Row[] = await prisma.$queryRawUnsafe(
    `
      SELECT
        u.gamertag,
        u.username,
        sp.short_name AS role,
        c.team_name,
        t.name       AS tournament_name,
        tm.round
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      INNER JOIN skills_positions sp ON ums.skill_id = sp.id
      INNER JOIN tbl_users u        ON ums.user_id  = u.id
      INNER JOIN tournament t       ON tm.tournament_id = t.id
      INNER JOIN teams c            ON ums.team_id = c.id
      ${whereSql}
      ORDER BY tm.timestamp DESC
      LIMIT 200
    `,
    ...params
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Игроки</h1>

      {/* Единый набор фильтров.
          Обрати внимание: теперь вместо двух дат есть ОДИН контрол "range".
          Формат значения — "YYYY-MM-DD:YYYY-MM-DD". */}
      <FiltersClient
        initial={{
          q: s.q ?? "",
          team: s.team ?? "",
          tournament: s.tournament ?? "",
          role: s.role ?? "",
          range: s.range ?? "",
        }}
        roles={rolesRows}
      />

      {/* Таблица БЕЗ колонки Дата — оставляем только те, что нужны */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Игрок</th>
              <th className="py-2 pr-4">Амплуа</th>
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Турнир</th>
              <th className="py-2 pr-4">Раунд</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.gamertag}-${i}`} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{r.username || r.gamertag}</td>
                <td className="py-2 pr-4">{r.role}</td>
                <td className="py-2 pr-4">{r.team_name}</td>
                <td className="py-2 pr-4">{r.tournament_name}</td>
                <td className="py-2 pr-4">{r.round}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={5}>
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

