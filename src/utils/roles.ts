// src/utils/roles.ts
export type RoleCode =
  | 'ВРТ'
  | 'ЛЗ' | 'ПЗ'
  | 'ЛОП' | 'ЦОП' | 'ПОП'
  | 'ЦП' | 'ЛПЦ' | 'ПЦП'
  | 'ЛАП' | 'ПАП' | 'ЛП' | 'ПП'
  | 'ЦАП'
  | 'ФРВ' | 'ЦФД' | 'ЛФД' | 'ЛФА' | 'ПФА' | 'ПФД'
  | 'ЛЦЗ' | 'ПЦЗ' | 'ЦЗ';

export type RolePercent = { role: RoleCode; percent: number };

/** Подписи (можешь править нейминг тут) */
export const ROLE_LABELS: Record<RoleCode, string> = {
  ВРТ: 'ВРТ',
  ЛЗ: 'ЛЗ', ПЗ: 'ПЗ',
  ЛОП: 'ЛОП', ЦОП: 'ЦОП', ПОП: 'ПОП',
  ЦП: 'ЦП', ЛПЦ: 'ЛПЦ', ПЦП: 'ПЦП',
  ЛАП: 'ЛАП', ПАП: 'ПАП', ЛП: 'ЛП', ПП: 'ПП',
  ЦАП: 'ЦАП',
  ФРВ: 'ФРВ', ЦФД: 'ЦФД', ЛФД: 'ЛФД', ЛФА: 'ЛФА', ПФА: 'ПФА', ПФД: 'ПФД',
  ЛЦЗ: 'ЛЦЗ', ПЦЗ: 'ПЦЗ', ЦЗ: 'ЦЗ',
};

/** Группа для блока «Распределение амплуа» */
export type RoleGroup = 'ВРТ' | 'КЗ' | 'ЦОП' | 'ЦП' | 'КП' | 'ЦАП' | 'ФРВ' | 'ЦЗ';

export const ROLE_TO_GROUP: Record<RoleCode, RoleGroup> = {
  ВРТ: 'ВРТ',

  ЛЗ: 'КЗ', ПЗ: 'КЗ',

  ЛОП: 'ЦОП', ЦОП: 'ЦОП', ПОП: 'ЦОП',

  ЦП: 'ЦП', ЛПЦ: 'ЦП', ПЦП: 'ЦП',

  ЛАП: 'КП', ПАП: 'КП', ЛП: 'КП', ПП: 'КП',

  ЦАП: 'ЦАП',

  ФРВ: 'ФРВ', ЦФД: 'ФРВ', ЛФД: 'ФРВ', ПФД: 'ФРВ', ЛФА: 'ФРВ', ПФА: 'ФРВ',

  ЛЦЗ: 'ЦЗ', ПЦЗ: 'ЦЗ', ЦЗ: 'ЦЗ',
};

export type GroupBucket = { group: RoleGroup; percent: number };

/** Сумма процентов по группам (нули игнорим) */
export function groupRolePercents(rows: RolePercent[]): GroupBucket[] {
  const acc = new Map<RoleGroup, number>();
  for (const r of rows) {
    if (!r || !r.role) continue;
    if (!r.percent) continue;
    const g = ROLE_TO_GROUP[r.role];
    acc.set(g, (acc.get(g) ?? 0) + r.percent);
  }
  return [...acc.entries()]
    .map(([group, percent]) => ({ group, percent }))
    .sort((a, b) => b.percent - a.percent);
}
