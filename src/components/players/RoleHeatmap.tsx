import React from 'react';
import { ROLE_COORDS, type RolePercent, type RoleCode } from '@/utils/roles';

type Props = {
  data: RolePercent[];
};

// hue: 0 (красный) → 140 (зелёно-бирюзовый) в зависимости от доли
const hueBy = (value: number, max: number) => {
  const t = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return Math.round(0 + (140 - 0) * t);
};

export default function RoleHeatmap({ data }: Props) {
  // только роли с ненулевой долей
  const filtered = data.filter((d) => d.percent > 0);
  if (!filtered.length) return null;

  const map = new Map<RoleCode, number>(filtered.map((d) => [d.role, d.percent]));
  const max = Math.max(1, ...filtered.map((d) => d.percent));

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-semibold mb-3">Тепловая карта амплуа</h3>
      <div className="relative w-full max-w-[520px] aspect-[2/3] rounded-2xl border bg-emerald-50/30">
        {Object.entries(ROLE_COORDS).map(([role, pos]) => {
          const key = role as RoleCode;
          const val = map.get(key);
          if (val == null || val <= 0) return null; // показываем только сыгранные роли

          const hue = hueBy(val, max); // 0..140
          const bg = `hsla(${hue}, 80%, 40%, 0.9)`; // красный→зелёный
          return (
            <div
              key={role}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs md:text-sm font-semibold text-white shadow-sm"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: bg }}
              title={`${role}`} // тултип — только код роли
            >
              {/* На карте показываем только код роли, БЕЗ процентов */}
              {role}
            </div>
          );
        })}
      </div>
    </div>
  );
}
