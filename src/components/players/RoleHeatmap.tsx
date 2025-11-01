// src/components/players/RoleHeatmap.tsx
'use client';
import React from 'react';
import { RolePercent, ROLE_LABELS, normalizeRolePercents, RoleCode } from '@/utils/roles';
import clsx from 'clsx';

// простая шкала от #d1fae5 (светло-зеленый) до #059669 (насыщенный)
function colorByPercent(p: number) {
  const t = Math.min(1, Math.max(0, p / 30)); // 30% = верхняя насыщенность, можно подвинуть
  const from = [209, 250, 229]; // #d1fae5
  const to   = [  5, 150, 105]; // #059669
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

type Props = { data: RolePercent[]; };

export default function RoleHeatmap({ data }: Props) {
  const roles = normalizeRolePercents(data);
  const get = (role: RoleCode) => roles.find(r => r.role === role)!.percent;

  const Badge = ({ role }: { role: RoleCode }) => {
    const p = get(role);
    return (
      <div
        className={clsx(
          'px-3 py-1 rounded-full text-sm font-medium shadow',
          'border border-emerald-700/10'
        )}
        style={{ backgroundColor: colorByPercent(p) }}
        title={`${ROLE_LABELS[role]} — ${p.toFixed(0)}%`}
      >
        {role} · {p.toFixed(0)}%
      </div>
    );
  };

  // простая «схема поля» темплейтом (тот же layout, что у тебя)
  return (
    <div className="rounded-2xl border p-4 bg-emerald-50/40">
      <div className="mx-auto grid gap-3" style={{ gridTemplateRows: 'repeat(6, minmax(36px, auto))' }}>
        {/* ЛЗ / ПЗ */}
        <div className="row-start-2 flex justify-between px-6">
          <Badge role="ЛЗ" />
          <Badge role="ПЗ" />
        </div>

        {/* опорная тройка */}
        <div className="row-start-3 flex justify-center gap-3">
          <Badge role="ЛОП" />
          <Badge role="ЦОП" />
          <Badge role="ПОП" />
        </div>

        {/* линия ЦП */}
        <div className="row-start-4 flex justify-center gap-3">
          <Badge role="ЛПЦ" />
          <Badge role="ЦП" />
          <Badge role="ПЦП" />
        </div>

        {/* крайние полузащитники */}
        <div className="row-start-5 flex justify-between px-6">
          <Badge role="ЛП" />
          <Badge role="ПП" />
        </div>

        {/* атакующая линия */}
        <div className="row-start-5 mt-12 flex justify-center gap-3">
          <Badge role="ЛАП" />
          <Badge role="ЦАП" />
          <Badge role="ПАП" />
        </div>

        {/* нападающие */}
        <div className="row-start-6 flex justify-center gap-3">
          <Badge role="ЛФД" />
          <Badge role="ФРВ" />
          <Badge role="ЦФД" />
        </div>

        {/* центрбеков показываем над опорной линией */}
        <div className="row-start-2 -mt-14 flex justify-center gap-3">
          <Badge role="ЛЦЗ" />
          <Badge role="ПЦЗ" />
        </div>

        {/* вратарь внизу */}
        <div className="row-start-6 mt-16 flex justify-center">
          <Badge role="ВРТ" />
        </div>
      </div>
    </div>
  );
}
