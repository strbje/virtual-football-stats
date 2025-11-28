// src/components/teams/TeamSeasonStyle.tsx
"use client";

type SeasonProfile = {
  matches: number;

  goalsTotal: number;
  goalsPerMatch: number;
  xgTotal: number;
  xgPerMatch: number;
  shotsPerMatch: number;
  shotsOnTargetPerMatch: number;
  shotsAccuracyPct: number | null;
  passesPerShot: number | null;
  dangerCoeff: number | null;

  passAttemptsPerMatch: number;
  passAccuracyPct: number | null;
  xaTotal: number;
  xaPerMatch: number;
  pxa: number | null;

  crossesPerMatch: number;
  crossesSuccessPerMatch: number;
  crossesAccuracyPct: number | null;

  interceptsPerMatch: number;
  tacklesAttemptsPerMatch: number;
  tacklesWonPerMatch: number;
  defActionsPerMatch: number;
  aerialDuelsPerMatch: number;
  aerialWinPct: number | null;
};

export default function TeamSeasonStyle({ profile }: { profile: SeasonProfile }) {
  const p = profile;

  return (
  <section className="mt-4 vfs-card p-4 text-xs space-y-3">
    <h3 className="text-sm font-semibold text-foreground mb-1">
      Стиль игры в текущем сезоне
    </h3>

    {/* Атака */}
    <div>
      <div className="font-semibold mb-1 text-foreground">🎯 Атака</div>
      <ul className="space-y-0.5 text-muted-foreground">
        <li>
          Голы — {p.goalsPerMatch.toFixed(2)} за матч ({p.goalsTotal} /{" "}
          {p.matches})
        </li>
        <li>
          xG — {p.xgPerMatch.toFixed(2)} за матч ({p.xgTotal.toFixed(1)} /{" "}
          {p.matches})
        </li>
        <li>Удары — {p.shotsPerMatch.toFixed(2)} за матч</li>
        <li>Удары в створ — {p.shotsOnTargetPerMatch.toFixed(2)} за матч</li>
        <li>
          Точность ударов —{" "}
          {p.shotsAccuracyPct !== null
            ? `${p.shotsAccuracyPct.toFixed(1)}%`
            : "—"}
        </li>
        <li>
          Пасов на удар —{" "}
          {p.passesPerShot !== null ? p.passesPerShot.toFixed(2) : "—"}
        </li>
        <li>
          Кэф опасности удара —{" "}
          {p.dangerCoeff !== null ? p.dangerCoeff.toFixed(2) : "—"}
        </li>
      </ul>
    </div>

    {/* Созидание и владение */}
    <div>
      <div className="font-semibold mb-1 text-foreground">
        ⚡ Созидание и владение
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        <li>
          Попыток паса — {p.passAttemptsPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Точность паса —{" "}
          {p.passAccuracyPct !== null
            ? `${p.passAccuracyPct.toFixed(1)}%`
            : "—"}
        </li>
        <li>
          xA — {p.xaPerMatch.toFixed(2)} за матч (
          {p.xaTotal.toFixed(1)} / {p.matches})
        </li>
        <li>
          pXA —{" "}
          {p.pxa !== null ? p.pxa.toFixed(2) : "—"} — среднее количество пасов
          на 0.5 xA
        </li>
      </ul>
    </div>

    {/* Фланги и навесы */}
    <div>
      <div className="font-semibold mb-1 text-foreground">
        🌪 Фланги и навесы
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        <li>Навесы — {p.crossesPerMatch.toFixed(2)} за матч</li>
        <li>
          Удачные навесы — {p.crossesSuccessPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Точность навесов —{" "}
          {p.crossesAccuracyPct !== null
            ? `${p.crossesAccuracyPct.toFixed(1)}%`
            : "—"}
        </li>
      </ul>
    </div>

    {/* Оборона и воздух */}
    <div>
      <div className="font-semibold mb-1 text-foreground">
        🛡 Оборона и воздушные дуэли
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        <li>
          Перехваты — {p.interceptsPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Попытки отбора — {p.tacklesAttemptsPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Удачные отборы — {p.tacklesWonPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Всего защитных действий — {p.defActionsPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Воздушные дуэли — {p.aerialDuelsPerMatch.toFixed(2)} за матч
        </li>
        <li>
          Победы в воздушных дуэлях —{" "}
          {p.aerialWinPct !== null
            ? `${p.aerialWinPct.toFixed(1)}%`
            : "—"}
        </li>
      </ul>
    </div>
  </section>
);
}
