// src/app/players/_components/PositionMap.tsx
"use client";

type Cell = {
  key: string;      // код позиции, например "НАП", "ЦАП", "ЦП", "ЦЗ", "КЗ", "ЛЗ", "ПЗ" и т.д.
  x: number;        // 0..3 (по ширине)
  y: number;        // 0..4 (по длине)
  label: string;    // что писать в клетке
};

const GRID: Cell[] = [
  // упрощённая схема 4-2-3-1 (под себя можешь поправить координаты/набор)
  { key: "НАП", x: 1, y: 0, label: "НАП" },

  { key: "ЛФА", x: 0, y: 1, label: "ЛФ" },
  { key: "ЦАП", x: 1, y: 1, label: "ЦАП" },
  { key: "ПФА", x: 2, y: 1, label: "ПФ" },

  { key: "ЛП", x: 0, y: 2, label: "ЛП" },
  { key: "ЦП", x: 1, y: 2, label: "ЦП" },
  { key: "ЦОП", x: 2, y: 2, label: "ЦОП" },
  { key: "ПП", x: 3, y: 2, label: "ПП" },

  { key: "ЛЗ", x: 0, y: 3, label: "ЛЗ" },
  { key: "ЦЗ", x: 1, y: 3, label: "ЦЗ" },
  { key: "ПЗ", x: 2, y: 3, label: "ПЗ" },

  { key: "ВРТ", x: 1, y: 4, label: "ВРТ" },
];

function shade(pct: number) {
  // 0–100 → прозрачность (min 0.06 для видимости)
  const a = Math.max(0.06, Math.min(1, pct / 100));
  return `rgba(59,130,246,${a})`; // индиго/синий
}

export default function PositionMap({
  data,
  caption,
}: {
  data: { role: string; pct: number }[]; // из rolePct
  caption?: string;
}) {
  const map = Object.fromEntries(data.map(d => [d.role.toUpperCase(), d.pct]));
  const cellW = 90, cellH = 60, pad = 8;
  const cols = 4, rows = 5;
  const w = cols * cellW + pad * 2;
  const h = rows * cellH + pad * 2;

  return (
    <div className="rounded-2xl border p-4">
      {caption && <div className="mb-3 text-sm text-muted-foreground">{caption}</div>}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* поле */}
        <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} rx="14"
              fill="#0b3a1e" stroke="#0e6b34" strokeWidth="2" />
        {/* линии сетки */}
        {[...Array(cols - 1)].map((_, i) => (
          <line key={`v${i}`} x1={pad + (i + 1) * cellW} y1={pad} x2={pad + (i + 1) * cellW} y2={h - pad}
                stroke="rgba(255,255,255,.12)" />
        ))}
        {[...Array(rows - 1)].map((_, i) => (
          <line key={`h${i}`} x1={pad} y1={pad + (i + 1) * cellH} x2={w - pad} y2={pad + (i + 1) * cellH}
                stroke="rgba(255,255,255,.12)" />
        ))}

        {/* клетки */}
        {GRID.map(c => {
          const pct = map[c.key.toUpperCase()] || 0;
          const x = pad + c.x * cellW;
          const y = pad + c.y * cellH;
          return (
            <g key={c.key}>
              <rect x={x + 4} y={y + 4} width={cellW - 8} height={cellH - 8} rx="10"
                    fill={shade(pct)} />
              <text x={x + cellW / 2} y={y + cellH / 2 - 4}
                    textAnchor="middle" dominantBaseline="central"
                    fontWeight={700} fontSize={14} fill="white">{c.label}</text>
              <text x={x + cellW / 2} y={y + cellH / 2 + 16}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={12} fill="rgba(255,255,255,.9)">{pct ? `${pct}%` : ""}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
