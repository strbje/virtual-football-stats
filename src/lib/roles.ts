// src/lib/roles.ts
// Единая схема ролей, групп и координат на поле.
// Важно: распределение НЕ включает матчи национальных сборных (ЧМ/ЧЕ).

export type RoleCode =
  | 'ВРТ'
  | 'ЛЗ' | 'ПЗ'
  | 'ЛЦЗ' | 'ЦЗ' | 'ПЦЗ'
  | 'ЛОП' | 'ЦОП' | 'ПОП'
  | 'ЛП' | 'ЛЦП' | 'ЦП' | 'ПЦП' | 'ПП'
  | 'ЛАП' | 'ЦАП' | 'ПАП'
  | 'ЛФА' | 'ЛФД' | 'ЦФД' | 'ПФД' | 'ПФА' | 'ФРВ';

export type RolePercent = { role: string; percent: number };

export type RoleGroup =
  | 'FW'   // форварды
  | 'AM'   // атакующие ПЗ
  | 'WM'   // крайние ПЗ
  | 'CM'   // центральные ПЗ
  | 'DM'   // опорники
  | 'FB'   // крайние защитники
  | 'CB'   // центральные защитники
  | 'GK';  // вратарь

export const GROUP_LABELS: Record<RoleGroup, string> = {
  FW: 'Форвард',
  AM: 'Атакующий полузащитник',
  WM: 'Крайний полузащитник',
  CM: 'Центральный полузащитник',
  DM: 'Опорный полузащитник',
  FB: 'Крайний защитник',
  CB: 'Центральный защитник',
  GK: 'Вратарь',
};

// Маппинг короткой роли → группа
export const ROLE_TO_GROUP: Record<RoleCode, RoleGroup> = {
  // GK
  ВРТ: 'GK',

  // Defence
  ЛЗ: 'FB', ПЗ: 'FB',
  ЛЦЗ: 'CB', ЦЗ: 'CB', ПЦЗ: 'CB',

  // DM
  ЛОП: 'DM', ЦОП: 'DM', ПОП: 'DM',

  // Mid
  ЛП: 'WM', ПП: 'WM',
  ЛЦП: 'CM', ЦП: 'CM', ПЦП: 'CM',

  // AM (полузащита)
  ЛАП: 'AM', ЦАП: 'AM', ПАП: 'AM',

  // Forwards (включая ЛФА/ПФА)
  ЛФА: 'FW', ЛФД: 'FW', ЦФД: 'FW', ПФД: 'FW', ПФА: 'FW', ФРВ: 'FW',
};

// Координаты бабблов на схеме поля
export const ROLE_COORDS: Record<RoleCode, { x: number; y: number }> = {
  // GK
  ВРТ: { x: 50, y: 90 },

  // Defence
  ЛЗ: { x: 28, y: 74 }, ЛЦЗ: { x: 42, y: 74 }, ЦЗ: { x: 50, y: 74 }, ПЦЗ: { x: 58, y: 74 }, ПЗ: { x: 72, y: 74 },

  // DM
  ЛОП: { x: 42, y: 58 }, ЦОП: { x: 50, y: 60 }, ПОП: { x: 58, y: 58 },

  // Mid
  ЛП: { x: 30, y: 44 }, ЛЦП: { x: 42, y: 50 }, ЦП: { x: 50, y: 50 }, ПЦП: { x: 58, y: 50 }, ПП: { x: 70, y: 44 },

  // AM
  ЛАП: { x: 38, y: 28 }, ЦАП: { x: 50, y: 30 }, ПАП: { x: 62, y: 28 },

  // Forwards (wide forwards добавил ЛФА/ПФА)
  ЛФД: { x: 32, y: 18 }, ЛФА: { x: 38, y: 20 },
  ЦФД: { x: 50, y: 18 }, ФРВ: { x: 50, y: 14 },
  ПФА: { x: 62, y: 20 }, ПФД: { x: 68, y: 18 },
};

// --- Утилиты ---

export function normalizeRolePercents(raw: RolePercent[]): Map<RoleCode, number> {
  const acc = new Map<RoleCode, number>();
  for (const r of raw) {
    const code = (r.role ?? '').toUpperCase().trim() as RoleCode;
    if (!code) continue;
    const val = Number(r.percent ?? 0);
    acc.set(code, (acc.get(code) ?? 0) + val);
  }
  return acc;
}

export type GroupedPercent = { group: RoleGroup; percent: number };

export function groupRolePercents(raw: RolePercent[]): GroupedPercent[] {
  const byRole = normalizeRolePercents(raw);
  const byGroup = new Map<RoleGroup, number>();

  byRole.forEach((pct, role) => {
    const group = ROLE_TO_GROUP[role];
    if (!group) return;
    byGroup.set(group, (byGroup.get(group) ?? 0) + pct);
  });

  return (Object.keys(GROUP_LABELS) as RoleGroup[]).map((g) => ({
    group: g,
    percent: byGroup.get(g) ?? 0,
  }));
}
