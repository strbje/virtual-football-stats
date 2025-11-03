'use client';

import React from 'react';

/** Вход может быть либо с pct, либо с count (+ optional total) */
type Input = { role: string; pct?: number; count?: number };
type Props = {
  data: Input[];
  /** если total не задан – берём сумму counts из data */
  total?: number;
  caption?: string;
};

/** Координаты ярлыков ролей на поле (включены ЛФА/ПФА) */
const ROLE_POINTS: Record<string, { x: number; y: number }> = {
  // Форварды
  'ЛФД': { x: 30, y: 14 }, 'ЦФД': { x: 50, y: 12 }, 'ПФД': { x: 70, y: 14 },
  'ЛФА': { x: 38, y: 22 }, 'ФРВ': { x: 50, y: 20 }, 'ПФА': { x: 62, y: 22 },

  // АПЗ линия
  'ЛАП': { x: 40, y: 32 }, 'ЦАП': { x: 50, y: 34 }, 'ПАП': { x: 60, y: 32 },

  // Крайние ПЗ
  'ЛП': { x: 30, y: 46 }, 'ПП': { x: 70, y: 46 },

  // Центр
  'ЛЦП': { x: 44, y: 52 }, 'ЦП': { x: 50, y: 52 }, 'ПЦП': { x: 56, y: 52 },

  // Опорники
  'ЛОП': { x: 44, y: 60 }, 'ЦОП': { x: 50, y: 62 }, 'ПОП': { x: 56, y: 60 },

  // Защита
  'ЛЗ': { x: 32, y: 74 }, 'ЛЦЗ': { x: 44, y: 74 }, 'ЦЗ': { x: 50, y: 74 },
  'ПЦЗ': { x: 56, y: 74 }, 'ПЗ': { x: 68, y: 74 },

  // Вратарь
  'ВРТ': { x: 50, y: 90 },
};

/** Градиент: 0% красный → 100% зелёный */
function colorFromPct(pct: number) {
  const h = Math.round(120 * Math.max(0, Math.min(1, pct / 100)));
  return `hsl(${h} 70% 45% / .9)`;
}

/** Нормализация входа к словарю {role -> pct} */
function normalizeToPctMap(data: Input[], totalHint?: number): Record<string, number> {
  const hasPct = data.some(d => typeof d.pct === 'number');
  const out: Record<string, number> = {};

  if (hasPct) {
    // берём проценты как есть
    for (const { role, pct = 0 } of data) out[role.toUpperCase()] = pct;
    return out;
  }

  // считаем проценты по count
  const sum = totalHint ?? data.reduce((s, d) => s + (d.count ?? 0), 0);
  for (const { role, count = 0 } of data) {
    out[role.toUpperCase()] = sum > 0 ? (count / sum) * 100 : 0;
  }
  return out;
}

export default function RoleHeatmap({ data, total, caption }: Props) {
  // нормализуем к % и добиваем нулями отсутствующие роли
  const pctMap = normalizeToPctMap(data, total);
  const pctByRole: Record<string, number> = {};
  Object.keys(ROLE_POINTS).forEach((r) => (pctByRole[r] = 0));
  for (const [role, pct] of Object.entries(pctMap)) pctByRole[role] = pct;

  return (
    <div className="rounded-2xl border p-4">
      {caption && <div className="mb-3 text-sm text-gray-500">{caption}</div>}

      <div className="relative w-full" style={{ aspectRatio: '2 / 3' }}>
        {/* поле */}
        <svg viewBox="0 0 100 150" className="absolute inset-0 w-full h-full">
          <rect x="0" y="0" width="100" height="150" fill="transparent" />
          <rect x="1" y="1" width="98" height="148" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.8" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,.12)" strokeWidth="0.8" />
          <circle cx="50" cy="75" r="8" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.8" />
          <rect x="20" y="0.8" width="60" height="16" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.8" />
          <rect x="26" y="133.2" width="48" height="16" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.8" />
        </svg>

        {/* точки */}
        {Object.entries(ROLE_POINTS).map(([role, { x, y }]) => {
          const pct = pctByRole[role] ?? 0;
          if (pct <= 0) return null; // скрываем роли без матчей
          const bg = colorFromPct(pct);

          return (
            <div
              key={role}
              title={`${role}: ${pct.toFixed(0)}%`}
              className="absolute flex flex-col items-center justify-center text-white font-semibold rounded-xl"
              style={{
                left: `calc(${x}% - 18px)`,
                top: `calc(${y}% - 18px)`,
                width: 36,
                height: 36,
                background: bg,
                boxShadow: '0 0 0 1px rgba(0,0,0,.25) inset, 0 4px 10px rgba(0,0,0,.2)',
                backdropFilter: 'saturate(1.2)',
              }}
            >
              <div className="text-[11px] leading-3">{role}</div>
              <div className="text-[10px] leading-3 opacity-90">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Без учёта матчей национальных сборных (ЧМ/ЧЕ).
      </div>
    </div>
  );
}
