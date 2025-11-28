// src/components/teams/TeamRadarClient.tsx
"use client";

import { useEffect, useState } from "react";

/** ---------- Типы данных от API ---------- */

type TeamStatsPerMatch = {
  goals?: number | null;
  shots?: number | null;
  allpasses?: number | null;
  pass_acc?: number | null;
  crosses?: number | null;
  def_actions?: number | null;
  aerial_pct?: number | null;
};

type RadarPercentiles = {
  goals: number | null;
  shots: number | null;
  passes: number | null;
  passesPerShot: number | null;
  defActions: number | null;
  passAccPct: number | null;
  crosses: number | null;
  aerialPct: number | null;
};

type TeamStatsResponse = {
  ok: boolean;
  teamId: number;
  matches: number;
  scope: "recent" | "all";
  perMatch?: TeamStatsPerMatch;
  radarPercentiles?: RadarPercentiles;
  debug?: {
    leagueLabel: string;
    teamsInLeague: number;
  };
};

type Props = {
  teamId: number;
  scope?: "recent" | "all";
};

/** ---------- Конфиг осей радара ---------- */

const METRIC_CONFIG = [
  { key: "goals" as const, label: "Голы", invert: false },
  { key: "shots" as const, label: "Удары", invert: false },
  { key: "passes" as const, label: "Пасы", invert: false },
  {
    key: "passesPerShot" as const,
    label: "Пасов на удар",
    invert: true, // меньше — лучше
  },
  { key: "defActions" as const, label: "Защитные действия", invert: false },
  { key: "passAccPct" as const, label: "Точность паса %", invert: false },
  { key: "crosses" as const, label: "Навесы", invert: false },
  { key: "aerialPct" as const, label: "Победы в воздухе %", invert: false },
];

type MetricKey = (typeof METRIC_CONFIG)[number]["key"];

// Диапазоны для fallback-нормализации (когда нет перцентилей)
const RADAR_LIMITS: Record<MetricKey, { min: number; max: number }> = {
  goals: { min: 0, max: 4 },
  shots: { min: 0, max: 15 },
  passes: { min: 0, max: 400 },
  passesPerShot: { min: 5, max: 60 }, // инвертируем
  defActions: { min: 0, max: 40 },
  passAccPct: { min: 60, max: 95 },
  crosses: { min: 0, max: 20 },
  aerialPct: { min: 30, max: 80 },
};

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function normalizeRange(
  key: MetricKey,
  raw: number | null | undefined,
  invert: boolean,
) {
  const value = raw ?? 0;
  const { min, max } = RADAR_LIMITS[key];
  const clamped = clamp(value, min, max);
  const range = max - min || 1;
  const norm = (clamped - min) / range; // 0..1
  return invert ? 1 - norm : norm;
}

/** ---------- Внутренний компонент радара (как у игроков) ---------- */

type RadarDatum = { label: string; pct: number };

type RadarProps = {
  data: RadarDatum[];
};

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const a = toRadians(angleDeg - 90); // 0° вверх
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

// переносим подписи в 1–2 строки, чтобы влезали вокруг радара
function wrapLabel(label: string, maxLen = 10): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxLen && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);

  return lines.slice(0, 2); // максимум 2 строки
}

