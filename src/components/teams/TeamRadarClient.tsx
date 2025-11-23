// src/components/teams/TeamRadarClient.tsx
"use client";

import { useEffect, useState } from "react";
import PlayerRadar, {
  type RadarDatum,
} from "@/components/players/PlayerRadar";

type TeamStatsPerMatch = {
  goals?: number | null;
  shots?: number | null;
  allpasses?: number | null;
  pass_acc?: number | null;
  crosses?: number | null;
  def_actions?: number | null;
  aerial_pct?: number | null;
};

type TeamStatsResponse = {
  ok: boolean;
  teamId: number;
  matches: number;
  scope: "recent" | "all";
  perMatch?: TeamStatsPerMatch;
};

type Props = {
  teamId: number;
  scope?: "recent" | "all";
};

// описание осей радара
const METRIC_CONFIG = [
  { key: "goals" as const, label: "Голы", invert: false },
  { key: "shots" as const, label: "Удары", invert: false },
  { key: "passes" as const, label: "Пасы", invert: false },
  {
    key: "passesPerShot" as const,
    label: "Пасов на удар",
    invert: true, // меньше — лучше
  },
  {
    key: "defActions" as const,
    label: "Защитные действия",
    invert: false,
  },
  {
    key: "passAccPct" as const,
    label: "Точность паса %",
    invert: false,
  },
  {
    key: "crosses" as const,
    label: "Навесы",
    invert: false,
  },
  {
    key: "aerialPct" as const,
    label: "Победы в воздухе %",
    invert: false,
  },
];

type MetricKey = (typeof METRIC_CONFIG)[number]["key"];

// рабочие диапазоны для нормализации (допущение для визуала)
const RADAR_LIMITS: Record<MetricKey, { min: number; max: number }> = {
  goals: { min: 0, max: 4 },
  shots: { min: 0, max: 15 },
  passes: { min: 0, max: 400 },
  passesPerShot: { min: 5, max: 60 }, // инвертируем
  defActions: { min: 0, max: 30 },
  passAccPct: { min: 60, max: 95 },
  crosses: { min: 0, max: 20 },
  aerialPct: { min: 30, max: 80 },
};

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function normalize(
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

  const passAccPct =
    m.pass_acc != null ? (m.pass_acc as number) * 100 : null;
  const aerialPct =
    m.aerial_pct != null ? (m.aerial_pct as number) * 100 : null;
  const passesPerShot =
    m.shots && m.shots > 0 && m.allpasses != null
      ? m.allpasses / m.shots
      : null;

  // сырые значения для осей
  const metricValues: Record<MetricKey, number | null> = {
    goals: m.goals ?? null,
    shots: m.shots ?? null,
    passes: m.allpasses ?? null,
    passesPerShot,
    defActions: m.def_actions ?? null,
    passAccPct,
    crosses: m.crosses ?? null,
    aerialPct,
  };

  // данные для радара 0–100
  const radarData: RadarDatum[] = METRIC_CONFIG.map((cfg) => {
    const norm = normalize(cfg.key, metricValues[cfg.key], cfg.invert); // 0..1
    return {
      label: cfg.label,
      pct: Math.round(norm * 100),
    };
  });

  return (
    <PlayerRadar
      title="Профиль команды"
      data={radarData}
      footnote={`*официальные матчи с 18 сезона, всего ${matches || 0} матчей`}
    />
  );
}
