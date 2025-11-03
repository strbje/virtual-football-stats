// src/app/api/player-roles/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Диагностический эндпоинт:
 *   GET /api/player-roles?userId=50734
 *
 * Что делает:
 *  1) Ищет в INFORMATION_SCHEMA.COLUMNS все таблицы, где есть колонка пользователя
 *     (user_id | player_id | userid) И одновременно есть колонка роли/позиции
 *     (player_position | field_position | position | role | pos | position_short_name | short_name).
 *     Из них берём только текстовые (varchar/char/text), чтобы избежать id-словарей.
 *  2) Для каждого кандидата пробует выбрать строки по userId и посчитать распределение.
 *  3) Возвращает JSON: кто дал непустой результат, какие «сырые» значения позиций встретились.
 *
 * Ничего в прод-логике не ломает. Это чисто debug-API.
 */

type Candidate = { table: string; userCol: string; roleCol: string };

const USER_COLS = ['user_id', 'player_id', 'userid'];
const ROLE_COLS = [
  'player_position',
  'field_position',
  'position',
  'role',
  'pos',
  'position_short_name',
  'short_name',
];

const SAFE_IDENT = /^[A-Za-z0-9_]+$/;

function isSafeIdent(s: string) {
  return SAFE_IDENT.test(s);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdStr = searchParams.get('userId');
    const userId = userIdStr ? Number(userIdStr) : NaN;

    if (!Number.isFinite(userId)) {
      return NextResponse.json(
        { ok: false, error: 'Укажи целочисленный ?userId=...' },
        { status: 400 },
      );
    }

    // 1) Ищем кандидатов в information_schema
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT c1.table_name   AS tableName,
             cUser.column_name AS userCol,
             cRole.column_name AS roleCol
      FROM information_schema.tables       t
      JOIN information_schema.columns      cUser
        ON cUser.table_schema = t.table_schema
       AND cUser.table_name   = t.table_name
      JOIN information_schema.columns      cRole
        ON cRole.table_schema = t.table_schema
       AND cRole.table_name   = t.table_name
      JOIN information_schema.columns      c1
        ON c1.table_schema = t.table_schema
       AND c1.table_name   = t.table_name
      WHERE t.table_schema = DATABASE()
        -- колонки пользователя
        AND cUser.column_name IN (${USER_COLS.map((c) => `'${c}'`).join(',')})
        -- колонки роли/позиции (только текстовые)
        AND cRole.column_name IN (${ROLE_COLS.map((c) => `'${c}'`).join(',')})
        AND (cRole.data_type IN ('varchar','char','text'))
        -- просто чтобы таблица не была view-системой
        AND t.table_type = 'BASE TABLE'
      GROUP BY c1.table_name, cUser.column_name, cRole.column_name
      ORDER BY c1.table_name
    `)) as Array<{
      tableName: string;
      userCol: string;
      roleCol: string;
    }>;

    const candidates: Candidate[] = [];
    for (const r of rows) {
      if (isSafeIdent(r.tableName) && isSafeIdent(r.userCol) && isSafeIdent(r.roleCol)) {
        candidates.push({ table: r.tableName, userCol: r.userCol, roleCol: r.roleCol });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Не нашёл ни одной таблицы, где одновременно есть user_id|player_id|userid и текстовая колонка позиции',
        },
        { status: 404 },
      );
    }

    // 2) Для каждого кандидата пробуем выбрать по userId
    const nonEmpty: Array<{
      table: string;
      userCol: string;
      roleCol: string;
      sample: Array<{ role: string | null }>;
      counts: Array<{ role: string; count: number }>;
    }> = [];

    for (const c of candidates) {
      // Собираем безопасный сырой запрос: биндим только userId; имена таблицы/колонок — проверены regex.
      const sqlSample = `
        SELECT ${c.roleCol} AS role
        FROM   ${c.table}
        WHERE  ${c.userCol} = ?
          AND  ${c.roleCol} IS NOT NULL
        LIMIT 50
      `;
      const sample = (await prisma.$queryRawUnsafe(sqlSample, userId)) as Array<{ role: any }>;

      if (!sample || sample.length === 0) continue;

      // Считаем частоты по «сырым» значениям (без маппинга — хотим увидеть правду)
      const freq = new Map<string, number>();
      for (const r of sample) {
        const v = r.role;
        if (v == null) continue;
        const key = String(v).trim();
        if (!key) continue;
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }

      if (freq.size === 0) continue;

      nonEmpty.push({
        table: c.table,
        userCol: c.userCol,
        roleCol: c.roleCol,
        sample: sample.map((s) => ({ role: s.role == null ? null : String(s.role) })),
        counts: Array.from(freq.entries())
          .map(([role, count]) => ({ role, count }))
          .sort((a, b) => b.count - a.count),
      });
    }

    if (nonEmpty.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Кандидаты найдены, но ни одна таблица не вернула строки для этого userId (или все роли NULL/пустые)',
          candidates,
        },
        { status: 404 },
      );
    }

    // 3) Возвращаем, что реально наполнилось
    return NextResponse.json({ ok: true, userId, hits: nonEmpty }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