function TeamRadarSvg({ data }: RadarProps) {
  const SIZE = 400; // общий размер SVG
  const PADDING = 90; // отступ от краёв
  const GRID_STEPS = 5;
  const LABEL_OFFSET = 34;
  const BADGE_INNER = 14;

  // Цвета адаптированы под общий стиль (темная/светлая тема)
  const GRID_COLOR = "rgba(148,163,184,0.4)"; // мягкая сетка (zinc-400 с альфой)
  const AXIS_COLOR = "var(--foreground)"; // текст осей по цвету темы
  const POLY_STROKE = "#ef4444"; // основной красный
  const POLY_FILL = "rgba(239,68,68,0.16)";
  const BADGE_BG = "#ef4444";
  const BADGE_TEXT = "#f9fafb"; // почти белый

  const N = data.length || 1;
  const center = SIZE / 2;
  const radius = center - PADDING;

  const stepDeg = 360 / N;
  const angles = [...Array(N)].map((_, i) => i * stepDeg);
  const gridRadii = [...Array(GRID_STEPS)].map(
    (_, i) => radius * ((i + 1) / GRID_STEPS),
  );

  const polyPoints = data.map((d, i) => {
    const r = radius * Math.max(0, Math.min(1, (d.pct ?? 0) / 100));
    return polarPoint(center, center, r, angles[i]);
  });
  const polyAttr = polyPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-label="team-radar-chart"
      className="max-w-full"
      style={{
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
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
          strokeWidth={idx === gridRadii.length - 1 ? 1.2 : 1}
          opacity={idx === gridRadii.length - 1 ? 0.9 : 0.6}
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
            opacity={0.8}
          />
        );
      })}

      {/* Подписи осей — всегда по центру точки, чтобы не обрезались */}
      {data.map((d, i) => {
        const outer = polarPoint(
          center,
          center,
          radius + LABEL_OFFSET,
          angles[i],
        );
        const alignCos = Math.cos(toRadians(angles[i] - 90));
        const align =
          alignCos > 0.25 ? "start" : alignCos < -0.25 ? "end" : "middle";

        return (
          <text
            key={`label-${i}`}
            x={outer.x}
            y={outer.y}
            fontSize={9}
            fill={AXIS_COLOR}
            textAnchor={align as any}
            dominantBaseline="middle"
          >
            {d.label}
          </text>
        );
      })}

      {/* Полигон команды */}
      <polygon
        points={polyAttr}
        fill={POLY_FILL}
        stroke={POLY_STROKE}
        strokeWidth={2}
      />

      {/* Точки + бейджи процентов (бейдж уводим внутрь) */}
      {data.map((d, i) => {
        const r = radius * Math.max(0, Math.min(1, (d.pct ?? 0) / 100));
        const dot = polarPoint(center, center, r, angles[i]);
        const badgeR = Math.max(0, r - BADGE_INNER);
        const badge = polarPoint(center, center, badgeR, angles[i]);
        const pct = Math.round(d.pct ?? 0);

        return (
          <g key={`pt-${i}`}>
            <circle cx={dot.x} cy={dot.y} r={3} fill={POLY_STROKE} />
            <g transform={`translate(${badge.x}, ${badge.y})`}>
              <rect
                x={-18}
                y={-10}
                width={36}
                height={14}
                rx={6}
                ry={6}
                fill={BADGE_BG}
              />
              <text
                x={0}
                y={-3}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill={BADGE_TEXT}
                dominantBaseline="middle"
              >
                {pct}%
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}


/** ---------- Основной клиентский компонент ---------- */

export default function TeamRadarClient({ teamId, scope = "recent" }: Props) {
  const [data, setData] = useState<TeamStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/team-stats/${teamId}?scope=${scope}`)
      .then((res) => res.json())
      .then((json: TeamStatsResponse) => {
        if (cancelled) return;
        if (!json.ok || !json.perMatch) {
          setError("Не удалось загрузить статистику команды.");
        } else {
          setData(json);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Ошибка при загрузке статистики команды.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, scope]);

  if (loading) {
    return (
      <div className="text-xs text-zinc-500">
        Загружаем профиль команды…
      </div>
    );
  }

  if (error || !data || !data.perMatch) {
    return (
      <div className="text-xs text-zinc-500">
        {error ?? "Нет данных для построения профиля команды."}
      </div>
    );
  }

  const m = data.perMatch;
  const matches = data.matches ?? 0;
  const radar = data.radarPercentiles;

  const passAccPct = m.pass_acc != null ? Number(m.pass_acc) * 100 : null;
  const aerialPct = m.aerial_pct != null ? Number(m.aerial_pct) * 100 : null;
  const passesPerShot =
    m.shots && m.shots > 0 && m.allpasses != null
      ? m.allpasses / m.shots
      : null;

  // сырые значения для fallback-нормализации
  const fallbackValues: Record<MetricKey, number | null> = {
    goals: m.goals ?? null,
    shots: m.shots ?? null,
    passes: m.allpasses ?? null,
    passesPerShot,
    defActions: m.def_actions ?? null,
    passAccPct,
    crosses: m.crosses ?? null,
    aerialPct,
  };

  const hasServerRadar =
    radar &&
    Object.values(radar).some(
      (v) => v !== null && v !== undefined && !Number.isNaN(Number(v)),
    );

  const radarData: RadarDatum[] = METRIC_CONFIG.map((cfg) => {
    let pct: number;

    if (hasServerRadar && radar) {
      const v = radar[cfg.key];
      if (v != null) {
        pct = Number(v);
      } else {
        const raw = fallbackValues[cfg.key];
        pct = Math.round(normalizeRange(cfg.key, raw, cfg.invert) * 100);
      }
    } else {
      const raw = fallbackValues[cfg.key];
      pct = Math.round(normalizeRange(cfg.key, raw, cfg.invert) * 100);
    }

    return { label: cfg.label, pct };
  });

  return (
  <div className="space-y-3 text-xs text-foreground">

    {/* Верхняя подпись */}
    <div className="text-[11px] text-muted-foreground">
      Диапазон: официальные матчи (с 18 сезона), всего {matches || 0} матчей.
    </div>

    {/* Центрированный радар */}
    <div className="flex justify-center w-full">
      <TeamRadarSvg data={radarData} />
    </div>

    {/* Нижняя подпись */}
    <div className="text-[11px] text-muted-foreground mt-1">
      Радар показывает перцентили по командам лиги (0–100%, где 100% — топ
      команды по метрике). При отсутствии перцентилей используется
      нормализация по фиксированным диапазонам.
    </div>

  </div>
);
}
