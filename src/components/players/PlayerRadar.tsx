"use client";
import * as React from "react";

/** ───────── Настройки (меняй тут) ───────── */
// Размеры
const SIZE = 400;            // общий размер svg
const PADDING = 90;          // внутренние поля (добавил справа запас под длинные лейблы)
const GRID_STEPS = 5;        // кол-во колец сетки
const LABEL_OFFSET = 34;     // отступ подписи оси от внешнего кольца
const BADGE_OFFSET = 14;     // отступ бейджа % от полигона

// Шрифты
const FONT_AXIS = 10;        // размер шрифта подписей осей
const FONT_BADGE = 11;       // размер шрифта в бейджах
const FONT_TITLE = 14;       // размер заголовка блока

// Цвета
const GRID_COLOR = "rgba(148,163,184,0.4)";         // сетка (zinc-200)
const AXIS_COLOR = "#e5e7eb";         // подписи осей (zinc-900)
const POLY_STROKE = "#f87171";        // обводка полигона (red-500)
const POLY_FILL = "rgba(239,68,68,0.35)"; // заливка полигона
const BADGE_BG = "#ef4444";           // фон бейджа (red-500)
const BADGE_TEXT = "#f9fafb";         // текст в бейдже

// Кастомные названия метрик (по желанию)
// ключ = пришедший label из API, значение = как показать на графике
const LABEL_OVERRIDES: Record<string, string> = {
  // примеры:
  // "shots_on_target_pct": "Удары в створ %"
  // Если в data уже приходят нормальные русские названия — можно оставить пустым объект.
};

/** ───────── Типы ───────── */
export type RadarDatum = { label: string; pct: number };

type Props = {
  title?: string;
  data: RadarDatum[];
  /** Сноска под графиком (например, «*данные на основании кроссплея с 18 сезона»). */
  footnote?: string;
};

/** ───────── Утилиты ───────── */
function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

// аккуратный перенос строки по пробелам, чтобы подписи не уезжали вправо
function wrapLabel(label: string, maxLen = 14): string[] {
  const txt = LABEL_OVERRIDES[label] ?? label;
  if (txt.length <= maxLen) return [txt];

  const words = txt.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    if ((current + " " + w).trim().length > maxLen) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, 2); // максимум 2 строки — эстетичнее
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const a = toRadians(angleDeg - 90); // 0° вверх
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

/** ───────── Компонент ───────── */
export default function PlayerRadar({ title = "Профиль по амплуа", data, footnote }: Props) {
  const N = data.length || 1;
  const center = SIZE / 2;
  const radius = center - PADDING;

  // углы по кругу
  const angles = React.useMemo(() => {
    const step = 360 / N;
    return [...Array(N)].map((_, i) => i * step);
  }, [N]);

  // точки сетки
  const gridRadii = [...Array(GRID_STEPS)].map((_, i) => radius * ((i + 1) / GRID_STEPS));

  // точки полигона по pct
  const polyPoints = data.map((d, i) => {
    const r = radius * Math.max(0, Math.min(1, (d.pct ?? 0) / 100));
    return polarPoint(center, center, r, angles[i]);
  });

  const polyAttr = polyPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
  <div className="vfs-card p-4">
    <div className="text-[14px] font-semibold mb-2 text-foreground">
      {title}
    </div>

    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-label="radar-chart"
    >
      {/* Сетка: кольца */}
      {gridRadii.map((r, idx) => (
        <circle
          key={r}
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={GRID_COLOR}
          strokeWidth={1}
          opacity={idx === gridRadii.length - 1 ? 1 : 0.8}
        />
      ))}

      {/* Сетка: оси */}
      {angles.map((a, i) => {
        const p = polarPoint(center, center, radius, a);
        return (
          <line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke={GRID_COLOR}
            strokeWidth={1}
            opacity={0.9}
          />
        );
      })}

      {/* Подписи осей (переносим на 1–2 строки) */}
      {data.map((d, i) => {
        const outer = polarPoint(
          center,
          center,
          radius + LABEL_OFFSET,
          angles[i]
        );
        const lines = wrapLabel(d.label, 14);

        const align =
          Math.cos(toRadians(angles[i] - 90)) > 0.25
            ? "start"
            : Math.cos(toRadians(angles[i] - 90)) < -0.25
            ? "end"
            : "middle";

        return (
          <text
            key={`label-${i}`}
            x={outer.x}
            y={outer.y}
            fontSize={FONT_AXIS}
            fill={AXIS_COLOR}
            textAnchor={align as any}
            dominantBaseline="middle"
          >
            {lines.map((ln, j) => (
              <tspan key={j} x={outer.x} dy={j === 0 ? 0 : 14}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}

      {/* Полигон игрока */}
      <polygon
        points={polyAttr}
        fill={POLY_FILL}
        stroke={POLY_STROKE}
        strokeWidth={2}
      />

      {/* Точки + бейджи процентов */}
      {data.map((d, i) => {
        const r = radius * Math.max(0, Math.min(1, (d.pct ?? 0) / 100));
        const dot = polarPoint(center, center, r, angles[i]);
        const badge = polarPoint(center, center, r + BADGE_OFFSET, angles[i]);
        const pct = Math.round(d.pct ?? 0);

        return (
          <g key={`pt-${i}`}>
            <circle cx={dot.x} cy={dot.y} r={3} fill={POLY_STROKE} />
            <g transform={`translate(${badge.x}, ${badge.y})`}>
              <g>
                <rect
                  x={-20}
                  y={-12}
                  width={40}
                  height={16}
                  rx={6}
                  ry={6}
                  fill={BADGE_BG} // '#e11d48' / твой цвет бейджа
                />
                <text
                  x={0}
                  y={-12 + 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={BADGE_TEXT} // '#ffffff'
                  dominantBaseline="middle"
                >
                  {Math.round(pct)}%
                </text>
              </g>
            </g>
          </g>
        );
      })}
    </svg>

    {footnote && (
      <div className="mt-2 text-[12px] text-zinc-400">
        {footnote}
      </div>
    )}
  </div>
);
}

