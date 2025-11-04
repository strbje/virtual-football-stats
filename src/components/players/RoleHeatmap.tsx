// src/app/players/_components/RoleHeatmap.tsx
// Тепловая карта амплуа: 500x700, цвет = красный(0%) → зелёный(max%)

import * as React from 'react';

export type RolePercent = { role: string; percent: number };

type Props = {
  data: RolePercent[];              // короткие коды и доли 0..100
  caption?: string;
};

// Координаты центров «пузырей» в пикселях под холст 500x700
// Сетка: (0,0) — верхний левый угол холста.
const W = 500;
const H = 700;

// Блоки поля (рамки зон) — просто декоративные
const BOXES = {
  attack:   { x: 70, y: 90,  w: 360, h: 160 },
  defense:  { x: 70, y: 480, w: 360, h: 120 },
  midLine:  360, // y-координата раздела центр/оборона
};

type XY = { x: number; y: number };

// Базовые позиции (ширина крайних — шире; ЛЗ/ПЗ/ЛП/ПП выставлены шире и на одной высоте)
const POS: Record<string, XY> = {
  // Форварды (уже по центру)
  'ЛФД': { x: 180, y: 140 },
  'ЦФД': { x: 250, y: 130 },
  'ПФД': { x: 320, y: 140 },
  'ФРВ': { x: 250, y: 160 },

  // Атакующие полузащитники (шире, чем ФД)
  'ЛФА': { x: 110, y: 190 },
  'ЦАП': { x: 250, y: 210 },
  'ПФА': { x: 390, y: 190 },

  // Крайние полузащитники (ещё шире и на одной высоте)
  'ЛП':  { x: 60,  y: 280 },
  'ПП':  { x: 440, y: 280 },

  // Центральная линия
  'ЛЦП': { x: 190, y: 360 },
  'ЦП':  { x: 250, y: 360 },
  'ПЦП': { x: 310, y: 360 },

  // Опорники
  'ЛОП': { x: 210, y: 420 },
  'ПОП': { x: 290, y: 420 },

  // Крайние защитники (шире и симметрично)
  'ЛЗ':  { x: 60,  y: 560 },
  'ПЗ':  { x: 440, y: 560 },

  // Центральные защитники — можно добавить при необходимости
  'ЛЦЗ': { x: 190, y: 520 },
  'ЦЗ':  { x: 250, y: 520 },
  'ПЦЗ': { x: 310, y: 520 },

  // Вратарь — редко используем, но пусть будет
  'ВРТ': { x: 250, y: 630 },
};

// Лейблы, если нужно переименовать короткие коды
const LABEL: Record<string, string> = new Proxy({}, {
  get: (_t, k: string) => k, // по умолчанию возвращаем сам код
});

// Цвет: 0% → красный, max% → зелёный, линейно между ними.
// HSL: hue 0..120 (красный→зелёный)
function colorByShare(p: number, maxP: number) {
  const t = Math.max(0, Math.min(1, maxP > 0 ? p / maxP : 0)); // 0..1
  const hue = 120 * t;           // 0=красный, 120=зелёный
  const sat = 70;                // насыщенность
  const light = 46 + (1 - t) * 4; // чуть темнее для низких значений
  return `hsl(${hue} ${sat}% ${light}%)`;
}

const R = 22;  // радиус «пузыря»
const STROKE = '#0d3b2a1a'; // мягкий обвод

export default function RoleHeatmap({ data, caption }: Props) {
  // Отфильтруем пустые и неизвестные коды, приведём к верхнему регистру
  const items = (data ?? [])
    .map(d => ({ role: (d.role || '').toUpperCase(), percent: Number(d.percent || 0) }))
    .filter(d => Number.isFinite(d.percent) && d.percent >= 0 && POS[d.role]);

  // максимум — для зелёной точки
  const maxPercent = items.reduce((m, d) => Math.max(m, d.percent), 0);

  return (
    <div className="rounded-2xl border border-emerald-200/40 bg-emerald-50/40 p-4">
      {caption && <div className="text-sm text-gray-600 mb-2">{caption}</div>}

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Тепловая карта амплуа">
        {/* фон поля */}
        <rect x={0} y={0} width={W} height={H} rx={18} ry={18} fill="#eafff3" />

        {/* разметка: атака и оборона */}
        <rect
          x={BOXES.attack.x}
          y={BOXES.attack.y}
          width={BOXES.attack.w}
          height={BOXES.attack.h}
          rx={10}
          fill="none"
          stroke="#10b98122"
        />
        <line
          x1={30}
          y1={BOXES.midLine}
          x2={W - 30}
          y2={BOXES.midLine}
          stroke="#10b98122"
        />
        <rect
          x={BOXES.defense.x}
          y={BOXES.defense.y}
          width={BOXES.defense.w}
          height={BOXES.defense.h}
          rx={10}
          fill="none"
          stroke="#10b98122"
        />

        {/* сами «пузырьки» */}
        {items.map(({ role, percent }) => {
          const { x, y } = POS[role];
          const fill = colorByShare(percent, maxPercent);
          const pct = Math.round(percent);
          const title = `${LABEL[role]} — ${pct}% (цвет относительно максимума ${Math.round(maxPercent)}%)`;

          return (
            <g key={role} transform={`translate(${x},${y})`} style={{ cursor: 'default' }}>
              <title>{title}</title>
              <circle r={R} fill={fill} stroke={STROKE} strokeWidth={2} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontWeight={700}
                fill="#0f172a"
                y={-2}
              >
                {role}
              </text>
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill="#0f172acc"
                y={14}
              >
                {pct}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
