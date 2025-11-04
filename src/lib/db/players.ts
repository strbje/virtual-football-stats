// src/lib/db/player.ts
import { prisma } from "@/lib/prisma";

export type RolePercent = { role: string; percent: number };
export type LeaguePercent = { label: "ПЛ" | "ФНЛ" | "ПФЛ" | "ЛФЛ"; percent: number };

export function parseRange(range?: string): { fromTs: number; toTs: number } {
  if (!range) return { fromTs: 0, toTs: 32503680000 };
  const [start, end] = range.split(":").map((s) => s?.trim()).filter(Boolean);
  const fromTs = start ? Math.floor(new Date(`${start} 00:00:00`).getTime() / 1000) : 0;
  const toTs = end ? Math.floor(new Date(`${end} 23:59:59`).getTime() / 1000) : 32503680000;
  return { fromTs, toTs };
}

/** Короткая инфо по игроку (gamertag/username). */
export async function getPlayerInfo(userId: number) {
  const rows = await prisma.$queryRawUnsafe<
    { id: number; gamertag: string | null; username: string | null }[]
  >(
    `SELECT u.id, u.gamertag, u.username
     FROM tbl_users u
     WHERE u.id = ? LIMIT 1`,
    userId
  );
  return rows[0] ?? null;
}

/** Кол-во матчей игрока в диапазоне (источник тот же, что и бары/теплокарта). */
export async function getPlayerMatchesCount(userId: number, fromTs: number, toTs: number) {
  const rows = await prisma.$queryRawUnsafe<{ matches: bigint }[]>(
    `SELECT COUNT(*) AS matches
     FROM tbl_users_match_stats ums
     JOIN tournament_match tm ON tm.id = ums.match_id
     WHERE ums.user_id = ? AND tm.timestamp BETWEEN ? AND ?`,
    userId, fromTs, toTs
  );
  return Number(rows?.[0]?.matches ?? 0);
}

/** Актуальное амплуа = наиболее частая роль за последние 30 матчей. */
export async function getPlayerTopRoleLast30(userId: number, fromTs: number, toTs: number) {
  const rows = await prisma.$queryRawUnsafe<{ role: string | null }[]>(
    `
    WITH last30 AS (
      SELECT ums.match_id, tm.timestamp,
             COALESCE(fp.code, sp.short_name) AS role_code
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm         ON tm.id = ums.match_id
      JOIN skills_positions  sp        ON sp.id = ums.skill_id
      LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
      WHERE ums.user_id = ?
        AND tm.timestamp BETWEEN ? AND ?
      ORDER BY tm.timestamp DESC
      LIMIT 30
    )
    SELECT role_code AS role
    FROM last30
    GROUP BY role_code
    ORDER BY COUNT(*) DESC, MAX(timestamp) DESC
    LIMIT 1
    `,
    userId, fromTs, toTs
  );
  return rows?.[0]?.role ?? "—";
}

/** Распределение по амплуа в процентах (те же коды, что использует теплокарта). */
export async function getPlayerRoleDistribution(
  userId: number,
  fromTs: number,
  toTs: number
): Promise<RolePercent[]> {
  const rows = await prisma.$queryRawUnsafe<{ role: string; cnt: bigint }[]>(
    `
    SELECT COALESCE(fp.code, sp.short_name) AS role, COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm         ON tm.id = ums.match_id
    JOIN skills_positions  sp        ON sp.id = ums.skill_id
    LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
    WHERE ums.user_id = ?
      AND tm.timestamp BETWEEN ? AND ?
    GROUP BY COALESCE(fp.code, sp.short_name)
    ORDER BY cnt DESC
    `,
    userId, fromTs, toTs
  );
  const total = rows.reduce((s, r) => s + Number(r.cnt), 0) || 1;
  return rows
    .map(r => ({ role: r.role, percent: Math.round((Number(r.cnt) * 100) / total) }))
    .filter(x => x.percent > 0);
}

/** Распределение матчей по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ) по имени турнира. */
export async function getLeagueDistribution(
  userId: number,
  fromTs: number,
  toTs: number
): Promise<LeaguePercent[]> {
  const r = await prisma.$queryRawUnsafe<
    { total: bigint; pl: bigint; fnl: bigint; pfl: bigint; lfl: bigint }[]
  >(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(t.name) LIKE '%премьер%' OR UPPER(t.name) LIKE '%ПЛ%'  THEN 1 ELSE 0 END) AS pl,
      SUM(CASE WHEN UPPER(t.name) LIKE '%ФНЛ%'                                     THEN 1 ELSE 0 END) AS fnl,
      SUM(CASE WHEN UPPER(t.name) LIKE '%ПФЛ%'                                     THEN 1 ELSE 0 END) AS pfl,
      SUM(CASE WHEN UPPER(t.name) LIKE '%ЛФЛ%'                                     THEN 1 ELSE 0 END) AS lfl
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t        ON t.id  = tm.tournament_id
    WHERE ums.user_id = ?
      AND tm.timestamp BETWEEN ? AND ?
    `,
    userId, fromTs, toTs
  );
  const row = r?.[0];
  const total = Math.max(1, Number(row?.total ?? 0));
  const list: LeaguePercent[] = [
    { label: "ПЛ",  percent: Math.round((Number(row?.pl  ?? 0) * 100) / total) },
    { label: "ФНЛ", percent: Math.round((Number(row?.fnl ?? 0) * 100) / total) },
    { label: "ПФЛ", percent: Math.round((Number(row?.pfl ?? 0) * 100) / total) },
    { label: "ЛФЛ", percent: Math.round((Number(row?.lfl ?? 0) * 100) / total) },
  ];
  return list.filter(x => x.percent > 0);
}
