'use client';

import React from 'react';

/** Входные данные по ролям:
 *  role — код амплуа (ЦАП, ФРВ, ЛФД, ...);
 *  pct  — доля от 0 до 100 (уже после нормализации на стороне сервера/страницы);
 *  count — фактическое число матчей на роли (если передаёте — используем, чтобы скрывать 0).
 */
type RolePct = { role: string; pct: number; count?: number };

/** Координаты ролей на «поле» в процентах (viewBox 100×150) */
const ROLE_POINTS: Record<string, { x: number; y: number }> = {
  // Атака
  'ФРВ': { x: 50, y: 14 }, 'НАП': { x: 50, y: 18 },
  'ЛФД': { x: 32, y: 18 }, 'ПФД': { x: 68, y: 18 },
  'ЛАП': { x: 38, y: 28 }, 'ЦАП': { x: 50, y: 30 }, 'ПАП': { x: 62, y: 28 },

  // Полузащита
  'ЛП': { x: 30, y: 44 }, 'ЛЦП': { x: 42, y: 50 }, 'ЦП': { x: 50, y: 50 },
  'ПЦП': { x: 58, y: 50 }, 'ПП': { x: 70, y: 44 },
  'ЛОП': { x: 42, y: 58 }, 'ЦОП': { x: 50, y: 60 }, 'ПОП': { x: 58, y: 58 },

  // Защита
  'ЛЗ': { x: 28, y: 74 }, 'ЛЦЗ': { x: 42, y: 74 }, 'ЦЗ': { x: 50, y: 74 },
  'ПЦЗ': { x: 58, y: 74 }, 'ПЗ': { x: 72, y: 74 },

  // Вратарь
  'ВРТ': { x: 50, y: 90 },
};

/** 0% → 0deg (краснее), 100% → 120deg (зеленее) */
function colorFromPct(pct: number) {
  const clamped = Math.max(0, Math.min(100, pct));
  const h = Math.round((clamped / 100) * 120);
  return `hsl(${h} 70% 45% / .95)`;
}

export default function PositionMap({
  data,
  caption,
}: {
  data: RolePct[];
  caption?: string;
}) {
  // Словарь «роль → pct». Инициализируем нулями.
  const pctByRole: Record<string, number> = {};
  Object.keys(ROLE_POINTS).forEach((r) => (pctByRole[r] = 0));

  // Заполняем фактами
  data.forEach(({ role, pct }) => {
    if (ROLE_POINTS[role]) pctByRole[role] = pct ?? 0;
  });

  // Фильтруем роли: показываем только те, где реально играли.
  // Приоритет — count>0, иначе используем pct>0.
  const playedRoles = new Set(
    data
      .filter((d) => (typeof d.count === 'number' ? d.count > 0 : d.pct > 0))
      .map((d) => d.role)
  );

  return (
    <div className="rounded-2xl border p-4">
      {caption && <div className="mb-3 text-sm text-gray-500">{caption}</div>}

      <div className="relative w-full" style={{ aspectRatio: '2 / 3' }}>
        {/* Поле: прозрачный фон + разметка */}
        <svg viewBox="0 0 100 150" className="absolute inset-0 w-full h-full">
          <rect x="0" y="0" width="100" height="150" fill="transparent" />
          <rect x="1" y="1" width="98" height="148" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
          <circle cx="50" cy="75" r="8" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
          <rect x="20" y="0.8" width="60" height="16" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
          <rect x="26" y="133.2" width="48" height="16" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
        </svg>

        {/* Метки ролей */}
        {Object.entries(ROLE_POINTS).map(([role, { x, y }]) => {
          // скрываем амплуа, где 0 матчей (count==0) или pct==0
          const shouldShow = playedRoles.has(role);
          if (!shouldShow) return null;

          const pct = pctByRole[role] ?? 0;
          const bg = colorFromPct(pct);

          return (
            <div
              key={role}
              title={role}
              className="absolute flex items-center justify-center text-white font-semibold rounded-xl"
              style={{
                left: `calc(${x}% - 18px)`,
                top: `calc(${y}% - 18px)`,
                width: 36,
                height: 36,
                background: bg,
                boxShadow:
                  '0 0 0 1px rgba(0,0,0,.25) inset, 0 4px 10px rgba(0,0,0,.2)',
                backdropFilter: 'saturate(1.15)',
              }}
            >
              <div className="text-[11px] leading-3">{role}</div>
              {/* ВАЖНО: никаких процентов внутри баббла */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
