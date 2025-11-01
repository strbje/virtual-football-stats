// src/lib/roles.ts
export const ROLE_TO_GROUP: Record<string,'ЦЗ'|'ВРТ'|'КЗ'|'ЦОП'|'ЦП'|'КП'|'ЦАП'|'ФРВ'> = {
  'ЦЗ':'ЦЗ','ЛЦЗ':'ЦЗ','ПЦЗ':'ЦЗ',
  'ВРТ':'ВРТ',
  'КЗ':'КЗ','ЛЗ':'КЗ','ПЗ':'КЗ',
  'ЦОП':'ЦОП','ЛОП':'ЦОП','ПОП':'ЦОП',
  'ЦП':'ЦП','ЛПЦ':'ЦП','ПЦП':'ЦП',
  'КП':'КП','ЛАП':'КП','ПАП':'КП','ЛП':'КП','ПП':'КП',
  'ЦАП':'ЦАП',
  'ФРВ':'ФРВ','ЦФД':'ФРВ','ЛФД':'ФРВ','ПФД':'ФРВ',
};

export type RolePercent = { role: string; percent: number };
export type GroupPercent = { group: keyof typeof ROLE_TO_GROUP; percent: number };

export function groupRolePercents(raw: RolePercent[]): GroupPercent[] {
  const acc: Record<string, number> = {};
  for (const item of raw) {
    const key = (item.role || '').toUpperCase();
    const group = ROLE_TO_GROUP[key];
    if (!group) continue;
    acc[group] = (acc[group] ?? 0) + (item.percent ?? 0);
  }
  return Object.entries(acc)
    .map(([group, percent]) => ({ group: group as GroupPercent['group'], percent }))
    .sort((a,b) => b.percent - a.percent);
}
