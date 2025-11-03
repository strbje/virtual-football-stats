'use client';

import React from 'react';

type RolePct = { role: string; pct: number; count?: number };

/** Координаты ярлыков на поле (центрированные проценты 0–100) */
const ROLE_POINTS: Record<
  string,
  { x: number; y: number }
> = {
  // Форварды (включая крайних форвардов и центрфорварда)
  'ФРВ': { x: 50, y: 14 },
  'ЦФД': { x: 50, y: 18 },
  'ЛФД': { x: 32, y: 18 },
  'ПФД': { x: 68, y: 18 },
  'ЛФА': { x: 38, y: 24 },
  'ПФА': { x: 62, y: 24 },

  // Атакующие полузащитники
  'ЛАП': { x: 38, y: 32 },
  'ЦАП': { x: 50, y: 34 },
  'ПАП': { x: 62, y: 32 },

  // Крайние полузащитники
  'ЛП': { x: 30, y: 44 },
  'ПП': { x: 70, y: 44 },

  // Центральные/внутренние полузащитники
  'ЛЦП': { x: 42, y: 50 },
  'ЦП':  { x: 50, y: 50 },
  'ПЦП': { x: 58, y: 50 },

  // Опорники
  'ЛОП': { x: 42, y: 58 },
  'ЦОП': { x: 50, y: 60 },
  'ПОП': { x: 58, y: 58 },

  // Защита
  'ЛЗ':  { x: 28, y: 74 },
  'ЛЦЗ': { x: 42, y: 74 },
  'ЦЗ':  { x: 50, y: 74 },
  'ПЦЗ': { x: 58, y: 74 },
  'ПЗ':  { x: 72, y: 74 },

  // Вратарь
  'ВРТ': { x: 50, y: 90 },
};

function colorFromPct(pct: number) {
  // 0% → красный, 100% → зелёный
  const h = Math.round(120 * Math.max(0, Math.min(1, pct / 100)));
  return `hsl(${h} 70% 45% / .92)`;
}

export default function RoleHeatmap({
  data,
  title = 'Тепловая карта амплуа',
}: {
  data: RolePct[];      // массив после нормализации (pct в %)
  title?: string;
}) {
  // оставляем только те роли, где есть хоть какой-то объём
  const pctByRole: Record<string, number> = {};
  for (const r of data) {
    const key = r.role?.toUpperCase();
    if (!key) continue;
    pctByRole[key] = (r.pct ?? 0);
  }

  const rolesToRender = Object.keys(ROLE_POINTS).filter(
    (code) => (pctByRole[code] ?? 0) > 0
  );

  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-3 text-sm text-neutral-600">{title}</div>

      <div className="relative w-full" style={{ aspectRatio: '2 / 3' }}>
        {/* Поле (тонкие линии) */}
        <svg viewBox="0 0 100 150" className="absolute inset-0 w-full h-full">
          <rect x="0" y="0" width="100" height="150" fill="transparent" />
          <rect x="1" y="1" width="98" height="148" fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="0.8" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(0,0,0,.06)" strokeWidth="0.8" />
          <circle cx="50" cy="75" r="8" fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="0.8" />
          <rect x="20" y="0.8"  width="60" height="16" fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="0.8" />
          <rect x="26" y="133.2" width="48" height="16" fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="0.8" />
        </svg>

        {/* Ярлыки только для реально сыгранных ролей */}
        {rolesToRender.map((role) => {
          const { x, y } = ROLE_POINTS[role];
          const pct = pctByRole[role] ?? 0;
          const bg = colorFromPct(pct);

          return (
            <div
              key={role}
              title={`${role}: ${pct.toFixed(0)}%`}
              className="absolute flex flex-col items-center justify-center text-white font-semibold rounded-xl"
              style={{
                left: `calc(${x}% - 18px)`,
                top:  `calc(${y}% - 18px)`,
                width: 36,
                height: 36,
                background: bg,
                boxShadow: '0 0 0 1px rgba(0,0,0,.18) inset, 0 6px 14px rgba(0,0,0,.18)',
              }}
            >
              <div className="text-[11px] leading-3">{role}</div>
              <div className="text-[10px] leading-3 opacity-90">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-neutral-500">
        Без учёта матчей национальных сборных (ЧМ/ЧЕ).
      </div>
    </div>
  );
}
