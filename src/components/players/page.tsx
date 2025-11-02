// src/components/players/page.tsx
import React from 'react';
import RoleHeatmap from '@/components/players/RoleHeatmap';
import RoleDistributionSection from '@/components/players/RoleDistributionSection';
import type { RolePercent } from '@/utils/roles';

type Props = {
  /** Уже агрегированные проценты по амплуа: [{ role: 'ЦАП', percent: 21 }, ...] */
  data: RolePercent[];
  title?: string;
};

export default function PlayersRolesBlock({ data, title = 'Распределение по амплуа' }: Props) {
  // оставляем только ненулевые роли и сортируем по убыванию
  const rows = [...data].filter(d => d.percent > 0).sort((a, b) => b.percent - a.percent);

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg">{title}</h3>

      {/* Прогресс-бары по амплуа */}
      <RoleDistributionSection data={rows} />

      {/* Тепловая карта амплуа */}
      <div>
        <h4 className="font-medium mb-2">Тепловая карта</h4>
        <RoleHeatmap data={rows} />
      </div>
    </div>
  );
}
