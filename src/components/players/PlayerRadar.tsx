"use client";
import React from "react";

/**
 * PlayerRadar — чистый SVG-радар (без сторонних либ)
 * Пропсы:
 *  - data: массив { label, pct } — pct в диапазоне 0..100 (или null, если нет значения)
 *  - title?: заголовок над радаром (опционально)
 *  - size?: общий размер svg в px (по умолчанию 440)
 */
export type RadarPoint = { label: string; pct: number | null };

type Props = {
  data: RadarPoint[];
  title?: string;
  size?: number;
};

/* =======================
   ===  STYLE  KNOBS   ===
   Здесь меняй стили быстро.
   ======================= */
// Цвет линии радара и маркеров
const LINE_COLOR = "#E11D48"; // красный-розовый (Tailwind rose-600)
// Цвет сетки и подписей
const GRID_COLOR = "#D4D4D8"; // zinc-300
const AXIS_COLOR = "#E4E4E7"; // zinc-200
const LABEL_COLOR = "#18181B"; // zinc-900
// Толщина линии радара
const LINE_WIDTH = 2.5;
// Радиус точки-узла
const NODE_RADIUS = 3.5;
// Шрифты и размеры
const TITLE_FONT_SIZE = 18;
const LABEL_FONT_SIZE = 12;
const VALUE_FONT_SIZE = 11; // текст в «плашках» процентов
// Внешний отступ для подписей метрик
const LABEL_OFFSET = 18;
// Кол-во колец сетки
const GRID_RINGS = 5;
/* ======================= */

export default function PlayerRadar({ data, title, size = 440 }: Props) {
  // защита от пустых данных
  const items = Array.isArray(data) ? data : [];
  const n = items.length || 1;

  // геометрия
  const w = size;
  const h = size;
  const cx = w / 2;
  const cy = h / 2;
  // оставим поля под подписи
  const padding = 70;
  const rMax = Math.min(cx, cy) - padding;

  // конвертер процента (0..100) в радиус
  const rFromPct = (pct: number) => (Math.max(0, Math.min(100, pct)) / 100) * rMax;

  // углы по часовой стрелке, «ноль» вверх
  const angleAt = (i: number) => (-Math.PI / 2) + (2 * Math.PI * i) / n;

  // координаты для pct
  const xy = (i: number, pct: number) => {
    const a = angleAt(i);
    const r = rFromPct(pct);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  // вершины многоугольника
  const polygon = items
    .map((pt, i) => {
      const v = pt.pct ?? 0;
      const [x, y] = xy(i, v);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="w-full h-full flex flex-col items-center">
      {title && (
        <div
          style={{ fontSize: TITLE_FONT_SIZE, color: LABEL_COLOR }}
          className="font-semibold mb-2"
        >
          {title}
        </div>
      )}

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="player radar">
        {/* сетка — концентрические многоугольники */}
        {[...Array(GRID_RINGS)].map((_, ringIdx) => {
          const pct = ((ringIdx + 1) / GRID_RINGS) * 100;
          const ringPoints = items
            .map((_, i) => {
              const [x, y] = xy(i, pct);
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polygon
              key={`ring-${ringIdx}`}
              points={ringPoints}
              fill="none"
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
          );
        })}

        {/* оси */}
        {items.map((_, i) => {
          const [x, y] = xy(i, 100);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={AXIS_COLOR}
              strokeWidth={1}
            />
          );
        })}

        {/* подписи метрик (снаружи) */}
        {items.map((pt, i) => {
          const a = angleAt(i);
          const [x, y] = [cx + (rMax + LABEL_OFFSET) * Math.cos(a), cy + (rMax + LABEL_OFFSET) * Math.sin(a)];
          // выравнивание по углу
          let anchor: "start" | "middle" | "end" = "middle";
          const cos = Math.cos(a);
          if (cos > 0.2) anchor = "start";
          else if (cos < -0.2) anchor = "end";

          return (
            <text
              key={`label-${i}`}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              style={{
                fontSize: LABEL_FONT_SIZE,
                fill: LABEL_COLOR,
                fontWeight: 500,
              }}
            >
              {pt.label}
            </text>
          );
        })}

        {/* многоугольник значения */}
        <polygon
          points={polygon}
          fill={`${LINE_COLOR}22`} // лёгкая заливка
          stroke={LINE_COLOR}
          strokeWidth={LINE_WIDTH}
        />

        {/* узлы + «плашки» процентов */}
        {items.map((pt, i) => {
          const val = pt.pct ?? 0;
          const [x, y] = xy(i, val);

          // координата для бэйджа процента
          const a = angleAt(i);
          const badgeR = 18; // радиус вынесения плашки
          const bx = x + badgeR * Math.cos(a);
          const by = y + badgeR * Math.sin(a);

          return (
            <g key={`node-${i}`}>
              {/* точка */}
              <circle cx={x} cy={y} r={NODE_RADIUS} fill={LINE_COLOR} />
              {/* плашка процента */}
              <g transform={`translate(${bx}, ${by})`}>
                <rect
                  x={-18}
                  y={-12}
                  rx={6}
                  ry={6}
                  width={36}
                  height={18}
                  fill={LINE_COLOR}
                />
                <text
                  x={0}
                  y={-3}
                  textAnchor="middle"
                  style={{
                    fill: "#FFFFFF",
                    fontSize: VALUE_FONT_SIZE,
                    fontWeight: 700,
                  }}
                >
                  {Math.round(val)}%
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
