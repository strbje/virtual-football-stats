// src/app/players/[userId]/page.tsx
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma"; // <— ваш общий клиент (если другой путь — поправьте)
import PositionPitchHeatmap from "@/components/PositionPitchHeatmap";

// ───────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────
function first<T>(v: T | T[] | undefined): T | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseRange(raw?: string) {
  // ожидаем YYYY-MM-DD_to_YYYY-MM-DD
  if (!raw) return { from: undefined, to: undefined };
  const [from, to] = String(raw).split("_to_");
  return {
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
  };
}

function toUnix(dateISO?: string, fallback: number = 0) {
  if (!dateISO) return fallback;
  const t = Math.floor(new Date(dateISO + "T00:00:00Z").getTime() / 1000);
  return Number.isFinite(t) ? t : fallback;
}

// ───────────────────────────────────────────────
// data loaders
// ───────────────────────────────────────────────
const getUser = cache(async (userId: number) => {
  // ⚠️ правьте SELECT/таблицу под вашу схему пользователей
  const rows = await prisma.$queryRaw<
    Array<{ id: number; gamertag: string | null; username: string | null }>
  >`SELECT id, gamertag, username
    FROM users
    WHERE id = ${userId}
    LIMIT 1`;
  return rows[0];
});

const getKpi = cache(async (userId: number, fromTs: number, toTs: number) => {
  // ⚠️ правьте поля/таблицу под вашу схему статистики игрока в матче
  const [kpi] = await prisma.$queryRaw<
    Array<{
      matches: number;
      goals: number;
      assists: number;
      last_role: string | null;
      last_team: string | null;
    }>
  >`SELECT
        COUNT(*)                       AS matches,
        COALESCE(SUM(goals),   0)      AS goals,
        COALESCE(SUM(assists), 0)      AS assists,
        (
          SELECT role
          FROM player_match_stats
          WHERE user_id = ${userId}
            AND ts BETWEEN ${fromTs} AND ${toTs}
          ORDER BY ts DESC
          LIMIT 1
        ) AS last_role,
        (
          SELECT team_name
          FROM player_match_stats
          WHERE user_id = ${userId}
            AND ts BETWEEN ${fromTs} AND ${toTs}
          ORDER BY ts DESC
          LIMIT 1
        ) AS last_team
     FROM player_match_stats
     WHERE user_id = ${userId}
       AND ts BETWEEN ${fromTs} AND ${toTs}`;
  return {
    matches: Number(kpi?.matches ?? 0),
    goals: Number(kpi?.goals ?? 0),
    assists: Number(kpi?.assists ?? 0),
    last_role: kpi?.last_role ?? null,
    last_team: kpi?.last_team ?? null,
  };
});

const getRawRoles = cache(async (userId: number, fromTs: number, toTs: number) => {
  // ⚠️ правьте поле role / таблицу player_match_stats под вашу схему
  const rows = await prisma.$queryRaw<Array<{ role: string | null }>>`
    SELECT role
    FROM player_match_stats
    WHERE user_id = ${userId}
      AND ts BETWEEN ${fromTs} AND ${toTs}
      AND role IS NOT NULL
  `;
  // вернём массив непустых ролей
  return rows.map(r => r.role!).filter(Boolean);
});

// ───────────────────────────────────────────────
// page
// ───────────────────────────────────────────────
export const metadata: Metadata = {
  title: "Игрок",
};

type PageProps = {
  params: { userId: string };
  searchParams?: { range?: string | string[] };
};

export default async function PlayerPage({ params, searchParams }: PageProps) {
  const uid = Number(params.userId);
  if (!Number.isFinite(uid)) return notFound();

  // диапазон по параметрам запроса
  const sp = (searchParams ?? {}) as { range?: string | string[] };
  const rangeRaw = first(sp.range);
  const { from, to } = parseRange(rangeRaw);

  const fromTs = toUnix(from, 0);
  const toTs = toUnix(to, 32503680000); // 01.01.3000

  const user = await getUser(uid);
  if (!user) return notFound();

  const a = await getKpi(uid, fromTs, toTs);
  const rawRoles = await getRawRoles(uid, fromTs, toTs); // ← «сырые» роли, без нормализаций

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user.gamertag || user.username || `User #${uid}`}
          </h1>
          <p className="text-sm text-gray-500">
            {a.last_team ? `${a.last_team} · ` : ""}
            {a.last_role ?? "—"}
          </p>
        </div>
        {/* сюда позже добавим date-range фильтр (range=YYYY-MM-DD_to_YYYY-MM-DD) */}
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Матчи</div>
          <div className="text-2xl font-semibold">{a.matches}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Голы</div>
          <div className="text-2xl font-semibold">{a.goals}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Передачи</div>
          <div className="text-2xl font-semibold">{a.assists}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Амплуа (последнее)</div>
          <div className="text-2xl font-semibold">{a.last_role ?? "—"}</div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* KPI карточки выше */}
        {/* Тепловая карта позиций: компонент сам нормализует роли и рисует проценты */}
        <div className="xl:col-span-2 rounded-2xl border p-4">
          <PositionPitchHeatmap
            rawRoles={rawRoles}                 // <— отдаём «как в БД»
            caption="Тепловая карта позиций (доля матчей за период)"
            showPercent                          // компонент выведет % по каждой зоне
          />
        </div>
      </div>
    </div>
  );
}
