// Группировка амплуа — как ты просил
export const ROLE_TO_GROUP: Record<string, 'ЦЗ'|'ВРТ'|'КЗ'|'ЦОП'|'ЦП'|'КП'|'ЦАП'|'ФРВ'> = {
  // Центр. защитники
  'ЦЗ':'ЦЗ','ЛЦЗ':'ЦЗ','ПЦЗ':'ЦЗ',
  // Вратарь
  'ВРТ':'ВРТ',
  // Крайние защитники
  'КЗ':'КЗ','ЛЗ':'КЗ','ПЗ':'КЗ',
  // Опорники
  'ЦОП':'ЦОП','ЛОП':'ЦОП','ПОП':'ЦОП',
  // Центр поля
  'ЦП':'ЦП','ЛПЦ':'ЦП','ПЦП':'ЦП',
  // Крайние полузащитники / вингеры
  'КП':'КП','ЛАП':'КП','ПАП':'КП','ЛП':'КП','ПП':'КП',
  // Под нападающим
  'ЦАП':'ЦАП',
  // Форварды
  'ФРВ':'ФРВ','ЦФД':'ФРВ','ЛФД':'ФРВ','ПФД':'ФРВ',
};

// Удобные типы
export type RolePercent = { role: string; percent: number };
export type GroupPercent = { group: keyof typeof ROLE_TO_GROUP | 'ВРТ' | 'ЦЗ' | 'КЗ' | 'ЦОП' | 'ЦП' | 'КП' | 'ЦАП' | 'ФРВ'; percent: number };

// Агрегация «сырых» процентов по ролям в группы
export function groupRolePercents(raw: RolePercent[]): GroupPercent[] {
  const acc: Record<string, number> = {};
  for (const { role, percent } of raw) {
    const group = ROLE_TO_GROUP[role] ?? ROLE_TO_GROUP[role.toUpperCase()];
    if (!group) continue; // неизвестные роли игнорируем
    acc[group] = (acc[group] ?? 0) + percent;
  }
  return Object.entries(acc)
    .map(([group, percent]) => ({ group: group as GroupPercent['group'], percent }))
    .sort((a,b) => b.percent - a.percent);
}
