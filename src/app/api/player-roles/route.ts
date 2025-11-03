// src/app/api/player-roles/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Row = Record<string, unknown>;

type Candidate = {
  table: string;
  userCol: string;
  roleCol: string;
};

// Кандидаты-источники (имена жёстко заданы — безопасно для raw SQL)
const CANDIDATES: Candidate[] = [
  { table: 'club_team_player',     userCol: 'user_id',  roleCol: 'player_position' },
  { table: 'tbl_membership',       userCol: 'user_id',  roleCol: 'field_position'  },
  { table: 'tbl_user_achievements',userCol: 'user_id',  roleCol: 'position'        },
  { table: 'users',                userCol: 'player_id',roleCol: 'role'            },
];

// Безопасное приведение числа (MySQL часто отдаёт BigInt)
function toNum(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  return Number(v ?? 0);
}

// Проверка, что таблица существует в текущей БД
async function tableExists(table: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name   = ?`,
    table
  );
  const cnt = toNum(r?.[0]?.cnt);
  return cnt > 0;
}

// Проверка, что колонка существует в таблице
async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name   = ?
        AND column_name  = ?`,
    table,
    column
  );
  const cnt = toNum(r?.[0]?.cnt);
  return cnt > 0;
}

// Есть ли в таблице строки для данного пользователя
async function hasRowsForUser(table: string, userCol: string, userId: number): Promise<boolean> {
  // table/userCol приходят из белого списка CANDIDATES — инъекций нет
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM ${table}
      WHERE ${userCol} = ?
      LIMIT 1`,
    userId
  );
  const cnt = toNum(r?.[0]?.cnt);
  return cnt > 0;
}

// Агрегация по ролям
async function loadRoleCounts(
  table: string,
  userCol: string,
  roleCol: string,
  userId: number
): Promise<{ role: string; count: number }[]> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${roleCol} AS role, COUNT(*) AS cnt
       FROM ${table}
      WHERE ${userCol} = ?
        AND ${roleCol} IS NOT NULL
        AND ${roleCol} <> ''
      GROUP BY ${roleCol}
      ORDER BY cnt DESC`,
    userId
  );

  return (rows ?? []).map((r) => ({
    role: String((r as any).role ?? '').toUpperCase(),
    count: toNum((r as any).cnt),
  }));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = Number(url.searchParams.get('userId'));

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ ok: false, error: 'Bad or missing userId' }, { status: 400 });
    }

    // 1) Ищем подходящий источник
    const viable: Candidate[] = [];
    for (const c of CANDIDATES) {
      if (!(await tableExists(c.table))) continue;
      if (!(await columnExists(c.table, c.userCol))) continue;
      if (!(await columnExists(c.table, c.roleCol))) continue;
      if (!(await hasRowsForUser(c.table, c.userCol, userId))) continue;
      viable.push(c);
    }

    if (viable.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Не найден источник: таблица/колонки отсутствуют или для этого userId нет строк',
          tried: CANDIDATES,
        },
        { status: 404 }
      );
    }

    // 2) Берём первый валидный источник и считаем роли
    const src = viable[0];
    const counts = await loadRoleCounts(src.table, src.userCol, src.roleCol, userId);
    const total = counts.reduce((acc, r) => acc + r.count, 0);

    const withPct = counts.map((r) => ({
      role: r.role,
      count: r.count,
      pct: total ? Math.round((r.count * 10000) / total) / 100 : 0,
    }));

    return NextResponse.json({
      ok: true,
      source: src,
      total,
      roles: withPct, // «сырая правда» по ролям для диагностики
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
