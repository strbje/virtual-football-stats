'use client';

import React from 'react';
import type { RolePercent, RoleCode } from '@/lib/roles';

/**
 * Компонент рисует только те амплуа, которые реально пришли в data и имеют pct > 0.
 * Позиционирование:
 *  - ЛФА/ПФА шире по флангу, ЛФД/ПФД — уже, ближе к оси (как просил).
 *  - Симметрия по X, ось ворот вверху.
 */

type Props = {
  data: RolePercent[]; // [{ role:'ЦАП', percent: 52 }, ...]
  scale?: number;      // коэффициент масштаба, по умолчанию 1.0
};

type XY = { x: number; y: number };

// Координаты в условной системе 1000×1400 (чуть вытянутое поле)
const POS: Record<RoleCode, XY> = {
  // Вратарь (не показываем обычно, но позиция есть)
  'ВРТ': { x: 250, y: 660 },

  // Форварды
  'ФРВ': { x: 250, y: 80 },
  'ЦФД': { x: 250, y: 100 },

  // Фланговые атакующие (шире, чем ЛФД/ПФД)
  'ЛФА': { x: 130, y: 90 },
  'ПФА': { x: 370, y: 90 },

  // Фланговые форварды (уже, чем ЛФА/ПФА)
  'ЛФД': { x: 180, y: 100 },
  'ПФД': { x: 320, y: 100 },

  // Атака из полузащиты
  'ЦАП': { x: 250, y: 160 },
  'ЛАП': { x: 180, y: 180 }, // край ПЗ (шире, чем ЛП)
  'ПАП': { x: 320, y: 180 },

  // Крайние полузащитники
  'ЛП': { x: 160, y: 260 },
  'ПП': { x: 340, y: 260 },

  // Центральная полузащита
  'ЛЦП': { x: 215, y: 310 },
  'ЦП':  { x: 250, y: 320 },
  'ПЦП': { x: 285, y: 310 },

  // Опорная
  'ЛОП': { x: 215, y: 370 },
  'ЦОП': { x: 250, y: 380 },
  'ПОП': { x: 285, y: 370 },

  // Защита
  'ЛЦЗ': { x: 215, y: 480 },
  'ЦЗ':  { x: 250, y: 490 },
  'ПЦЗ': { x: 285, y: 480 },

  'ЛЗ':  { x: 160, y: 540 },
  'ПЗ':  { x: 340, y: 540 },
};

const chipColor = (pct: number) =>
  pct >= 25 ? 'bg-emerald-500'
  : pct >= 10 ? 'bg-amber-500'
  : 'bg-rose-500';

export default function RoleHeatmap({ data, scale = 1 }: Props) {
  // Готовим карту процентов по ролям
  const map = new Map<RoleCode, number>();
  for (const r of data ?? []) {
    const code = (r.role ?? '').toUpperCase().trim() as RoleCode;
    const val = Number(r.percent ?? 0);
    if (!code || !isFinite(val) || val <= 0) continue;
    if (POS[code]) map.set(code, (map.get(code) ?? 0) + val);
  }

  const W = 500 * scale;
  const H = 700 * scale;

  return (
    <div className="relative rounded-xl bg-emerald-50" style={{ width: W, height: H }}>
      {/* контур штрафной/ворот — легкий намёк */}
      <div
        className="absolute left-1/2 -translate-x-1/2 border border-emerald-200 rounded-b-none rounded-t-xl"
        style={{ top: 80 * scale, width: 640 * scale, height: 200 * scale }}
      />
      {/* точки-ярлыки только для реально сыгранных амплуа */}
      {[...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, pct]) => {
          const p = POS[code];
          const size = 44 * scale;
          return (
            <div
              key={code}
              className={`absolute flex items-center justify-center text-white font-semibold rounded-full shadow ${chipColor(
                pct
              )}`}
              style={{
                left: p.x * scale - size / 2,
                top: p.y * scale - size / 2,
                width: size,
                height: size,
                fontSize: 12 * scale,
              }}
              title={`${code} — ${Math.round(pct)}%`}
            >
              <span className="leading-none">{code}</span>
              <span className="ml-1 text-[10px] opacity-90">{Math.round(pct)}%</span>
            </div>
          );
        })}
    </div>
  );
}
