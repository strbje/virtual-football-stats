'use client';

import React from 'react';

type RolePct = { role: string; pct: number; count?: number };

/** Координаты ролей (в %) относительно поля 100×150 */
const ROLE_POINTS: Record<string, { x: number; y: number }> = {
  // Атака
  'ФРВ': { x: 50, y: 14 }, 'ЦФД': { x: 50, y: 18 },
  'ЛФД': { x: 32, y: 18 }, 'ПФД': { x: 68, y: 18 },
  'ЛФА': { x: 38, y: 28 }, 'ЦАП': { x: 50, y: 30 }, 'ПФА': { x: 62, y: 28 },

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

function colorFromPct(pct: number) {
  // 0% -> красный, 100% -> зелёный
  const h = Math.round(120 * Math.max(0, Math.min(1, pct / 100)));
  return `hsl(${h} 70% 45% / .9)`;
}

type Props = {
  data: RolePct[];          // [{role:'ЦАП', pct:81, ...}]
  caption?: string;
  /** масштаб: 1 — базовый (600×900), 1/6≈0.1667 — уменьшено в 6 раз */
  scale?: number;
};

/**
 * Рендерит поле в «натуральном» размере 600×900 и масштабирует враппером.
 * Так шрифты/обводки выглядят аккуратно на любом масштабе.
 */
export default function RoleHeatmap({ data, caption, scale = 1 / 6 }: Props) {
  // словарь процентов по ролям (отсутствующие роли = 0)
  const pctByRole: Record<string, number> = {};
  Object.keys(ROLE_POINTS).forEach((r) => (pctByRole[r] = 0));
  data.forEach(({ role, pct }) => { pctByRole[role] = pct; });

  // базовые размеры «канвы»
  const BASE_W = 600;
  const BASE_H = 900;

  return (
    <div className="rounded-2xl border p-4">
      {caption && <div className="mb-3 text-sm text-gray-500">{caption}</div>}

      {/* Враппер: задаёт конечные размеры и масштабирующий контент */}
      <div
        style={{
          width: Math.round(BASE_W * scale),
          height: Math.round(BASE_H * scale),
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Контент в натуральном размере, скейлится целиком */}
        <div
          style={{
            width: BASE_W,
            height: BASE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            left: 0,
            top: 0,
          }}
        >
          <div className="relative w-[600px] h-[900px]">
            {/* SVG-поле 100×150 приводим к 600×900 */}
            <svg viewBox="0 0 100 150" className="absolute inset-0 w-full h-full">
              <rect x="0" y="0" width="100" height="150" fill="transparent" />
              <rect x="1" y="1" width="98" height="148" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
              <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
              <circle cx="50" cy="75" r="8" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
              <rect x="20" y="0.8" width="60" height="16" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
              <rect x="26" y="133.2" width="48" height="16" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="0.8" />
            </svg>

            {/* Бабблы ролей */}
            {Object.entries(ROLE_POINTS).map(([role, { x, y }]) => {
              const pct = pctByRole[role] ?? 0;
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
                    boxShadow: '0 0 0 1px rgba(0,0,0,.18) inset, 0 4px 10px rgba(0,0,0,.15)',
                    backdropFilter: 'saturate(1.1)',
                  }}
                >
                  <div className="text-[11px] leading-3">{role}</div>
                  <div className="text-[10px] leading-3 opacity-90">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-400">
        Без учёта матчей национальных сборных (ЧМ/ЧЕ).
      </div>
    </div>
  );
}
