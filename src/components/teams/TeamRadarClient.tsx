// src/components/teams/TeamRadarClient.tsx
"use client";

import { useEffect, useState } from "react";

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
  crosses: number | null;
  def_actions: number | null;
  pass_acc: number | null;
  aerial_pct: number | null;
  passes_per_shot: number | null;
};

type TeamStatsResponse = {
  ok: boolean;
  teamId: number;
  matches: number;
  scope: "recent" | "all";
  perMatch?: TeamStatsPerMatch;
  radarPercentiles?: RadarPercentiles | null;
};

type Props = {
  teamId: number;
  scope?: "recent" | "all";
};

// конфиг осей радара — ключи строго совпадают с radarPercentiles
const METRIC_CONFIG = [
  { key: "goals" as const, label: "Голы" },
  { key: "shots" as const, label: "Удары" },
  { key: "passes" as const, label: "Пасы" },
  { key: "passes_per_shot" as const, label: "Пасов на удар" },
  { key: "def_actions" as const, label: "Защитные действия" },
  { key: "pass_acc" as const, label: "Точность паса, %" },
  { key: "crosses" as const, label: "Навесы" },
  { key: "aerial_pct" as const, label: "Победы в воздухе, %" },
];

type MetricKey = (typeof METRIC_CONFIG)[number]["key"];

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

  if (!radar) {
    // защита от случая, если API ещё не отдаёт radarPercentiles
    return (
      <div className="text-xs text-zinc-500">
        Перцентили по команде пока не доступны (radarPercentiles отсутствует в ответе API).
      </div>
    );
  }

  const passAccPct = m.pass_acc != null ? (m.pass_acc as number) * 100 : null;
  const aerialPct = m.aerial_pct != null ? (m.aerial_pct as number) * 100 : null;
  const passesPerShot =
    m.shots && m.shots > 0 && m.allpasses != null
      ? m.allpasses / m.shots
      : null;

  const fmt = (v: number | null | undefined, digits = 2) =>
    v == null ? "—" : v.toFixed(digits);

  // --- геометрия радара по перцентилям (0–100) ---
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 100;
  const count = METRIC_CONFIG.length;
  const layers = [0.25, 0.5, 0.75, 1];

  const points = METRIC_CONFIG.map((cfg, idx) => {
    const pct = radar[cfg.key as MetricKey] ?? 0; // 0–100
    const norm = Math.max(0, Math.min(1, pct / 100));
    const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
    const r = radius * norm;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="space-y-3 text-xs text-zinc-700">
      <div className="text-[11px] text-zinc-500">
        Диапазон: официальные матчи (с 18 сезона), всего {matches || 0} матчей.
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-stretch">
        {/* Радар (SVG) — стиль как у игрока, только одна рамка вокруг секции снаружи */}
        <div className="flex-1 flex items-center justify-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="max-w-full"
          >
            {/* сетка */}
            {layers.map((k, layerIdx) => {
              const r = radius * k;
              const layerPoints = METRIC_CONFIG.map((_, idx) => {
                const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                return `${x},${y}`;
              }).join(" ");
              return (
                <polygon
                  key={layerIdx}
                  points={layerPoints}
                  fill="none"
                  stroke="#27272a"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* лучи */}
            {METRIC_CONFIG.map((_, idx) => {
              const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
              const x = cx + radius * Math.cos(angle);
              const y = cy + radius * Math.sin(angle);
              return (
                <line
                  key={idx}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="#27272a"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* полигон команды — стиль под твой скрин (красный) */}
            <polygon
              points={polygonPoints}
              fill="rgba(239,68,68,0.18)"
              stroke="#ef4444"
              strokeWidth={2}
            />

            {/* точки */}
            {points.map((p, idx) => (
              <circle key={idx} cx={p.x} cy={p.y} r={3} fill="#ef4444" />
            ))}

            {/* подписи осей */}
            {METRIC_CONFIG.map((cfg, idx) => {
              const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
              const labelRadius = radius + 18;
              const x = cx + labelRadius * Math.cos(angle);
              const y = cy + labelRadius * Math.sin(angle);

              const textAnchor =
                Math.abs(Math.cos(angle)) < 0.1
                  ? "middle"
                  : Math.cos(angle) > 0
                  ? "start"
                  : "end";

              return (
                <text
                  key={cfg.key}
                  x={x}
                  y={y}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  className="fill-zinc-100 text-[10px]"
                >
                  {cfg.label}
                </text>
              );
            })}
          </svg>
        </div>

        {/* легенда с реальными числами за матч */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div className="flex justify-between">
            <span>Голы за матч</span>
            <span className="font-semibold">{fmt(m.goals)}</span>
          </div>
          <div className="flex justify-between">
            <span>Удары за матч</span>
            <span className="font-semibold">{fmt(m.shots)}</span>
          </div>
          <div className="flex justify-between">
            <span>Пасы за матч</span>
            <span className="font-semibold">{fmt(m.allpasses)}</span>
          </div>
          <div className="flex justify-between">
            <span>Пасов на удар</span>
            <span className="font-semibold">{fmt(passesPerShot)}</span>
          </div>
          <div className="flex justify-between">
            <span>Защитные действия за матч</span>
            <span className="font-semibold">{fmt(m.def_actions)}</span>
          </div>
          <div className="flex justify-between">
            <span>Точность паса, %</span>
            <span className="font-semibold">{fmt(passAccPct, 1)}</span>
          </div>
          <div className="flex justify-between">
            <span>Навесов за матч</span>
            <span className="font-semibold">{fmt(m.crosses)}</span>
          </div>
          <div className="flex justify-between">
            <span>Побед в воздухе, %</span>
            <span className="font-semibold">{fmt(aerialPct, 1)}</span>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 mt-1">
        Радар показывает перцентили по командам лиги (0–100%, где 100% — топ команды по метрике).
      </div>
    </div>
  );
}
