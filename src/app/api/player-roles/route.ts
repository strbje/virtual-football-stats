import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Row = Record<string, unknown>;

type Candidate = { table: string; userCol: string; roleCol: string };

const CANDIDATES: Candidate[] = [
  { table: 'club_team_player_membership', userCol: 'user_id',  roleCol: 'field_position' },
  { table: 'tbl_membership',              userCol: 'user_id',  roleCol: 'field_position' },
  { table: 'club_team_player',            userCol: 'user_id',  roleCol: 'player_position' },
  { table: 'tbl_user_achievements',       userCol: 'user_id',  roleCol: 'position' },
  { table: 'users',                       userCol: 'player_id',roleCol: 'role' },
];

function toNum(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  return Number(v ?? 0);
}

async function tableExists(table: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name   = ?`,
    table
  );
  return toNum(r?.[0]?.cnt) > 0;
}

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
  return toNum(r?.[0]?.cnt) > 0;
}

async function hasRowsForUserWithRole(
  table: string,
  userCol: string,
  roleCol: string,
  userId: number
): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM ${table}
      WHERE ${userCol} = ?
        AND ${roleCol} IS NOT NULL
        AND ${roleCol} <> ''
      LIMIT 1`,
    userId
  );
  return toNum(r?.[0]?.cnt) > 0;
}

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

async function sampleRows(
  table: string,
  userCol: string,
  roleCol: string,
  userId: number
): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${userCol} AS user_id, ${roleCol} AS role_val
       FROM ${table}
      WHERE ${userCol} = ?
      ORDER BY 1
      LIMIT 5`,
    userId
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = Number(url.searchParams.get('userId'));
    const wantDebug = url.searchParams.get('debug') === '1';

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ ok: false, error: 'Bad or missing userId' }, { status: 400 });
    }

    const viable: Candidate[] = [];
    for (const c of CANDIDATES) {
      if (!(await tableExists(c.table))) continue;
      if (!(await columnExists(c.table, c.userCol))) continue;
      if (!(await columnExists(c.table, c.roleCol))) continue;
      if (!(await hasRowsForUserWithRole(c.table, c.userCol, c.roleCol, userId))) continue;
      viable.push(c);
    }

    if (viable.length === 0) {
      // для диагностики вернём по каждому кандидату, что именно не так
      const diag = [];
      for (const c of CANDIDATES) {
        const exists = await tableExists(c.table);
        const ucol = exists && (await columnExists(c.table, c.userCol));
        const rcol = exists && (await columnExists(c.table, c.roleCol));
        let hasData = false;
        if (exists && ucol && rcol) {
          hasData = await hasRowsForUserWithRole(c.table, c.userCol, c.roleCol, userId);
        }
        diag.push({ ...c, exists, ucol, rcol, hasData });
      }
      return NextResponse.json(
        { ok: false, error: 'Нет строк с ненулевыми ролями для данного userId', diag },
        { status: 404 }
      );
    }

    const src = viable[0];
    const counts = await loadRoleCounts(src.table, src.userCol, src.roleCol, userId);
    const total = counts.reduce((a, r) => a + r.count, 0);
    const roles = counts.map((r) => ({
      role: r.role,
      count: r.count,
      pct: total ? Math.round((r.count * 10000) / total) / 100 : 0,
    }));

    const payload: any = { ok: true, source: src, total, roles };
    if (wantDebug) {
      payload.debug_sample = await sampleRows(src.table, src.userCol, src.roleCol, userId);
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
