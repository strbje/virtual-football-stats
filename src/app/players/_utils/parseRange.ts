// src/app/players/_utils/parseRange.ts

export type DateRange = {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Принимает строку диапазона дат из инпута:
 * - "2025-09-01:2025-09-30"  (наш формат)
 * - "2025-09-01 to 2025-09-30" (иногда так возвращают пикеры)
 * - "2025-09-01" (один день)
 * Возвращает нормализованный объект { from, to } (оба в YYYY-MM-DD) либо пустой объект.
 */
export function parseRange(input?: string | null): DateRange {
  if (!input) return {};
  const s = String(input).trim();
  let from: string | undefined;
  let to: string | undefined;

  if (s.includes(':')) {
    const [a, b] = s.split(':', 2).map(x => x.trim());
    if (a && ISO.test(a)) from = a;
    if (b && ISO.test(b)) to = b;
  } else if (s.includes(' to ')) {
    const [a, b] = s.split(' to ', 2).map(x => x.trim());
    if (a && ISO.test(a)) from = a;
    if (b && ISO.test(b)) to = b;
  } else if (ISO.test(s)) {
    from = s;
    to = s;
  }

  return { from, to };
}

/**
 * Вспомогалка для SQL-фильтра по UNIX timestamp колонке.
 * column — имя колонки c UNIX timestamp (по твоим запросам это tm.timestamp).
 * Возвращает кусок SQL с плейсхолдерами и массив значений.
 */
export function makeTimestampWhere(
  range: DateRange,
  column = 'tm.timestamp'
): { sql: string; params: any[] } {
  const params: any[] = [];
  let sql = '';

  if (range.from) {
    // начало дня 00:00:00
    sql += ` AND ${column} >= UNIX_TIMESTAMP(CONCAT(?, ' 00:00:00'))`;
    params.push(range.from);
  }
  if (range.to) {
    // конец дня 23:59:59
    sql += ` AND ${column} <= UNIX_TIMESTAMP(CONCAT(?, ' 23:59:59'))`;
    params.push(range.to);
  }
  return { sql, params };
}
