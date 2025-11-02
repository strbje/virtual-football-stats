// src/components/players/RoleDistributionSection.tsx
'use client';

import React from 'react';
import { type RolePercent, ROLE_LABELS } from '@/utils/roles';

type Props = { data: RolePercent[] };

export default function RoleDistributionSection({ data }: Props) {
  // отфильтруем нули и отсортируем по доле
  const rows = [...data].filter(d => d.percent > 0).sort((a, b) => b.percent - a.percent);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border p-4 text-sm text-gray-500">
        Нет данных по амплуа за выбранный период
      </div>
    );
  }

  const max = Math.max(1, ...rows.map(r => r.percent));

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-semibold mb-3">Распределение по амплуа</h3>
      <div className="space-y-2">
        {rows.map((r) => {
          const pct = Math.round(r.percent);
          const width = Math.max(6, Math.round((pct / max) * 100)); // минимум ширины, чтобы короткие были видны
          return (
            <div key={r.role} className="flex items-center gap-3">
              <div className="w-16 shrink-0 text-xs sm:text-sm text-gray-600">
                {ROLE_LABELS[r.role] ?? r.role}
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${width}%`, background: 'linear-gradient(90deg, #10b981, #059669)' }}
                />
              </div>
              <div className="w-10 shrink-0 text-right text-xs sm:text-sm font-medium">{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
