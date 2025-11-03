import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Row = Record<string, unknown>;
const toNum = (v: unknown) =>
  typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0);

/** Основная агрегация по position_id -> tbl_field_positions.id */
async function queryByPositionId(userId: number) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT fp.code AS role, COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    JOIN tbl_field_positions fp ON fp.id = ums.position_id
    WHERE ums.user_id = ?
      AND ums.position_id IS NOT NULL
      AND ums.position_id <> 0
    GROUP BY fp.code
    ORDER BY cnt DESC
    `,
    userId
  );
  return rows ?? [];
}

/** Запасной путь: агрегация по skill_id -> tbl_field_positions.skill_id */
async function queryBySkillId(userId: number) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT fp.code AS role, COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    JOIN tbl_field_positions fp ON fp.skill_id = ums.skill_id
    WHERE ums.user_id = ?
      AND ums.skill_id IS NOT NULL
      AND ums.skill_id <> 0
    GROUP BY fp.code
    ORDER BY cnt DESC
    `,
    userId
  );
  return rows ?? [];
}

async function sampleDebug(userId: number, limit = 8) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT
      ums.match_id,
      ums.team_id,
      ums.position_id,
      ums.skill_id,
      fp.code AS role_code
    FROM tbl_users_match_stats ums
    LEFT JOIN tbl_field_positions fp
      ON fp.id = ums.position_id
    WHERE ums.user_id = ?
    ORDER BY ums.match_id DESC
    LIMIT ?
    `,
    userId,
    limit
  );
  return rows ?? [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = Number(url.searchParams.get('userId'));
  const debug = url.searchParams.get('debug') === '1';

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ ok: false, error: 'Bad or missing userId' }, { status: 400 });
  }

  try {
    // 1) пробуем по position_id
    let rows = await queryByPositionId(userId);

    // 2) если пусто — пробуем по skill_id
    if (!rows.length) {
      rows = await queryBySkillId(userId);
    }

    if (!rows.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Нет данных о позициях для этого userId ни по position_id, ни по skill_id. ' +
            'Проверь, что в tbl_users_match_stats реально есть строки с ненулевыми position_id/skill_id для этого пользователя.',
          diag: debug ? await sampleDebug(userId) : undefined,
        },
        { status: 404 }
      );
    }

    const mapped = rows.map((r) => ({
      role: String((r as any).role ?? '').toUpperCase(),
      count: toNum((r as any).cnt),
    }));

    const total = mapped.reduce((a, b) => a + b.count, 0);
    const roles = mapped.map((r) => ({
      role: r.role,
      count: r.count,
      pct: total ? Math.round((r.count * 10000) / total) / 100 : 0,
    }));

    return NextResponse.json({
      ok: true,
      source: 'tbl_users_match_stats + tbl_field_positions',
      total,
      roles,
      debug_sample: debug ? await sampleDebug(userId) : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
