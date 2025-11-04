'use client';

import React from 'react';

/**
 * ВХОДНЫЕ ДАННЫЕ:
 * role — короткий код амплуа (ЦФД, ЛФА, ПЗ и т.д.)
 * percent/pct — доля в %, допускается count+total (но лучше процент).
 */
export type HeatRole = {
  role: string;
  percent?: number;
  pct?: number;
  count?: number;
};

type Props = {
  data: HeatRole[];
  caption?: string;
};

/* =========================
   Габариты и масштабирование
   ========================= */

const BASE_W = 640;
const BASE_H = 900;

// Нужный реальный размер:
const WIDTH = 500;
const HEIGHT = 700;

const sx = (x: number) => (x / BASE_W) * WIDTH;
const sy = (y: number) => (y / BASE_H) * HEIGHT;

/* =========================
   Цветовая шкала (0 — красный)
   ========================= */

function colorScale(vIn: number | undefined) {
  const v = Math.max(0, Math.min(100, Number(vIn ?? 0)));

  // 0 → красный, 50 → жёлтый, >=70 → зелёный
  if (v <= 0) return '#ef4444';      // red-500
  if (v < 40) return '#f97316';      // orange-500
  if (v < 60) return '#f59e0b';      // amber-500
  if (v < 70) return '#84cc16';      // lime-500
  return '#10b981';                  // emerald-500
}

/* =========================
   Раскладка координат (базовая)
   — ЛЗ/ПЗ и ЛП/ПП шире, на одной высоте
   — ЛФА/ПФА шире, чем ЛФД/ПФД; ЛФД/ПФД уже по оси X
   — ЛАП/ПАП трактуем как широчайшие вингеры (там же, где ЛФА/ПФА)
   ========================= */

// Удобные «линии» по Y:
const Y_FWD = 120;    // линия форвардов
const Y_10  = 220;    // «десятки»
const Y_W   = 360;    // линия ЛП/ПП (широкие хавы)
const Y_CM  = 460;    // центральные полузащитники
const Y_DM  = 560;    // опорники
const Y_FB  = 720;    // крайние защитники
const Y_CB  = 780;    // центральные защитники
const Y_GK  = 860;    // вратарь

// Центр поля:
const X_C = BASE_W / 2;

// Смещения по X
const DX_FD_NARROW = 120;  // ЛФД/ПФД (уже)
const DX_FA_WIDE   = 220;  // ЛФА/ПФА (шире)
const DX_WINGER    = 260;  // ЛП/ПП (широко)
const DX_FULLBACK  = 280;  // ЛЗ/ПЗ (ещё шире)
const DX_CM        = 90;   // ЛЦП/ПЦП
const DX_CB        = 90;   // ЛЦЗ/ПЦЗ

// Базовая карта координат для коротких кодов
const POS: Record<string, { x: number; y: number }> = {
  // Форварды
  'ЦФД': { x: X_C,              y: Y_FWD },
  'ЛФД': { x: X_C - DX_FD_NARROW, y: Y_FWD },
  'ПФД': { x: X_C + DX_FD_NARROW, y: Y_FWD },

  // Фланговые форварды (шире)
  'ЛФА': { x: X_C - DX_FA_WIDE,   y: Y_FWD },
  'ПФА': { x: X_C + DX_FA_WIDE,   y: Y_FWD },

  // «Десятка»
  'ЦАП': { x: X_C,              y: Y_10 },

  // Атакующие полузащитники по флангам — считаем «широкими»
  'ЛАП': { x: X_C - DX_FA_WIDE,   y: Y_10 },
  'ПАП': { x: X_C + DX_FA_WIDE,   y: Y_10 },

  // Широкие полузащитники
  'ЛП':  { x: X_C - DX_WINGER,    y: Y_W },
  'ПП':  { x: X_C + DX_WINGER,    y: Y_W },

  // Центральные полузащитники
  'ЦП':  { x: X_C,              y: Y_CM },
  'ЛЦП': { x: X_C - DX_CM,      y: Y_CM },
  'ПЦП': { x: X_C + DX_CM,      y: Y_CM },

  // Опорная линия
  'ЦОП': { x: X_C,              y: Y_DM },
  'ЛОП': { x: X_C - DX_CM,      y: Y_DM },
  'ПОП': { x: X_C + DX_CM,      y: Y_DM },

  // Крайние защитники (шире и симметрично)
  'ЛЗ':  { x: X_C - DX_FULLBACK, y: Y_FB },
  'ПЗ':  { x: X_C + DX_FULLBACK, y: Y_FB },

  // Центральные защитники
  'ЦЗ':  { x: X_C,              y: Y_CB },
  'ЛЦЗ': { x: X_C - DX_CB,      y: Y_CB },
  'ПЦЗ': { x: X_C + DX_CB,      y: Y_CB },

  // Вратарь
  'ВРТ': { x: X_C,              y: Y_GK },
};

