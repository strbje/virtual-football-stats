// src/app/api/player-roles/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** Безопасная JSON-сериализация: конвертим BigInt в Number рекурсивно */
function jsonSafe<T>(v: T): T {
  if (typeof v === 'bigint') return Number(v) as unknown as T;
  if (Array.isArray(v)) return (v as unknown as any[]).map(jsonSafe) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = jsonSafe(val);
    return out as T;
  }
  return v;
}

/** Кандидаты названий колонок */
const USER_ID_CANDIDATES = [
  'user_id',
  'userid',
  'player_id',
  'profile_id',
];

const ROLE_COL_CANDIDATES = [
  // самые вероятные
  'position_short_name',
  'field_position',
  'player_position',
  'pos_short',
  'pos_code',
  'position',
  'role',
  'pos',
];

/** Вспомогалка: экранирование имён таблиц/колонок для MySQL */
const qId = (s: string) => `\`${s.replace(/`/g, '``')}\``;

/**
 * Находит кандидатов-таблиц в текущей БД, у которых есть
 *  — колонка юзера из USER_ID_CANDIDATES
 *  — колонка роли из ROLE_COL_CANDIDATES
 */
async function findCandidateTables() {
  type Row = { tableName: string; columnName: string };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
  `;

  // Соберём карту: table -> set(columns)
  const byTable = new Map<string, Set<string>>();
  for (const r of rows) {
    const t = r.tableName;
    const c = r.columnName.toLowerCase();
    if (!byTable.has(t)) byTable.set(t, new Set());
    byTable.get(t)!.add(c);
  }

  // Выберем те таблицы, где есть хотя бы по одному совпадению из списков
  const candidates: { table: string; userCol: string; roleCol: string }[] = [];
  for (const [table, cols] of byTable.entries()) {
    const foundUser = USER_ID_CANDIDATES.find((c) => cols.has(c));
    const foundRole = ROLE_COL_CANDIDATES.find((c) => cols.has(c));
    if (foundUser && foundRole) {
      candidates.push({ table, userCol: foundUser, roleCol: foundRole });
    }
  }

  // Небольшая эвристика: поднимем повыше таблицы, где название похоже на матч/игру/статистику
  const score = (t: string) => {
    let s = 0;
    const tl = t.toLowerCase();
    if (/\bmatch/.test(tl)) s += 3;
    if (/\bgame/.test(tl) || /\bgames/.test(tl)) s += 2;
    if (/\bstats?/.test(tl)) s += 1;
    if (/participants?/.test(tl)) s += 2;
    if (/player/.test(tl)) s += 1;
    return s;
  };

  candidates.sort((a, b) => score(b.table) - score(a.table));
  return candidates;
}

/** Пробуем агрегировать роли для одной таблицы (если 0 строк — значит не она) */
async function tryAggregateFor(
  userId: string,
  table: string,
  userCol: string,
  roleCol: string
) {
  // Собираем SQL динамически (имена как идентификаторы — экранированы, значение userId — параметр)
  const sql = `
    SELECT UPPER(CAST(${qId(roleCol)} AS CHAR)) AS role, COUNT(*) AS cnt
    FROM ${qId(table)}
    WHERE ${qId(userCol)} = ?
       OR CAST(${qId(userCol)} AS CHAR) = ?
    GROUP BY UPPER(CAST(${qId(roleCol)} AS CHAR))
    ORDER BY cnt DESC
    LIMIT 200
  `;
  const rows = await prisma.$queryRawUnsafe<Array<{ role: string | null; cnt: bigint }>>(sql, userId, userId);
  const data = rows
    .map(r => ({ role: (r.role ?? '').toUpperCase(), count: Number(r.cnt) }))
    .filter(r => r.role && r.count > 0);

  return data;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = (searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Missing userId' }, { status: 400 });
    }

    // 1) Находим кандидатов-таблиц в текущей схеме
    const candidates = await findCandidateTables();
    if (candidates.length === 0) {
      return NextResponse.json({ ok: false, error: 'Не найдено ни одной таблицы-кандидата с user_id и role колонками' }, { status: 404 });
    }

    // 2) Идём по кандидатам и берём первый, где есть ненулевая агрегация
    for (const c of candidates) {
      try {
        const data = await tryAggregateFor(userId, c.table, c.userCol, c.roleCol);
        if (data.length > 0) {
          // нашли живой источник
          const body = jsonSafe({
            ok: true,
            userId,
            source: {
              table: c.table,
              userCol: c.userCol,
              roleCol: c.roleCol,
            },
            data, // [{role:'ЦАП', count: N}, ...] — "сырая правда" из БД
          });
          return new Response(JSON.stringify(body), {
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
          });
        }
      } catch (e) {
        // молча пробуем следующего кандидата
      }
    }

    // 3) Если до сюда дошли — ни один кандидат не дал строк
    return NextResponse.json({
      ok: false,
      error: 'Кандидаты найдены, но ни одна таблица не вернула строки для этого userId',
      candidates,
    }, { status: 404 });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
