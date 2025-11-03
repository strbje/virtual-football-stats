import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/player-roles?userId=50734
 *
 * Диагност:
 *  - Ищет таблицы с (user_id|player_id|userid) + [текстовой ролью] И/ИЛИ [+ FK на tbl_field_positions(id)].
 *  - Для текстовых — берёт значения напрямую.
 *  - Для FK — делает JOIN на tbl_field_positions и берёт code.
 *  - Возвращает, какие таблицы реально отдали строки по userId, плюс сэмплы и частоты.
 */

type Hit = {
  table: string;
  userCol: string;
  roleCol: string;      // текстовая роль ИЛИ id-колонка (для FK варианта)
  via: 'text' | 'fk';
  sample: Array<{ role: string | null }>;
  counts: Array<{ role: string; count: number }>;
};

const USER_COLS = ['user_id', 'player_id', 'userid'];
const TEXT_ROLE_COLS = [
  'player_position', 'field_position', 'position',
  'role', 'pos', 'position_short_name', 'short_name'
];
const ID_ROLE_COLS = [
  'skill_position_id', 'position_id', 'field_position_id', 'skill_position'
];

const SAFE_IDENT = /^[A-Za-z0-9_]+$/;
const isSafe = (s: string) => SAFE_IDENT.test(s);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = Number(searchParams.get('userId'));
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: 'Укажи ?userId=<число>' }, { status: 400 });
    }

    // Есть ли вообще справочник позиций?
    const fpExists = await hasFieldPositions();

    // 1) Кандидаты с ТЕКСТОВОЙ ролью
    const textCandidates = await prisma.$queryRawUnsafe<{
      tableName: string; userCol: string; roleCol: string;
    }[]>(`
      SELECT cu.table_name   AS tableName,
             cu.column_name  AS userCol,
             cr.column_name  AS roleCol
      FROM information_schema.columns cu
      JOIN information_schema.columns cr
        ON cr.table_schema = cu.table_schema
       AND cr.table_name   = cu.table_name
      JOIN information_schema.tables t
        ON t.table_schema = cu.table_schema
       AND t.table_name   = cu.table_name
      WHERE cu.table_schema = DATABASE()
        AND cu.column_name IN (${USER_COLS.map(s => `'${s}'`).join(',')})
        AND cr.column_name IN (${TEXT_ROLE_COLS.map(s => `'${s}'`).join(',')})
        AND cr.data_type IN ('varchar','char','text')
        AND t.table_type = 'BASE TABLE'
      GROUP BY cu.table_name, cu.column_name, cr.column_name
      ORDER BY cu.table_name
    `);

    // 2) Кандидаты с ID-колонкой роли (FK на tbl_field_positions)
    const idCandidates = fpExists ? await prisma.$queryRawUnsafe<{
      tableName: string; userCol: string; roleCol: string;
    }[]>(`
      SELECT cu.table_name   AS tableName,
             cu.column_name  AS userCol,
             cr.column_name  AS roleCol
      FROM information_schema.columns cu
      JOIN information_schema.columns cr
        ON cr.table_schema = cu.table_schema
       AND cr.table_name   = cu.table_name
      JOIN information_schema.tables t
        ON t.table_schema = cu.table_schema
       AND t.table_name   = cu.table_name
      WHERE cu.table_schema = DATABASE()
        AND cu.column_name IN (${USER_COLS.map(s => `'${s}'`).join(',')})
        AND cr.column_name IN (${ID_ROLE_COLS.map(s => `'${s}'`).join(',')})
        AND cr.data_type IN ('int','bigint','mediumint','smallint','tinyint')
        AND t.table_type = 'BASE TABLE'
      GROUP BY cu.table_name, cu.column_name, cr.column_name
      ORDER BY cu.table_name
    `) : [] : [];

    // Проверяем кандидатов и собираем результаты
    const hits: Hit[] = [];

    // Текстовые
    for (const c of textCandidates) {
      if (!isSafe(c.tableName) || !isSafe(c.userCol) || !isSafe(c.roleCol)) continue;

      const sample = await prisma.$queryRawUnsafe<{ role: any }[]>(
        `SELECT ${c.roleCol} AS role
           FROM ${c.tableName}
          WHERE ${c.userCol} = ?
            AND ${c.roleCol} IS NOT NULL
          LIMIT 50`, userId
      );
      if (!sample?.length) continue;

      const freq = countFreq(sample.map(r => (r.role == null ? null : String(r.role).trim())).filter(Boolean) as string[]);
      if (!freq.length) continue;

      hits.push({
        table: c.tableName,
        userCol: c.userCol,
        roleCol: c.roleCol,
        via: 'text',
        sample: sample.map(s => ({ role: s.role == null ? null : String(s.role) })),
        counts: freq
      });
    }

    // Через FK на tbl_field_positions
    for (const c of idCandidates) {
      if (!isSafe(c.tableName) || !isSafe(c.userCol) || !isSafe(c.roleCol)) continue;

      // Берём code из справочника
      const sample = await prisma.$queryRawUnsafe<{ role: any }[]>(
        `SELECT fp.code AS role
           FROM ${c.tableName} t
           JOIN tbl_field_positions fp ON fp.id = t.${c.roleCol}
          WHERE t.${c.userCol} = ?
            AND t.${c.roleCol} IS NOT NULL
          LIMIT 50`, userId
      );
      if (!sample?.length) continue;

      const freq = countFreq(sample.map(r => (r.role == null ? null : String(r.role).trim())).filter(Boolean) as string[]);
      if (!freq.length) continue;

      hits.push({
        table: c.tableName,
        userCol: c.userCol,
        roleCol: c.roleCol,
        via: 'fk',
        sample: sample.map(s => ({ role: s.role == null ? null : String(s.role) })),
        counts: freq
      });
    }

    if (!hits.length) {
      return NextResponse.json({
        ok: false,
        error: 'Кандидаты найдены, но ни одна таблица не вернула строки для этого userId (или роли пустые/NULL).',
        candidates: [
          ...textCandidates.map(c => ({ table: c.tableName, userCol: c.userCol, roleCol: c.roleCol, via: 'text' })),
          ...idCandidates.map(c => ({ table: c.tableName, userCol: c.userCol, roleCol: c.roleCol, via: 'fk' })),
        ],
        fpExists
      }, { status: 404 });
    }

    return NextResponse.json({ ok: true, userId, fpExists, hits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

function countFreq(values: string[]) {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);
}

async function hasFieldPositions() {
  const r = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name   = 'tbl_field_positions'
        AND table_type   = 'BASE TABLE'`
  );
  const cnt = r?.[0]?.cnt ?? 0n;
  return Number(cnt) > 0;
}
