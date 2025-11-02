'use client';

import React from 'react';
import type { RolePercent, RoleCode } from '@/utils/roles';
import { ROLE_TO_GROUP, GROUP_LABELS, type RoleGroup } from '@/lib/roles';

// Фиксированный порядок групп (то, что должно быть на экране)
const GROUP_ORDER: RoleGroup[] = ['ФРВ', 'ЦАП', 'КП', 'ЦП', 'ЦОП', 'ЦЗ', 'КЗ', 'ВРТ'];

// Хелпер для подписей групп
const groupLabel = (g: RoleGroup) => GROUP_LABELS[g];

type Props = { data: RolePercent[] };

export default function RoleDistributionSection({ data }: Props) {
  // Аккумулируем проценты по укрупнённым группам
  const acc = new Map<RoleGroup, number>();

  for (const item of data) {
    const role = (item.role || '').toUpperCase() as RoleCode; // нормализация регистра
    const group = ROLE_TO_GROUP[role];
    if (!group) continue;
    acc.set(group, (acc.get(group) ?? 0) + Number(item.percent ?? 0));
  }

  // Строим строки в нужном порядке и отсекаем нули
  const rows: { group: RoleGroup; percent: number }[] = GROUP_ORDER
    .map((g) => ({ group: g, percent: Math.round(acc.get(g) ?? 0) }))
    .filter((r) => r.percent > 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border p-4 text-sm text-gray-500">
        Нет данных по амплуа за выбранный период
      </div>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.percent));

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-semibold mb-3">Распределение по амплуа</h3>
      <div className="space-y-2">
        {rows.map((r) => {
          const width = Math.max(6, Math.round((r.percent / max) * 100));
          return (
            <div key={r.group} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-sm text-gray-700">
                {groupLabel(r.group)}
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                  }}
                />
              </div>
              <div className="w-10 shrink-0 text-right text-sm font-medium">
                {r.percent}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
