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

  const fmt = (v: number | null | undefined, digits = 2) =>
    v == null ? "—" : v.toFixed(digits);

  const passAccPct =
    m.pass_acc != null ? (m.pass_acc as number) * 100 : null;
  const aerialPct =
    m.aerial_pct != null ? (m.aerial_pct as number) * 100 : null;

  const passesPerShot =
    m.shots && m.shots > 0 && m.allpasses != null
      ? m.allpasses / m.shots
      : null;

  return (
    <div className="space-y-2 text-xs text-zinc-700">
      <div className="text-[11px] text-zinc-500">
        Диапазон: официальные матчи (с 18 сезона), всего {matches || 0} матчей.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
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
          <span>Точность паса, %</span>
          <span className="font-semibold">{fmt(passAccPct, 1)}</span>
        </div>
        <div className="flex justify-between">
          <span>Пасов на удар</span>
          <span className="font-semibold">{fmt(passesPerShot)}</span>
        </div>
        <div className="flex justify-between">
          <span>Навесов за матч</span>
          <span className="font-semibold">{fmt(m.crosses)}</span>
        </div>
        <div className="flex justify-between">
          <span>Защитные действия за матч</span>
          <span className="font-semibold">{fmt(m.def_actions)}</span>
        </div>
        <div className="flex justify-between">
          <span>Побед в воздухе, %</span>
          <span className="font-semibold">{fmt(aerialPct, 1)}</span>
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 mt-1">
        Эти 8 метрик — оси для командного радара. Сейчас выводим их текстом; позже можно
        подвесить визуальный полигон на те же данные.
      </div>
    </div>
  );
}
