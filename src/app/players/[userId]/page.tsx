// src/app/players/[userId]/page.tsx
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma"; // <— ваш общий клиент (если другой путь — поправьте)
import PositionPitchHeatmap from "@/components/PositionPitchHeatmap";
import Link from 'next/link';

// ───────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────
function first<T>(v: T | T[] | undefined): T | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
// Помощник: приводим userId к числу безопасно
function toInt(val: string | string[] | undefined) {
  if (!val) return null;
  const n = Array.isArray(val) ? parseInt(val[0], 10) : parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
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

export default async function PlayerPage({ params }: { params: { userId: string } }) {
  const userId = toInt(params.userId);
  if (!userId) {
    return <div className="p-6">Invalid userId</div>;
  }

  // 1) Профиль игрока (минимум)
  const profile = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT u.user_id, u.nickname
    FROM users u
    WHERE u.user_id = ?
    LIMIT 1
    `,
    userId
  );
  const player = profile[0];

  // 2) СЫРЫЕ РОЛИ ПО МАТЧАМ (без нормализации)
  //    - Берём позиции как они записаны в БД
  //    - Источники: tbl_users_match_stats (помачёвка), при необходимости связка со skills_positions
  //    - Твоему компоненту отдаём:
  //        match_id, skill_position_id, field_position, season_id, tournament_id, played_minutes (если нужно)
  const rawRoles = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT 
      ums.user_id,
      ums.match_id,
      ums.skill_position_id,    -- ссылка на skills_positions.id
      ums.field_position,       -- если у вас это заполняется текстом/кодом
      ums.season_id,
      ums.tournament_id,
      ums.played_minutes        -- поле есть не всегда, если отсутствует — убери
    FROM tbl_users_match_stats AS ums
    WHERE ums.user_id = ?
      AND (ums.skill_position_id IS NOT NULL OR ums.field_position IS NOT NULL)
    `,
    userId
  );

  // 3) Пример агрегации по матчам (оставляем как у тебя было по логике)
  //    Счётчики, xG surrogate, передачи и т.п. — адаптируй под реальные поля из tbl_users_match_stats
  const aggregates = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT 
      COUNT(DISTINCT ums.match_id)              AS matches,
      SUM(ums.goals)                            AS goals,
      SUM(ums.assists)                          AS assists,
      SUM(ums.passes)                           AS passes,
      SUM(ums.completedpasses)                  AS completed_passes,
      AVG(NULLIF(ums.passes_rate, 0))           AS pass_accuracy_avg,   -- если это %, обычно хранится как 0..100
      SUM(ums.intercepts)                       AS intercepts,
      SUM(ums.tackles)                          AS tackles,
      SUM(ums.duels_air)                        AS air_duels,
      SUM(ums.duels_air_win)                    AS air_duels_win
    FROM tbl_users_match_stats ums
    WHERE ums.user_id = ?
    `,
    userId
  );
  const agg = aggregates[0];

  // 4) Отдаём всё компоненту страницы
  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/players" className="text-sm text-blue-500 hover:underline">← Back to Players</Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">
          {player?.nickname ?? `User #${userId}`}
        </h1>
        <p className="text-sm text-neutral-500">ID: {userId}</p>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-2">Aggregates</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-neutral-500">Matches</div><div className="font-medium">{agg?.matches ?? 0}</div></div>
          <div><div className="text-neutral-500">Goals</div><div className="font-medium">{agg?.goals ?? 0}</div></div>
          <div><div className="text-neutral-500">Assists</div><div className="font-medium">{agg?.assists ?? 0}</div></div>
          <div><div className="text-neutral-500">Passes</div><div className="font-medium">{agg?.passes ?? 0}</div></div>
          <div><div className="text-neutral-500">Completed</div><div className="font-medium">{agg?.completed_passes ?? 0}</div></div>
          <div><div className="text-neutral-500">Pass Acc. (avg)</div><div className="font-medium">{agg?.pass_accuracy_avg?.toFixed?.(1) ?? '—'}%</div></div>
          <div><div className="text-neutral-500">Interceptions</div><div className="font-medium">{agg?.intercepts ?? 0}</div></div>
          <div><div className="text-neutral-500">Tackles</div><div className="font-medium">{agg?.tackles ?? 0}</div></div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Raw roles (from DB)</h2>
        <pre className="text-xs bg-neutral-950/60 text-neutral-200 p-3 rounded-lg overflow-auto">
{JSON.stringify(rawRoles.slice(0, 50), null, 2)}
        </pre>
        <p className="text-xs text-neutral-500 mt-1">
          *Отдаём компоненту «сырые» роли: <code>skill_position_id</code> / <code>field_position</code> по матчам без любой нормализации. 
          Дальше твой компонент сам делает маппинг групп (ЦФ/ЛВ/ПВ/ОФ/АП/ЛП/ПП/ЦП/ОП/ЛЗ/ПЗ/ЦЗ) и считает % сыгранных матчей на позиции.
        </p>
      </section>
    </div>
  );
}
