// src/lib/roles.ts

import type { RoleCode, RolePercent } from '@/utils/roles';

/** Группы, к которым сводим амплуа */
export type RoleGroup = 'ЦЗ' | 'ВРТ' | 'КЗ' | 'ЦОП' | 'ЦП' | 'КП' | 'ЦАП' | 'ФРВ';
export const GROUP_LABELS: Record<RoleGroup, string> = {
  ФРВ: 'Форвард',
  ЦАП: 'Атакующий полузащитник',
  КП:  'Крайний полузащитник',
  ЦП:  'Центральный полузащитник',
  ЦОП: 'Опорный полузащитник',
  ЦЗ:  'Центральный защитник',
  КЗ:  'Крайний защитник',
  ВРТ: 'Вратарь',
};

/** Маппинг амплуа -> укрупнённая группа */
export const ROLE_TO_GROUP: Record<RoleCode, RoleGroup> = {
  // Защита (центральные)
  ЛЦЗ: 'ЦЗ',
  ЦЗ:  'ЦЗ',
  ПЦЗ: 'ЦЗ',

  // Вратарь
  ВРТ: 'ВРТ',

  // Края защиты
  ЛЗ: 'КЗ',
  ПЗ: 'КЗ',

  // Опорные
  ЛОП: 'ЦОП',
  ЦОП: 'ЦОП',
  ПОП: 'ЦОП',

  // Центр поля
  ЛПЦ: 'ЦП',
  ЦП:  'ЦП',
  ПЦП: 'ЦП',

  // Крылья/полуфланги (укрупняем как «крылья полузащиты»)
  ЛАП: 'КП',
  ПАП: 'КП',
  ЛП:  'КП',
  ПП:  'КП',

  // Атакующий центр
  ЦАП: 'ЦАП',

  // Атака (форварды всех типов)
  ФРВ: 'ФРВ',
  ЦФД: 'ФРВ',
  ЛФД: 'ФРВ',
  ПФД: 'ФРВ',
  ЛФА: 'ФРВ', // добавлено
  ПФА: 'ФРВ', // добавлено
};

export type GroupPercent = { group: RoleGroup; percent: number };

/**
 * Суммируем проценты по ролям в укрупнённые группы.
 * Ожидает массив уже-нормированных процентов (0..100) по RoleCode.
 */
export function groupRolePercents(raw: RolePercent[]): GroupPercent[] {
  const acc = new Map<RoleGroup, number>();

  for (const item of raw) {
    const role = item.role;
    const group = ROLE_TO_GROUP[role];
    if (!group) continue;
    acc.set(group, (acc.get(group) ?? 0) + (item.percent ?? 0));
  }

  return [...acc.entries()]
    .map(([group, percent]) => ({ group, percent }))
    .sort((a, b) => b.percent - a.percent);
}
