// src/lib/db/player.ts
import { prisma } from '@/lib/prisma';

// типы
export type RoleRow = { role: string; cnt: number };
export type LeagueRow = { bucket: string; cnt: number };

// === ОБЩЕЕ КОЛ-ВО МАТЧЕЙ ===
export async function getPlayerMatchesCount(userId: number) {
  const [row] = await prisma.$queryRawUnsafe<{ matches: bigint }[]>(
    `
    SELECT COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    WHERE ums.user_id = ?
    `,
    userId,
  );
  return Number(row?.matches ?? 0);
}

// === РАСПРЕДЕЛЕНИЕ АМПЛУА ЗА ВСЁ ВРЕМЯ ===
export async function getPlayerRoleDistributionAllTime(userId: number) {
  const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
    `
    SELECT sp.short_name AS role, COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    WHERE ums.user_id = ?
    GROUP BY sp.short_name
    `,
    userId,
  );
  return rows;
}

// === АКТУАЛЬНОЕ АМПЛУА (ПОСЛЕДНИЕ 30 МАТЧЕЙ) ===
export async function getPlayerTopRoleLast30(userId: number) {
  const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
    `
    SELECT sp.short_name AS role, COUNT(*) AS cnt
    FROM (
      SELECT ums.skill_id
      FROM tbl_users_match_stats ums
      INNER JOIN tournament_match tm ON ums.match_id = tm.id
      WHERE ums.user_id = ?
      ORDER BY tm.timestamp DESC
      LIMIT 30
    ) recent
    INNER JOIN skills_positions sp ON recent.skill_id = sp.id
    GROUP BY sp.short_name
    ORDER BY cnt DESC
    LIMIT 1
    `,
    userId,
  );
  return rows[0]?.role ?? null;
}

// === ПРОЦЕНТ МАТЧЕЙ ПО ЛИГАМ ===
export async function getPlayerLeagueBuckets(userId: number) {
  const rows = await prisma.$queryRawUnsafe<LeagueRow[]>(
    `
    SELECT
      CASE
        WHEN LOWER(t.name) REGEXP 'премьер|\\bпл\\b' THEN 'ПЛ'
        WHEN LOWER(t.name) REGEXP 'фнл'               THEN 'ФНЛ'
        WHEN LOWER(t.name) REGEXP 'пфл'               THEN 'ПФЛ'
        WHEN LOWER(t.name) REGEXP 'лфл'               THEN 'ЛФЛ'
        ELSE 'Прочее'
      END AS bucket,
      COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    INNER JOIN tournament_match tm ON ums.match_id = tm.id
    INNER JOIN tournament t ON tm.tournament_id = t.id
    WHERE ums.user_id = ?
    GROUP BY bucket
    `,
    userId,
  );

  const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
  const norm = rows.map(r => ({
    bucket: r.bucket,
    cnt: Number(r.cnt),
    percent: total ? Math.round((Number(r.cnt) / total) * 100) : 0,
  }));

  const order = { 'ПЛ': 1, 'ФНЛ': 2, 'ПФЛ': 3, 'ЛФЛ': 4, 'Прочее': 9 };
  return norm.sort((a, b) => (order[a.bucket] ?? 50) - (order[b.bucket] ?? 50));
}
