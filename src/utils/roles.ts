// src/utils/roles.ts

/** Коды амплуа (как в БД/логах матчей) */
export type RoleCode =
  | 'ВРТ'
  | 'ЛЗ' | 'ПЗ'
  | 'ЛОП' | 'ЦОП' | 'ПОП'
  | 'ЦП' | 'ЛПЦ' | 'ПЦП'
  | 'ЛАП' | 'ПАП' | 'ЛП' | 'ПП'
  | 'ЦАП'
  | 'ФРВ' | 'ЦФД' | 'ЛФД' | 'ЛФА' | 'ПФА' | 'ПФД'
  | 'ЛЦЗ' | 'ПЦЗ' | 'ЦЗ';

/** Подписи */
export const ROLE_LABELS: Record<RoleCode, string> = {
  ВРТ: 'ВРТ',
  ЛЗ: 'ЛЗ',  ПЗ: 'ПЗ',
  ЛОП: 'ЛОП', ЦОП: 'ЦОП', ПОП: 'ПОП',
  ЦП: 'ЦП',  ЛПЦ: 'ЛПЦ', ПЦП: 'ПЦП',
  ЛАП: 'ЛАП', ПАП: 'ПАП', ЛП: 'ЛП', ПП: 'ПП',
  ЦАП: 'ЦАП',
  ФРВ: 'ФРВ', ЦФД: 'ЦФД', ЛФД: 'ЛФД', ЛФА: 'ЛФА', ПФА: 'ПФА', ПФД: 'ПФД',
  ЛЦЗ: 'ЛЦЗ', ПЦЗ: 'ПЦЗ', ЦЗ: 'ЦЗ',
};

/** Группы */
export type RoleGroup = 'Вратарь' | 'Защита' | 'Полузащита' | 'Атака';
export const GROUP_ORDER: RoleGroup[] = ['Вратарь', 'Защита', 'Полузащита', 'Атака'];

export const ROLE_TO_GROUP: Record<RoleCode, RoleGroup> = {
  ВРТ: 'Вратарь',

  ЦЗ: 'Защита', ЛЦЗ: 'Защита', ПЦЗ: 'Защита',
  ЛЗ: 'Защита',  ПЗ: 'Защита',

  ЛОП: 'Полузащита', ЦОП: 'Полузащита', ПОП: 'Полузащита',
  ЦП: 'Полузащита',  ЛПЦ: 'Полузащита', ПЦП: 'Полузащита',
  ЦАП: 'Полузащита',

  ЛАП: 'Атака', ПАП: 'Атака', ЛП: 'Атака', ПП: 'Атака',
  ФРВ: 'Атака', ЦФД: 'Атака', ЛФД: 'Атака', ЛФА: 'Атака', ПФА: 'Атака', ПФД: 'Атака',
};

/** Для бар-чартов */
export type RoleItem = { label: string; value: number };
export type GroupBucket = RoleItem;

export type RolePercent = { role: RoleCode; percent: number };

/** Лиги */
export type LeagueBucket = { label: string; pct: number };

/** Подсчёт процентов по группам из {role, percent}[] */
export function groupRolePercents(list: RolePercent[]): GroupBucket[] {
  const acc = new Map<RoleGroup, number>();
  for (const it of list) {
    const g = ROLE_TO_GROUP[it.role];
    if (!g) continue;
    acc.set(g, (acc.get(g) ?? 0) + it.percent);
  }
  const res: GroupBucket[] = [];
  for (const g of GROUP_ORDER) {
    const v = acc.get(g);
    if (v == null) continue;
    const clamped = Math.max(0, Math.min(100, v));
    res.push({ label: g, value: Math.round(clamped * 100) / 100 });
  }
  return res;
}

/** Считает доли ролей из массива появлений по матчам (rawRoles) */
export function rolePercentsFromAppearances(rawRoles: RoleCode[]): RolePercent[] {
  if (!rawRoles || rawRoles.length === 0) return [];
  const total = rawRoles.length;
  const counts = new Map<RoleCode, number>();
  for (const r of rawRoles) counts.set(r, (counts.get(r) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([role, c]) => ({ role, percent: +(100 * c / total).toFixed(2) }))
    .sort((a, b) => b.percent - a.percent);
}

/** Определяет «текущее амплуа» по последним N матчам */
export function currentRoleFromLastN(rawRoles: RoleCode[], lastN = 30): RoleCode | null {
  if (!rawRoles || rawRoles.length === 0) return null;
  const take = rawRoles.slice(-lastN);
  const counts = new Map<RoleCode, number>();
  for (const r of take) counts.set(r, (counts.get(r) ?? 0) + 1);
  let best: RoleCode | null = null;
  let bestCnt = -1;
  for (const [role, cnt] of counts) {
    if (cnt > bestCnt) { best = role; bestCnt = cnt; }
  }
  return best;
}

/** Нормализация лиг из {label, percent}[] */
export function toLeagueBuckets(list: { label: string; percent: number }[]): LeagueBucket[] {
  return (list ?? []).map(x => ({ label: x.label, pct: Math.max(0, Math.min(100, x.percent)) }));
}

/** Порядок ролей для тепловой (все ролики, включая ФРВ) */
export const HEATMAP_ROLES_ORDER: RoleCode[] = [
  // атака (верх)
  'ЛФА','ЦФД','ПФА','ЛФД','ФРВ','ПФД',
  // полузащита (центр)
  'ЛАП','ЦАП','ПАП','ЛП','ЦП','ПП','ЛОП','ЦОП','ПОП',
  // защита (низ)
  'ЛЗ','ЛЦЗ','ЦЗ','ПЦЗ','ПЗ',
  // вратарь
  'ВРТ',
];
