// src/lib/roles.ts
// Единая типизация и группировка амплуа (короткие коды → агрегированные группы)

export type RoleCode =
  // Вратарь
  | 'ВРТ'
  // Защита
  | 'ЛЗ' | 'ПЗ'
  | 'ЛЦЗ' | 'ЦЗ' | 'ПЦЗ'
  // Опорная/центр
  | 'ЛОП' | 'ЦОП' | 'ПОП'
  | 'ЛЦП' | 'ЦП' | 'ПЦП'
  // Край и «десятка»
  | 'ЛП' | 'ПП'
  | 'ЛАП' | 'ЦАП' | 'ПАП'
  // Форварды (включая фланговых и центральных)
  | 'ФРВ' | 'ЦФД' | 'ЛФД' | 'ПФД' | 'ЛФА' | 'ПФА';

export type RoleGroup =
  | 'FORWARD'
  | 'ATT_MID'
  | 'WIDE_MID'
  | 'CENT_MID'
  | 'DEF_MID'
  | 'FULLBACK'
  | 'CENTER_BACK'
  | 'GOALKEEPER';

export const GROUP_LABELS: Record<RoleGroup, string> = {
  FORWARD:      'Форвард',
  ATT_MID:      'Атакующий полузащитник',
  WIDE_MID:     'Крайний полузащитник',
  CENT_MID:     'Центральный полузащитник',
  DEF_MID:      'Опорный полузащитник',
  FULLBACK:     'Крайний защитник',
  CENTER_BACK:  'Центральный защитник',
  GOALKEEPER:   'Вратарь',
};

// Фиксированный порядок строк в секции
export const GROUP_ORDER: RoleGroup[] = [
  'FORWARD',
  'ATT_MID',
  'WIDE_MID',
  'CENT_MID',
  'DEF_MID',
  'FULLBACK',
  'CENTER_BACK',
  'GOALKEEPER',
];

// Карта: короткая роль → агрегированная группа
export const ROLE_TO_GROUP: Record<RoleCode, RoleGroup> = {
  // Вратарь
  'ВРТ': 'GOALKEEPER',

  // Крайние защитники
  'ЛЗ': 'FULLBACK', 'ПЗ': 'FULLBACK',

  // Центральные защитники
  'ЛЦЗ': 'CENTER_BACK', 'ЦЗ': 'CENTER_BACK', 'ПЦЗ': 'CENTER_BACK',

  // Опорные
  'ЛОП': 'DEF_MID', 'ЦОП': 'DEF_MID', 'ПОП': 'DEF_MID',

  // Центральные полузащитники
  'ЛЦП': 'CENT_MID', 'ЦП': 'CENT_MID', 'ПЦП': 'CENT_MID',

  // Крайние полузащитники
  'ЛП': 'WIDE_MID', 'ПП': 'WIDE_MID',

  // Атакующая тройка полузащиты
  'ЛАП': 'ATT_MID', 'ЦАП': 'ATT_MID', 'ПАП': 'ATT_MID',

  // Форварды (включая фланговых)
  'ФРВ': 'FORWARD', 'ЦФД': 'FORWARD',
  'ЛФД': 'FORWARD', 'ПФД': 'FORWARD',
  'ЛФА': 'FORWARD', 'ПФА': 'FORWARD',
};

export type RolePercent = {
  role: string;    // короткий код, например 'ЦАП'
  percent: number; // доля (0..100); может быть не нормирована суммарно
};

export type GroupPercent = {
  group: RoleGroup;
  percent: number; // 0..100 после нормализации
};

/**
 * Группирует сырые проценты по коротким ролям в агрегированные группы.
 * - неизвестные коды и нулевые доли пропускаем;
 * - суммируем по группе;
 * - если входная сумма ≠ 100 — мягко нормализуем к 100.
 */
export function groupRolePercents(raw: RolePercent[]): GroupPercent[] {
  // Собираем суммы по группам
  const sums = new Map<RoleGroup, number>();
  let inputSum = 0;

  for (const r of raw ?? []) {
    const code = (r.role ?? '').toUpperCase().trim() as RoleCode;
    const val = Number(r.percent ?? 0);
    if (!code || !isFinite(val) || val <= 0) continue;

    const group = ROLE_TO_GROUP[code];
    if (!group) continue;

    sums.set(group, (sums.get(group) ?? 0) + val);
    inputSum += val;
  }

  // Если совсем пусто — вернём нули по порядку
  if (sums.size === 0) {
    return GROUP_ORDER.map((g) => ({ group: g, percent: 0 }));
  }

  // Нормализация (чтобы полосы сходились к 100% визуально)
  const norm = inputSum > 0 ? (100 / inputSum) : 1;

  const result = GROUP_ORDER.map((g) => ({
    group: g,
    percent: round1((sums.get(g) ?? 0) * norm),
  }));

  // Из-за округлений сумма может быть 99/101 — это нормально.
  return result;
}

function round1(x: number) {
  // Округление до целого (как на макете), но не даём уйти за [0,100]
  const v = Math.round(x);
  return Math.max(0, Math.min(100, v));
}
