// src/components/PositionPitchHeatmap.tsx
"use client";

import * as React from "react";

/**
 * Универсальный компонент «тепловая карта позиций».
 * Принимает:
 *  - zones: [{ zone, value }] — готовые значения по «зонам» поля
 *    ИЛИ
 *  - data:  [{ role, pct }] — доли по амплуа; будут сведены в зоны через role→zone mapping
 *
 * title — заголовок (необязательно)
 */

type ZonePoint = { zone: string; value: number };
type RolePoint = { role: string; pct: number };

type Props = {
  zones?: ZonePoint[];
  data?: RolePoint[];
  title?: string;
};

// Нормализуем кириллицу/варианты амплуа в зоны поля.
// При необходимости расширяй таблицу.
const roleToZone = (raw: string): string => {
  const r = raw.trim().toLowerCase();

  // Форварды
  if (["нап", "st", "cf", "frv", "пфд", "лфд", "rfd", "lfd"].some(x => r.includes(x)))
    return "ST";

  // Атака по флангам
  if (["фп", "фланг", "lw", "лв", "лвинг", "lm"].some(x => r.includes(x)))
    return "LW";
  if (["rw", "пв", "rm"].some(x => r.includes(x)))
    return "RW";

  // Полузащита
  if (["цап", "cam"].some(x => r.includes(x))) return "CAM";
  if (["цп", "cm"].some(x => r.includes(x))) return "CM";
  if (["цоП", "cdm"].some(x => r.includes(x))) return "CDM";

  // Фуллбеки
  if (["кз", "лз", "lb", "lwb"].some(x => r.includes(x))) return "LB";
  if (["пз", "rb", "rwb"].some(x => r.includes(x))) return "RB";

  // Центр-беки (включая боковых ЦЗ)
  if (["цз", "cb"].some(x => r === x)) return "CB";
  if (["лцз", "lcb"].some(x => r.includes(x))) return "LCB";
  if (["пцз", "rcb"].some(x => r.includes(x))) return "RCB";

  // Вратарь
  if (["вр", "гк", "gk"].some(x => r.includes(x))) return "GK";

  // По умолчанию — центр поля
  return "CM";
};

// Координаты зон на SVG-поле (12 зон + GK)
type ZoneRect = { x: number; y: number; w: number; h: number; label: string };

const PITCH_W = 1050;
const PITCH_H = 680;
const PAD = 24;

const ZONES: Record<string, ZoneRect> = {
  GK:  { x: PAD, y: PITCH_H/2 - 70, w: 60,  h: 140, label: "GK" },

  LB:  { x: PAD + 100, y: PAD,            w: 150, h: 200, label: "LB" },
  LCB: { x: PAD + 100, y: PAD + 210,      w: 150, h: 220, label: "LCB" },
  CB:  { x: PAD + 260, y: PAD + 210,      w: 150, h: 220, label: "CB" },
  RCB: { x: PAD + 420, y: PAD + 210,      w: 150, h: 220, label: "RCB" },
  RB:  { x: PAD + 580, y: PAD,            w: 150, h: 200, label: "RB" },

  CDM: { x: PAD + 260, y: PAD + 440,      w: 150, h: 100, label: "CDM" },
  CM:  { x: PAD + 260, y: PAD + 545,      w: 150, h: 100, label: "CM" },
  CAM: { x: PAD + 420, y: PAD + 545,      w: 150, h: 100, label: "CAM" },

  LW:  { x: PAD + 770, y: PAD + 480,      w: 120, h: 150, label: "LW" },
  ST:  { x: PAD + 900, y: PAD + 520,      w: 120, h: 120, label: "ST" },
  RW:  { x: PAD + 770, y: PAD + 320,      w: 120, h: 150, label: "RW" },
};

// Цвет от красного → зелёного
const colorFrom = (v: number, max: number) => {
  const ratio = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  const hue = 0 + (120 - 0) * ratio; // 0=red, 120=green
  const light = 46;
  return `hsl(${hue}, 85%, ${light}%)`;
};

export default function PositionPitchHeatmap({ zones, data, title }: Props) {
  // Если пришёл zones — используем их.
  // Иначе агрегируем из data по маппингу role→zone.
  const aggregated: Record<string, number> = React.useMemo(() => {
    if (zones && zones.length) {
      return zones.reduce<Record<string, number>>((acc, z) => {
        acc[z.zone] = (acc[z.zone] ?? 0) + z.value;
        return acc;
      }, {});
    }
    const acc: Record<string, number> = {};
    (data ?? []).forEach((r) => {
      const zone = roleToZone(r.role);
      acc[zone] = (acc[zone] ?? 0) + r.pct;
    });
    return acc;
  }, [zones, data]);

  const maxVal = React.useMemo(
    () => Math.max(0, ...Object.values(aggregated)),
    [aggregated]
  );

  return (
    <div className="rounded-2xl border p-4">
      {title && <div className="mb-3 text-sm text-gray-500">{title}</div>}

      <div className="relative w-full overflow-hidden rounded-xl border bg-emerald-50">
        <svg
          viewBox={`0 0 ${PITCH_W} ${PITCH_H}`}
          width="100%"
          height="auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Поле (контур) */}
          <rect
            x={PAD}
            y={PAD}
            width={PITCH_W - PAD * 2}
            height={PITCH_H - PAD * 2}
            rx={16}
            fill="#e8fff4"
            stroke="#a7f3d0"
            strokeWidth={3}
          />
          {/* Центральная линия и круг */}
          <line
            x1={PITCH_W / 2}
            y1={PAD}
            x2={PITCH_W / 2}
            y2={PITCH_H - PAD}
            stroke="#86efac"
            strokeWidth={2}
            opacity={0.8}
          />
          <circle
            cx={PITCH_W / 2}
            cy={PITCH_H / 2}
            r={60}
            fill="none"
            stroke="#86efac"
            strokeWidth={2}
            opacity={0.8}
          />

          {/* Зоны с цветом по интенсивности */}
          {Object.entries(ZONES).map(([key, rect]) => {
            const v = aggregated[key] ?? 0;
            const fill = colorFrom(v, maxVal);
            return (
              <g key={key}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={rect.h}
                  rx={12}
                  fill={fill}
                  stroke="rgba(0,0,0,0.08)"
                />
                <text
                  x={rect.x + rect.w / 2}
                  y={rect.y + rect.h / 2}
                  fontSize={18}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0f172a"
                  fontWeight={700}
                >
                  {rect.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Легенда */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
        <span>Меньше матчей</span>
        <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-500" />
        <span>Больше матчей</span>
      </div>
    </div>
  );
}
