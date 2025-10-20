export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import type { DraftPlayer } from "@/lib/store"; // если есть общий тип, иначе убери
import { getDb } from "@/lib/db";

/** Утилита для baseUrl (как у тебя в других страницах) */
async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`;
}

type Search = {
  q?: string;             // игрок
  team?: string;          // команда
  tournament?: string;    // турнир
  role?: string;          // амплуа
  period?: string;        // формат: 2025-08-01..2025-08-31
  from?: string;          // legacy поддержка
  to?: string;            // legacy поддержка
};

function parsePeriod(s?: string) {
  if (!s) return { from: undefined, to: undefined };
  const [a, b] = s.split("..");
  const from = a?.trim() || undefined;
  const to = b?.trim() || undefined;
  return { from, to };
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const db = await getDb();
  const base = await getBaseUrl();

  // --- собираем фильтры
  const q = (searchParams.q ?? "").trim();
  const team = (searchParams.team ?? "").trim();
  const tournament = (searchParams.tournament ?? "").trim();
  const role = (searchParams.role ?? "").trim();

  const { from: periodFrom, to: periodTo } = parsePeriod(searchParams.period);
  const from = (periodFrom ?? searchParams.from ?? "").trim();
  const to = (periodTo ?? searchParams.to ?? "").trim();

  // список амплуа для дропдауна
  let roles: string[] = [];
  if (db) {
    try {
      // если в твоей схеме поле называется иначе (например, `role` / `position` / `amplua`)
      // поменяй `position` на актуальное имя поля:
      const rows = await db.$queryRaw<{ position: string }[]>(
        // @ts-ignore
        `SELECT DISTINCT position FROM users WHERE position IS NOT NULL AND position <> '' ORDER BY position`
      );
      roles = rows.map((r) => r.position);
    } catch {
      roles = [];
    }
  }

  // данные игроков (плейсхолдер при отключенной БД)
  let players:
    | {
        gamertag: string;
        team_name: string | null;
        tournament_name: string | null;
        match_time: string | null;
        round: number | null;
        role: string | null;
      }[]
    | null = null;

  if (!db) {
    // режим заглушки
    players = [];
  } else {
    // собираем WHERE безопасно
    const where: string[] = [];
    const params: any[] = [];

    if (q) {
      where.push(`u.gamertag LIKE ?`);
      params.push(`%${q}%`);
    }
    if (team) {
      where.push(`t.team_name LIKE ?`);
      params.push(`%${team}%`);
    }
    if (tournament) {
      where.push(`tr.name LIKE ?`);
      params.push(`%${tournament}%`);
    }
    if (role) {
      // имя поля роли должно совпадать с SELECT ниже
      where.push(`u.position = ?`);
      params.push(role);
    }
    if (from) {
      where.push(`m.timestamp >= ?`);
      params.push(from);
    }
    if (to) {
      where.push(`m.timestamp <= ?`);
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    players = await db.$queryRaw<
      {
        gamertag: string;
        team_name: string | null;
        tournament_name: string | null;
        match_time: string | null;
        round: number | null;
        role: string | null;
      }[]
    >(
      // ВАЖНО: подставь реальные имена таблиц/полей
      // users u, teams t, tournaments tr, matches m, user_match_stats ums (пример)
      `
      SELECT
        u.gamertag,
        t.team_name,
        tr.name AS tournament_name,
        m.timestamp AS match_time,
        ums.round AS round,
        u.position AS role
      FROM user_match_stats ums
      JOIN users u       ON ums.user_id = u.id
      LEFT JOIN teams t  ON ums.team_id = t.id
      LEFT JOIN matches m ON ums.match_id = m.id
      LEFT JOIN tournaments tr ON m.tournament_id = tr.id
      ${whereSql}
      ORDER BY m.timestamp DESC, u.gamertag ASC
      LIMIT 500
      `,
      ...params
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Игроки</h1>

      {/* Форма фильтров (клиентская; собирает только непустые поля) */}
      <PlayersFilter
        roles={roles}
        initial={{
          q,
          team,
          tournament,
          role,
          period: from || to ? `${from || ""}..${to || ""}` : "",
        }}
      />

      <div className="divide-y">
        {(players ?? []).map((p, i) => (
          <div key={`${p.gamertag}-${i}`} className="py-3">
            <span className="font-semibold">{p.gamertag}</span>{" "}
            — {p.team_name ?? "—"} — {p.tournament_name ?? "—"} —{" "}
            {p.match_time ? new Date(p.match_time).toLocaleString("ru-RU") : "—"}
            {p.round != null ? <span>  Раунд: {p.round}</span> : null}
            {p.role ? <span>  • {p.role}</span> : null}
          </div>
        ))}
        {(players ?? []).length === 0 && (
          <div className="text-gray-500">Ничего не найдено.</div>
        )}
      </div>
    </div>
  );
}

/** Клиентская форма фильтрации */
function PlayersFilter({
  roles,
  initial,
}: {
  roles: string[];
  initial: { q: string; team: string; tournament: string; role: string; period: string };
}) {
  "use client";

  import { useRouter, usePathname } from "next/navigation";
  import { FormEvent, useState } from "react";

  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(initial.q);
  const [team, setTeam] = useState(initial.team);
  const [tournament, setTournament] = useState(initial.tournament);
  const [role, setRole] = useState(initial.role);
  const [period, setPeriod] = useState(initial.period); // формат 2025-08-01..2025-08-31

  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();

    if (q.trim()) params.set("q", q.trim());
    if (team.trim()) params.set("team", team.trim());
    if (tournament.trim()) params.set("tournament", tournament.trim());
    if (role.trim()) params.set("role", role.trim());
    if (period.trim()) params.set("period", period.trim());

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function reset() {
    setQ("");
    setTeam("");
    setTournament("");
    setRole("");
    setPeriod("");
    router.replace(pathname); // чистим урл целиком
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-center">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ник игрока"
        className="border rounded px-3 py-2 w-64"
      />
      <input
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Команда"
        className="border rounded px-3 py-2 w-56"
      />
      <input
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
        placeholder="Турнир"
        className="border rounded px-3 py-2 w-56"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="border rounded px-3 py-2 w-52"
      >
        <option value="">Амплуа: любое</option>
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {/* Один инпут периода: YYYY-MM-DD..YYYY-MM-DD */}
      <input
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        placeholder="Период: YYYY-MM-DD..YYYY-MM-DD"
        className="border rounded px-3 py-2 w-72"
      />

      <button className="bg-blue-600 text-white rounded px-4 py-2">Фильтр</button>
      <button
        type="button"
        onClick={reset}
        className="border rounded px-4 py-2"
      >
        Сброс
      </button>
    </form>
  );
}
