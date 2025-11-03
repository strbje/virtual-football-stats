import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Row = Record<string, unknown>;
type Candidate = { table: string; userCol: string; roleCol: string };

const CANDIDATES: Candidate[] = [
  // Часто именно тут хранится «позиция в команде» (но бывает без user_id)
  { table: 'club_team_player_membership', userCol: 'user_id',  roleCol: 'field_position' },
  // Частая связка «пользователь ↔ команда», иногда с позицией
  { table: 'tbl_membership',              userCol: 'user_id',  roleCol: 'field_position' },
  // Карточка игрока в команде
  { table: 'club_team_player',            userCol: 'user_id',  roleCol: 'player_position' },
  // Разные анкеты/достижения — иногда есть поле position
  { table: 'tbl_user_achievements',       userCol: 'user_id',  roleCol: 'position' },
  // В таблице users иногда лежит «текущая роль», если проект так хранит
  { table: 'users',                       userCol: 'player_id',roleCol: 'role' },
];

function toNum(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
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
    table, column
  );
  return toNum(r?.[0]?.cnt) > 0;
}

async function countAllForUser(table: string, userCol: string, userId: number): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${userCol} = ?`,
    userId
  );
  return toNum(r?.[0]?.cnt);
}

async function countWithRoleForUser(table: string, userCol: string, roleCol: string, userId: number): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS cnt
       FROM ${table}
      WHERE ${userCol} = ?
        AND ${roleCol} IS NOT NULL
        AND ${roleCol} <> ''`,
    userId
  );
  return toNum(r?.[0]?.cnt);
}

async function loadRoleCounts(
  table: string, userCol: string, roleCol: string, userId: number
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
  return (rows ?? []).map(r => ({
    role: String((r as any).role ?? '').toUpperCase(),
    count: toNum((r as any).cnt)
  }));
}

async function sampleAny(
  table: string, userCol: string, roleCol: string, userId: number
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
  const url = new URL(req.url);
  const userId = Number(url.searchParams.get('userId'));
  const dbg = url.searchParams.get('debug') === '1';

  // Позволяет вручную проверить любую таблицу без деплоя:
  const overrideTable   = url.searchParams.get('table')   || undefined;
  const overrideUserCol = url.searchParams.get('userCol') || undefined;
  const overrideRoleCol = url.searchParams.get('roleCol') || undefined;

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ ok: false, error: 'Bad or missing userId' }, { status: 400 });
  }

  try {
    const results: any[] = [];

    const toCheck: Candidate[] = overrideTable && overrideUserCol && overrideRoleCol
      ? [{ table: overrideTable, userCol: overrideUserCol, roleCol: overrideRoleCol }]
      : CANDIDATES;

    for (const c of toCheck) {
      const exists = await tableExists(c.table);
      const ucol   = exists && await columnExists(c.table, c.userCol);
      const rcol   = exists && await columnExists(c.table, c.roleCol);

      let total = 0;
      let withRole = 0;
      let sample: Row[] = [];
      let roles: { role: string; count: number }[] = [];

      if (exists && ucol && rcol) {
        total    = await countAllForUser(c.table, c.userCol, userId);
        withRole = await countWithRoleForUser(c.table, c.userCol, c.roleCol, userId);
        sample   = dbg ? await sampleAny(c.table, c.userCol, c.roleCol, userId) : [];
        roles    = withRole > 0 ? await loadRoleCounts(c.table, c.userCol, c.roleCol, userId) : [];
      }

      results.push({
        ...c,
        exists, ucol, rcol,
        totalForUser: total,
        withNonEmptyRole: withRole,
        roles,
        sample
      });
    }

    // Если есть хотя бы один источник с данными — выбираем первый
    const hit = results.find(r => r.withNonEmptyRole > 0) ?? null;

    if (!hit) {
      return NextResponse.json({
        ok: false,
        error: 'Нет строк с ненулевыми ролями для данного userId',
        diag: results
      }, { status: 404 });
    }

    const total = hit.roles.reduce((a: number, r: any) => a + r.count, 0);
    const roles = hit.roles.map((r: any) => ({
      role: r.role,
      count: r.count,
      pct: total ? Math.round((r.count * 10000) / total) / 100 : 0
    }));

    return NextResponse.json({
      ok: true,
      source: { table: hit.table, userCol: hit.userCol, roleCol: hit.roleCol },
      total,
      roles,
      debug_sample: dbg ? hit.sample : undefined
    });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
