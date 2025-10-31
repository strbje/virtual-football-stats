// src/components/PositionPitchHeatmap.tsx
"use client";

import React from "react";

// входные данные
export type RawRoleDatum = { role: string; count: number };

export type HeatmapProps = {
  data: RawRoleDatum[];
  // можно переопределить ширину контейнера вне компонента, он сам тянется на 100%
};

type XY = { x: number; y: number };

// канонические позиции на сетке (0..100)
// упрощённая схема 4-3-3 / 4-2-3-1
const POS: Record<string, XY> = {
  GK:  { x: 50, y: 95 },

  LB:  { x: 18, y: 72 },
  LWB: { x: 22, y: 66 },
  CB1: { x: 38, y: 78 },
  CB2: { x: 62, y: 78 },
  RWB: { x: 78, y: 66 },
  RB:  { x: 82, y: 72 },

  CDM: { x: 50, y: 58 },
  LCM: { x: 36, y: 46 },
  RCM: { x: 64, y: 46 },
  CM:  { x: 50, y: 46 },

  CAM: { x: 50, y: 36 },
  LW:  { x: 22, y: 27 },
  RW:  { x: 78, y: 27 },

  CF:  { x: 50, y: 18 },
  ST:  { x: 50, y: 18 }, // синоним к CF
};

// алиасы коротких названий к каноническим ключам выше
const ALIAS: Record<string, string> = {
  // Вратарь
  "ВР": "GK", "GK": "GK",

  // Центр/опорная/атака
  "ЦОП": "CDM", "ОП": "CDM", "CDM": "CDM",
  "ЦП": "CM", "CM": "CM",
  "ЦАП": "CAM", "АП": "CAM", "CAM": "CAM",

  // Фланги полузащиты/атаки (если сторона не указана — ставим как LW)
  "ФП": "LW", "ЛП": "LW", "LW": "LW",
  "ПП": "RW", "RW": "RW",

  // Защита
  "ЛЗ": "LB", "LB": "LB", "ПЗ": "RB", "RB": "RB",
  "КЗ": "LWB", "ЛВБ": "LWB", "ПВБ": "RWB", "RWB": "RWB",
  "ЦЗ": "CB1", "CB": "CB1",

  // Нападение
  "НАП": "ST", "ЦФ": "ST", "ФОРВАРД": "ST", "ST": "ST", "CF": "CF",
};

function colorByPct(pct: number): string {
  // зелёный → жёлтый → красный
  // 0..100
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const r = Math.round(255 * t);
  const g = Math.round(200 * (1 - Math.max(0, t - 0.25) / 0.75));
  const b = 90;
  return `rgb(${r},${g},${b})`;
}

export default function PositionPitchHeatmap({ data }: HeatmapProps) {
  const total = Math.max(
    1,
    data.reduce((s, d) => s + Number(d.count || 0), 0)
  );

  // нормализация названий и подготовка точек
  const points: Array<{ key: string; label: string; x: number; y: number; pct: number }> = [];
  const unknown: Array<{ role: string; pct: number }> = [];

  for (const d of data) {
    const raw = (d.role || "").trim().toUpperCase();
    const key = ALIAS[raw];
    const pct = Math.round((Number(d.count || 0) * 100) / total);

    if (key && POS[key]) {
      const { x, y } = POS[key];
      // Если одинаковая каноническая позиция встречается несколько раз (напр. CB1/CB2),
      // деликатно сместим следующую точку, чтобы не наложились
      const already = points.filter((p) => p.x === x && p.y === y).length;
      const dx = already * 4 * (points.length % 2 === 0 ? 1 : -1);
      const dy = already * 4;

      points.push({
        key: `${key}-${already}`,
        label: raw, // показываем исходное короткое имя
        x: x + dx,
        y: y + dy,
        pct,
      });
    } else {
      unknown.push({ role: raw || "—", pct });
    }
  }

  // размеры SVG и поля
  const W = 100;
  const H = 140;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="Тепловая карта позиций"
      >
        {/* поле */}
        <rect x={2} y={2} width={W - 4} height={H - 4} rx={3} ry={3} fill="#e9fff1" stroke="#bde7c8" />
        {/* центральная линия */}
        <line x1={2} y1={H / 2} x2={W - 2} y2={H / 2} stroke="#cfe8d5" strokeWidth={0.6} />
        {/* центральный круг */}
        <circle cx={W / 2} cy={H / 2} r={12} fill="none" stroke="#cfe8d5" strokeWidth={0.8} />

        {/* точки-лейблы */}
        {points.map((p) => {
          const r = 8 + Math.round((p.pct / 100) * 10); // 8..18
          const fill = colorByPct(p.pct);
          return (
            <g key={p.key} transform={`translate(${p.x}, ${p.y})`}>
              <rect
                x={-16}
                y={-6}
                width={32}
                height={12}
                rx={3}
                ry={3}
                fill={fill}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={0.4}
                filter="drop-shadow(0 0 0.3 rgba(0,0,0,0.2))"
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={3.2}
                fill="#fff"
                style={{ fontWeight: 600 }}
              >
                {p.label} • {p.pct}%
              </text>
            </g>
          );
        })}
      </svg>

      {unknown.length > 0 && (
        <div className="mt-2 text-sm text-gray-600">
          <div className="font-medium">Вне схемы:</div>
          <ul className="list-disc pl-5">
            {unknown.map((u, i) => (
              <li key={`${u.role}-${i}`}>
                {u.role}: {u.pct}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
