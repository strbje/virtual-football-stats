import React from 'react';
import { ROLE_COORDS, type RolePercent, type RoleCode } from '@/utils/roles';

type Props = { data: RolePercent[] };

const hueBy = (value: number, max: number) => {
  const t = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return Math.round(0 + (140 - 0) * t); // 0=красный → 140=зелёный
};

export default function RoleHeatmap({ data }: Props) {
  // 1) нормализация: верхний регистр + аккумулируем проценты
  const acc = new Map<RoleCode, number>();
  for (const d of data) {
    const role = (d.role || '').toUpperCase() as RoleCode;
    const val = Number(d.percent ?? 0);
    acc.set(role, (acc.get(role) ?? 0) + val);
  }

  // 2) округляем до целого — скрываем только нули
  const rounded = new Map<RoleCode, number>();
  acc.forEach((v, k) => rounded.set(k, Math.round(v)));

  // 3) роли, которые реально «играл» (после округления)
  const played = Array.from(rounded.entries()).filter(([, v]) => v > 0);
  if (!played.length) return null;

  const max = Math.max(...played.map(([, v]) => v));

  return (
    <div className="relative w-full max-w-[520px] aspect-[2/3] rounded-2xl border bg-emerald-50/30">
      {Object.entries(ROLE_COORDS).map(([role, pos]) => {
        const val = rounded.get(role as RoleCode);
        if (!val || val <= 0) return null; // показываем ТОЛЬКО > 0

        const hue = hueBy(val, max);
        const bg = `hsla(${hue}, 80%, 40%, 0.9)`;
        return (
          <div
            key={role}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs md:text-sm font-semibold text-white shadow-sm"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: bg }}
            title={role}
          >
            {role} {/* без процентов */}
          </div>
        );
      })}
    </div>
  );
}
