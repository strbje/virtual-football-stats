import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** Конфиги по синонимам колонок */
const USER_COLS = ['user_id', 'userid', 'player_id'];
const MATCH_COLS = ['game_id', 'games_id', 'match_id', 'matches_id'];
const ROLE_TEXT_COLS = ['field_position', 'player_position', 'position', 'position_type', 'short_name', 'code'];
const ROLE_NUM_COLS  = ['skill_position_id', 'position_id', 'pos']; // мэппим через tbl_field_positions

/** Удобный helper на INFO_SCHEMA */
async function columnsOf(table: string) {
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    table
  );
}

/** Сканируем БД на «кандидатов» — таблицы, где есть и user, и match, и роль */
async function findCandidates() {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c.TABLE_NAME   AS tableName,
            SUM(CASE WHEN c.COLUMN_NAME IN (${USER_COLS.map(() => '?').join(',')})  THEN 1 ELSE 0 END) AS hasUser,
            SUM(CASE WHEN c.COLUMN_NAME IN (${MATCH_COLS.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS hasMatch,
            SUM(CASE WHEN c.COLUMN_NAME IN (${ROLE_TEXT_COLS.concat(ROLE_NUM_COLS).map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS hasRole
       FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = DATABASE()
      GROUP BY c.TABLE_NAME
     HAVING hasUser > 0 AND hasMatch > 0 AND hasRole > 0
      ORDER BY (hasRole + hasUser + hasMatch) DESC`
    ,
    ...USER_COLS, ...MATCH_COLS, ...ROLE_TEXT_COLS, ...ROLE_NUM_COLS
  );

  return rows.map(r => r.tableName as string);
}

/** Проверяем, есть ли справочник позиций для расшифровки чисел → «ЦАП/ФРВ…» */
async function fieldPositionsExists() {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_field_positions'`
  );
  return rows.length > 0;
}

/** Пробуем посчитать роли для userId в конкретной таблице */
async function tryCountByTable(table: string, userId: number, hasDict: boolean) {
  const cols = await columnsOf(table);

  const userCol  = cols.find(c => USER_COLS.includes(c.name))?.name;
  const matchCol = cols.find(c => MATCH_COLS.includes(c.name))?.name;
  // роль — сначала текстовая, если нет — числовая
  const roleText = cols.find(c => ROLE_TEXT_COLS.includes(c.name))?.name;
  const roleNum  = cols.find(c => ROLE_NUM_COLS.includes(c.name))?.name;

  if (!userCol || !matchCol || (!roleText && !roleNum)) return null;

  if (roleText) {
    // Текстовая роль сразу
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT UPPER(TRIM(${roleText})) AS role, COUNT(*) AS cnt
         FROM \`${table}\`
        WHERE ${userCol} = ?
        GROUP BY UPPER(TRIM(${roleText}))
        ORDER BY cnt DESC`,
      userId
    );
    return { table, userCol, matchCol, roleCol: roleText, usedDict: false, rows };
  }

  // Числовая роль → пытаемся смэппить на tbl_field_positions
  if (roleNum) {
    if (hasDict) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(UPPER(fp.code), CONCAT('ID:', ${roleNum})) AS role, COUNT(*) AS cnt
           FROM \`${table}\` t
           LEFT JOIN tbl_field_positions fp ON fp.id = t.${roleNum}
          WHERE t.${userCol} = ?
          GROUP BY role
          ORDER BY cnt DESC`,
        userId
      );
      return { table, userCol, matchCol, roleCol: roleNum, usedDict: true, rows };
    } else {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT CONCAT('ID:', ${roleNum}) AS role, COUNT(*) AS cnt
           FROM \`${table}\`
          WHERE ${userCol} = ?
          GROUP BY ${roleNum}
          ORDER BY cnt DESC`,
        userId
      );
      return { table, userCol, matchCol, roleCol: roleNum, usedDict: false, rows };
    }
  }

  return null;
}

/** Публичный GET: /api/player-roles?userId=50734 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = Number(url.searchParams.get('userId') || '');
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: 'Нужен параметр ?userId=NUMBER' }, { status: 400 });
    }

    const candidates = await findCandidates();
    if (candidates.length === 0) {
      return NextResponse.json({ ok: false, error: 'Не нашёл таблиц с (user + match + role)' }, { status: 404 });
    }

    const hasDict = await fieldPositionsExists();

    // Пробуем все кандидаты и собираем успешные ответы
    const results: any[] = [];
    for (const t of candidates) {
      const r = await tryCountByTable(t, userId, hasDict);
      if (r && Array.isArray(r.rows) && r.rows.length) results.push(r);
    }

    if (results.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Кандидаты есть, но по этому userId записей не нашли',
        candidates
      }, { status: 404 });
    }

    // Берём «лучшую» таблицу — с наибольшим числом записей по пользователю
    results.sort((a, b) => (b.rows[0]?.cnt || 0) - (a.rows[0]?.cnt || 0));
    const best = results[0];

    // Готовим удобный вид: totals + проценты
    const total = best.rows.reduce((s: number, r: any) => s + Number(r.cnt || 0), 0);
    const totals = best.rows.map((r: any) => ({
      role: String(r.role || '').toUpperCase(),
      count: Number(r.cnt || 0),
      pct: total ? Math.round((Number(r.cnt || 0) * 100) / total) : 0,
    }));

    return NextResponse.json({
      ok: true,
      used_table: best.table,
      used_user_column: best.userCol,
      used_match_column: best.matchCol,
      used_role_column: best.roleCol,
      used_dict_tbl_field_positions: best.usedDict,
      total_rows_for_user: total,
      totals,           // список ролей с количеством и %
      candidates,       // на всякий случай
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
