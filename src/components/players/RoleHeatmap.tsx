// src/components/players/RoleHeatmap.tsx
import React from 'react';
import { ROLE_COORDS, type RolePercent, type RoleCode } from '@/utils/roles';

type Props = {
  data: RolePercent[];
  /** Показать бэйджи/лейблы поверх точек (можно включить по желанию) */
  showBadges?: boolean;
};

export default function RoleHeatmap({ data, showBadges = false }: Props) {
  // Берём только роли с ненулевой долей
  const filled = data.filter(d => d.percent > 0);
  if (!filled.length) return null;

  const map = new Map<RoleCode, number>(data.map((d) => [d.role, d.percent]));
  const max = Math.max(1, ...data.map((d) => d.percent));

  return (
    <div className="relative w-full max-w-[520px] aspect-[2/3] rounded-2xl border bg-emerald-50/40">
      {/* Точки по координатам амплуа */}
      {Object.entries(ROLE_COORDS).map(([role, pos]) => {
        const key = role as RoleCode;
        const val = map.get(key) ?? 0;
        if (val <= 0) return null;

        // Чем больше %, тем насыщённее
        const intensity = Math.max(0.15, val / max); // 0.15..1
        const bg = `hsla(160, 80%, 35%, ${intensity})`; // изумрудный

        return (
          <div
            key={role}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs md:text-sm font-semibold text-white shadow-sm"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: bg }}
            title={`${role} • ${Math.round(val)}%`}
          >
            {showBadges ? `${role} • ${Math.round(val)}%` : `${Math.round(val)}%`}
          </div>
        );
      })}
    </div>
  );
}
