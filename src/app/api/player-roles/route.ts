/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/** Безопасный парсер дат "ДД.ММ.ГГГГ" или "ДД.ММ.ГГГГ ЧЧ:ММ:СС" -> ms */
function parseTs(s?: string | null): number | null {
  if (!s) return null;
  const parts = s.trim().split(' ');
  const [d, m, y] = (parts[0] || '').split('.').map(Number);
  if (!d || !m || !y) return null;
  const time = parts[1] || '00:00:00';
  const [hh, mm, ss] = time.split(':').map(v => Number(v || 0));
  const js = new Date(y, m - 1, d, hh, mm, ss).getTime();
  return Number.isFinite(js) ? js : null;
}

/** Приводим любые bigint из MySQL к number */
const toNum = (v: any) => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0));

/** GET /api/player-roles/[userId]?range=DD.MM.YYYY:DD.MM.YYYY */
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const url = new URL(req.url);
    const range = url.searchParams.get('range') || '';

    // Диапазон дат
    const [fromRaw, toRaw] = range.split(':');
    const fromTs = parseTs(fromRaw) ?? 0;
    const toTs = parseTs(toRaw ? `${toRaw} 23:59:59` : '') ?? 32503680000; // 01.01.3000

    const userId = Number(params.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: 'Bad userId' }, { status: 400 });
    }

    // --- 1) Распределение по ролям ---
    // таблицы по твоему запросу из дашборда:
    // tbl_users_match_stats ums
    // tournament_match tm
    // skills_positions sp
    // tournament t (ниже пригодится для лиг)
    type RoleRow = { role_code: string; cnt: bigint | number };
    const rolesRows = await prisma.$queryRaw<RoleRow[]>(Prisma.sql`
      SELECT sp.short_name AS role_code, COUNT(*) AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      GROUP BY sp.short_name
    `);

    const totalMatchesRow = await prisma.$queryRaw<{ total: bigint | number }[]>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON ums.match_id = tm.id
        WHERE ums.user_id = ${userId}
          AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      `
    );
    const totalMatches = toNum(totalMatchesRow[0]?.total ?? 0);

    const roles = rolesRows.map(r => ({
      role: r.role_code,
      count: toNum(r.cnt),
      percent: totalMatches ? Math.round((toNum(r.cnt) * 10000) / totalMatches) / 100 : 0,
    }));

    // --- 2) Распределение по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ) ---
    // используем название турнира t.name
    type LeagueRow = { bucket: string; cnt: bigint | number };
    const leaguesRows = await prisma.$queryRaw<LeagueRow[]>(Prisma.sql`
      SELECT
        CASE
          WHEN t.name LIKE '%Премьер%' OR t.name LIKE '%ПЛ%' THEN 'pl'
          WHEN t.name LIKE '%ФНЛ%' THEN 'fnl'
          WHEN t.name LIKE '%ПФЛ%' THEN 'pfl'
          WHEN t.name LIKE '%ЛФЛ%' THEN 'lfl'
          ELSE 'other'
        END AS bucket,
        COUNT(*) AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament t ON tm.tournament_id = t.id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      GROUP BY bucket
    `);

    const leaguesAgg = { pl: 0, fnl: 0, pfl: 0, lfl: 0, other: 0, total: 0 };
    for (const row of leaguesRows) {
      const k = (row.bucket as keyof typeof leaguesAgg) || 'other';
      const v = toNum(row.cnt);
      leaguesAgg[k] = (leaguesAgg[k] || 0) + v;
      leaguesAgg.total += v;
    }
    const leagues = [
      { label: 'ПЛ',  percent: leaguesAgg.total ? Math.round((leaguesAgg.pl  * 10000) / leaguesAgg.total) / 100 : 0 },
      { label: 'ФНЛ', percent: leaguesAgg.total ? Math.round((leaguesAgg.fnl * 10000) / leaguesAgg.total) / 100 : 0 },
      { label: 'ПФЛ', percent: leaguesAgg.total ? Math.round((leaguesAgg.pfl * 10000) / leaguesAgg.total) / 100 : 0 },
      { label: 'ЛФЛ', percent: leaguesAgg.total ? Math.round((leaguesAgg.lfl * 10000) / leaguesAgg.total) / 100 : 0 },
    ];

    // --- 3) Актуальное амплуа (по последним 30 матчам пользователя) ---
    type LastRow = { role_code: string; cnt: bigint | number };
    const last30Rows = await prisma.$queryRaw<LastRow[]>(Prisma.sql`
      SELECT A.role_code, COUNT(*) AS cnt
      FROM (
        SELECT sp.short_name AS role_code
        FROM tbl_users_match_stats ums
        JOIN tournament_match tm ON ums.match_id = tm.id
        JOIN skills_positions sp ON ums.skill_id = sp.id
        WHERE ums.user_id = ${userId}
        ORDER BY tm.timestamp DESC
        LIMIT 30
      ) AS A
      GROUP BY A.role_code
      ORDER BY cnt DESC
    `);
    const topRoleLast30 = last30Rows.length ? last30Rows.reduce((a, b) => (toNum(b.cnt) > toNum(a.cnt) ? b : a)).role_code : null;

    return NextResponse.json({
      ok: true,
      total: totalMatches,
      roles,
      leagues,
      topRoleLast30,
      range: { fromTs, toTs },
    });
  } catch (err: any) {
    // даём короткий ответ + техническую деталь для логов
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
