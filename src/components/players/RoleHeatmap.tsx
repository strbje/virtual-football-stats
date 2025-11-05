// src/components/players/RoleHeatmap.tsx
// Тепловая карта амплуа: 500x700, цвет = красный(0%) → зелёный(max%)

import * as React from 'react';

export type RolePercent = { role: string; percent: number };

type Props = {
  data: RolePercent[];              // короткие коды и доли 0..100
  caption?: string;
};

// Размер холста
const W = 500;
const H = 700;

// Декоративные рамки зон
const BOXES = {
  attack:   { x: 70, y: 90,  w: 360, h: 160 },
  defense:  { x: 70, y: 480, w: 360, h: 120 },
  midLine:  360,
};

type XY = { x: number; y: number };

/** Координаты центров «пузырей» (коды EA/твои короткие коды) */
const POS: Record<string, XY> = {
  // Форварды
  'ЛФД': { x: 180, y: 140 },
  'ЦФД': { x: 250, y: 160 },
  'ПФД': { x: 320, y: 140 },
  'ФРВ': { x: 250, y: 120 },

  // Атакующие полузащитники (верхняя треть)
  'ЛФА': { x: 110, y: 190 },
  'ЦАП': { x: 250, y: 210 },
  'ПФА': { x: 390, y: 190 },

  // Твои коды — их не хватало, поэтому узлы не рисовались
  'ЛАП': { x: 180, y: 210 }, // равен ЛФА
  'ПАП': { x: 320, y: 210 }, // равен ПФА

  // Крайние полузащитники (средняя треть)
  'ЛП':  { x: 60,  y: 280 },
  'ПП':  { x: 440, y: 280 },

  // Центральная линия
  'ЛЦП': { x: 190, y: 360 },
  'ЦП':  { x: 250, y: 360 },
  'ПЦП': { x: 310, y: 360 },

  // Опорники
  'ЛОП': { x: 210, y: 420 },
  'ПОП': { x: 290, y: 420 },

  // Защитники
  'ЛЗ':  { x: 60,  y: 500 },
  'ПЗ':  { x: 440, y: 500 },
  'ЛЦЗ': { x: 190, y: 520 },
  'ЦЗ':  { x: 250, y: 520 },
  'ПЦЗ': { x: 310, y: 520 },

  // Вратарь
  'ВРТ': { x: 250, y: 630 },
};

// Лейблы — по умолчанию показываем код как есть
const LABEL: Record<string, string> = new Proxy({}, {
  get: (_t, k: string) => k,
});

// Цвет по доле (0..max → красный..зелёный)
function colorByShare(p: number, maxP: number) {
  const t = Math.max(0, Math.min(1, maxP > 0 ? p / maxP : 0));
  const hue = 120 * t;
  const sat = 70;
  const light = 46 + (1 - t) * 4;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

const R = 22;
const STROKE = '#0d3b2a1a';

export default function RoleHeatmap({ data, caption }: Props) {
  // Нормализуем: верхний регистр, фильтр по известным позициям
  const items = (data ?? [])
    .map(d => ({ role: (d.role || '').toUpperCase(), percent: Number(d.percent || 0) }))
    .filter(d => Number.isFinite(d.percent) && d.percent >= 0 && POS[d.role]);

  const maxPercent = items.reduce((m, d) => Math.max(m, d.percent), 0);

  return (
    <div className="rounded-2xl border border-emerald-200/40 bg-emerald-50/40 p-4">
      {caption && <div className="text-sm text-gray-600 mb-2">{caption}</div>}

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Тепловая карта амплуа">
        {/* фон */}
        <rect x={0} y={0} width={W} height={H} rx={18} ry={18} fill="#eafff3" />

        {/* разметка поля */}
        <rect x={BOXES.attack.x} y={BOXES.attack.y} width={BOXES.attack.w} height={BOXES.attack.h} rx={10} fill="none" stroke="#10b98122" />
        <line x1={30} y1={BOXES.midLine} x2={W - 30} y2={BOXES.midLine} stroke="#10b98122" />
        <rect x={BOXES.defense.x} y={BOXES.defense.y} width={BOXES.defense.w} height={BOXES.defense.h} rx={10} fill="none" stroke="#10b98122" />

        {/* точки */}
        {items.map(({ role, percent }) => {
          const { x, y } = POS[role];
          const fill = colorByShare(percent, maxPercent);
          const pct = Math.round(percent);
          const title = `${LABEL[role]} — ${pct}% (цвет относительно максимума ${Math.round(maxPercent)}%)`;

          return (
            <g key={role} transform={`translate(${x},${y})`} style={{ cursor: 'default' }}>
              <title>{title}</title>
              <circle r={R} fill={fill} stroke={STROKE} strokeWidth={2} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#0f172a" y={-2}>{role}</text>
              <text textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#0f172acc" y={14}>{pct}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