/* =========================
   Утилиты
   ========================= */

const toPct = (r: HeatRole, total?: number) => {
  if (Number.isFinite(r.percent)) return Number(r.percent);
  if (Number.isFinite(r.pct))     return Number(r.pct);
  if (total && Number(r.count) > 0) return (Number(r.count) / total) * 100;
  return 0;
};

const fmt = (v: number) => `${Math.round(v)}%`;

/* =========================
   Компонент
   ========================= */

export default function RoleHeatmap({ data, caption }: Props) {
  // чистим данные, суммируем total если нужно
  const totalCount = data.reduce((s, r) => s + (Number(r.count) || 0), 0) || undefined;

  // оставляем только известные коды с ненулевым процентом
  const points = data
    .map((r) => {
      const code = (r.role || '').toUpperCase().trim();
      const base = POS[code];
      if (!base) return null;

      const p = toPct(r, totalCount);
      if (p <= 0) return null;

      return {
        code,
        pct: p,
        x: sx(base.x),
        y: sy(base.y),
        fill: colorScale(p),
      };
    })
    .filter(Boolean) as { code: string; pct: number; x: number; y: number; fill: string }[];

  return (
    <div className="w-full">
      {caption && <div className="text-sm text-gray-600 mb-2">{caption}</div>}

      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Тепловая карта амплуа"
        style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      >
        {/* Поле: фон + разметка штрафных/ворот (минимализм, без «вылетающей» рамки) */}
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={12} ry={12} fill="#ecfdf5" stroke="#d1fae5" />

        {/* Верхняя штрафная зона (для ориентира) */}
        <rect
          x={sx(80)}
          y={sy(40)}
          width={sx(BASE_W - 160)}
          height={sy(180)}
          fill="none"
          stroke="#c7f9e0"
        />
        {/* Нижняя штрафная зона */}
        <rect
          x={sx(80)}
          y={sy(BASE_H - 220)}
          width={sx(BASE_W - 160)}
          height={sy(180)}
          fill="none"
          stroke="#c7f9e0"
        />

        {/* Центральная линия */}
        <line x1={0} y1={sy(BASE_H / 2)} x2={WIDTH} y2={sy(BASE_H / 2)} stroke="#c7f9e0" />

        {/* Точки-пузырьки */}
        {points.map((pt) => (
          <g key={pt.code} transform={`translate(${pt.x}, ${pt.y})`}>
            {/* тень */}
            <circle r={sy(22)} fill="rgba(15, 23, 42, .06)" />
            {/* сам пузырь */}
            <circle r={sy(20)} fill={pt.fill} stroke="#064e3b" strokeWidth={1} />
            {/* текст: код + процент */}
            <text
              x={0}
              y={-sy(2)}
              textAnchor="middle"
              fontSize={sy(16)}
              fontWeight={700}
              fill="#0c0c0c"
              style={{ pointerEvents: 'none' }}
            >
              {pt.code}
            </text>
            <text
              x={0}
              y={sy(16)}
              textAnchor="middle"
              fontSize={sy(12)}
              fill="#111827"
              style={{ pointerEvents: 'none' }}
            >
              {fmt(pt.pct)}
            </text>

            {/* нативная подсказка */}
            <title>{`${pt.code} — ${fmt(pt.pct)}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}
