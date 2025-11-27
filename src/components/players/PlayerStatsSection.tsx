// src/components/players/PlayerStatsSection.tsx

type Totals = {
  matches: number;

  goals: number;
  assists: number;
  goal_contrib: number;
  xg: number;
  xg_delta: number;
  shots: number;
  shots_on_target_pct: number | null;
  shots_per_goal: number | null;

  passes_xa: number;
  key_passes: number;
  pre_assists: number;
  allpasses: number;
  completedpasses: number;
  pass_acc: number | null;
  pxa: number | null;

  allstockes: number;
  completedstockes: number;
  dribble_pct: number | null;

  intercepts: number;
  selection: number;
  completedtackles: number;
  blocks: number;
  allselection: number;
  def_actions: number;
  beaten_rate: number | null;

  outs: number;
  duels_air: number;
  duels_air_win: number;
  aerial_pct: number | null;

  duels_off_win: number;
  duels_off_lose: number;
  off_duels_total: number;
  off_duels_win_pct: number | null;

  crosses: number;
  allcrosses: number;
  cross_acc: number | null;
};

type Props = {
  matches: number;
  totals: Totals;
};

export default function PlayerStatsSection({ matches, totals }: Props) {
  const m = matches > 0 ? matches : 0;

  const perMatch = (v: number | null | undefined) =>
    !m || v == null ? null : v / m;

  const fmtInt = (v: number | null | undefined) =>
    v == null ? "—" : Math.round(v).toString();

  const fmt1 = (v: number | null | undefined) =>
    v == null ? "—" : v.toFixed(1);

  const fmtPct = (v: number | null | undefined) =>
    v == null ? "—" : `${(v * 100).toFixed(1)}%`;

  return (
  <section className="mt-6 space-y-4">
    <h3 className="vfs-section-title">Статистика по действиям</h3>
    <div className="text-xs text-zinc-400 mb-2">
      Только официальные турниры (с 18 сезона). В таблице показаны итого и значения за матч.
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Атака */}
      <div className="vfs-card">
        <h4 className="font-semibold text-sm mb-3 text-foreground">Атака</h4>
        <dl className="space-y-1 text-sm">
          <Row
            label="Голы"
            total={fmtInt(totals.goals)}
            perMatch={fmt1(perMatch(totals.goals))}
          />
          <Row
            label="Голевые передачи"
            total={fmtInt(totals.assists)}
            perMatch={fmt1(perMatch(totals.assists))}
          />
          <Row
            label="Гол+пас"
            total={fmtInt(totals.goal_contrib)}
            perMatch={fmt1(perMatch(totals.goal_contrib))}
          />
          <Row
            label="Ожидаемые голы (xG)"
            total={fmt1(totals.xg)}
            perMatch={fmt1(perMatch(totals.xg))}
          />
          <Row
            label="Реализация от xG (голы − xG)"
            total={fmt1(totals.xg_delta)}
            perMatch={fmt1(perMatch(totals.xg_delta))}
          />
          <Row
            label="Удары"
            total={fmtInt(totals.shots)}
            perMatch={fmt1(perMatch(totals.shots))}
          />
          <Row
            label="Точность ударов"
            total={fmtPct(totals.shots_on_target_pct)}
          />
          <Row
            label="Ударов на гол"
            total={
              totals.shots_per_goal == null
                ? "—"
                : totals.shots_per_goal.toFixed(2)
            }
          />
        </dl>
      </div>

      {/* Созидание / пасы */}
      <div className="vfs-card">
        <h4 className="font-semibold text-sm mb-3 text-foreground">Созидание и пасы</h4>
        <dl className="space-y-1 text-sm">
          <Row
            label="Ожидаемые голевые передачи (passes_xa)"
            total={fmtInt(totals.passes_xa)}
            perMatch={fmt1(perMatch(totals.passes_xa))}
          />
          <Row
            label="Важные передачи"
            total={fmtInt(totals.key_passes)}
            perMatch={fmt1(perMatch(totals.key_passes))}
          />
          <Row
            label="Предголевые передачи"
            total={fmtInt(totals.pre_assists)}
            perMatch={fmt1(perMatch(totals.pre_assists))}
          />
          <Row
            label="Все пасы"
            total={fmtInt(totals.allpasses)}
            perMatch={fmt1(perMatch(totals.allpasses))}
          />
          <Row
            label="Точные пасы"
            total={fmtInt(totals.completedpasses)}
            perMatch={fmt1(perMatch(totals.completedpasses))}
          />
          <Row label="Точность пасов" total={fmtPct(totals.pass_acc)} />
          <Row
            label="pXA (пасов на 0.5 xA)"
            total={totals.pxa == null ? "—" : totals.pxa.toFixed(1)}
          />
        </dl>
      </div>

      {/* Дриблинг */}
      <div className="vfs-card">
        <h4 className="font-semibold text-sm mb-3 text-foreground">Дриблинг</h4>
        <dl className="space-y-1 text-sm">
          <Row
            label="Попытки дриблинга"
            total={fmtInt(totals.allstockes)}
            perMatch={fmt1(perMatch(totals.allstockes))}
          />
          <Row
            label="Удачные обводки"
            total={fmtInt(totals.completedstockes)}
            perMatch={fmt1(perMatch(totals.completedstockes))}
          />
          <Row
            label="Успешность дриблинга"
            total={fmtPct(totals.dribble_pct)}
          />
        </dl>
      </div>

      {/* Оборона */}
      <div className="vfs-card">
        <h4 className="font-semibold text-sm mb-3 text-foreground">Оборона</h4>
        <dl className="space-y-1 text-sm">
          <Row
            label="Перехваты"
            total={fmtInt(totals.intercepts)}
            perMatch={fmt1(perMatch(totals.intercepts))}
          />
          <Row
            label="Отборы (попытки)"
            total={fmtInt(totals.allselection)}
            perMatch={fmt1(perMatch(totals.allselection))}
          />
          <Row
            label="Удачные отборы"
            total={fmtInt(totals.selection)}
            perMatch={fmt1(perMatch(totals.selection))}
          />
          <Row
            label="Удачные подкатые"
            total={fmtInt(totals.completedtackles)}
            perMatch={fmt1(perMatch(totals.completedtackles))}
          />
          <Row
            label="Блоки"
            total={fmtInt(totals.blocks)}
            perMatch={fmt1(perMatch(totals.blocks))}
          />
          <Row
            label="Защитные действия"
            total={fmtInt(totals.def_actions)}
            perMatch={fmt1(perMatch(totals.def_actions))}
          />
          <Row
            label="Beaten Rate"
            total={fmtPct(totals.beaten_rate)}
          />
        </dl>
      </div>

      {/* Дуэли / выносы */}
      <div className="vfs-card">
        <h4 className="font-semibold text-sm mb-3 text-foreground">Дуэли и игра головой</h4>
        <dl className="space-y-1 text-sm">
          <Row
            label="Выносы"
            total={fmtInt(totals.outs)}
            perMatch={fmt1(perMatch(totals.outs))}
          />
          <Row
            label="Воздушные дуэли (всего)"
            total={fmtInt(totals.duels_air)}
            perMatch={fmt1(perMatch(totals.duels_air))}
          />
          <Row
            label="Выигранные воздушные дуэли"
            total={fmtInt(totals.duels_air_win)}
            perMatch={fmt1(perMatch(totals.duels_air_win))}
          />
          <Row
            label="% воздушных дуэлей"
            total={fmtPct(totals.aerial_pct)}
          />
          <Row
            label="Атака: дуэли всего"
            total={fmtInt(totals.off_duels_total)}
            perMatch={fmt1(perMatch(totals.off_duels_total))}
          />
          <Row
            label="Атака: % выигранных дуэлей"
            total={fmtPct(totals.off_duels_win_pct)}
          />
        </dl>
      </div>

      {/* Навесы */}
      <div className="vfs-card">
        <h4 className="font-semibold text-sm mb-3 text-foreground">Навесы</h4>
        <dl className="space-y-1 text-sm">
          <Row
            label="Навесы (попытки)"
            total={fmtInt(totals.allcrosses)}
            perMatch={fmt1(perMatch(totals.allcrosses))}
          />
          <Row
            label="Удачные навесы"
            total={fmtInt(totals.crosses)}
            perMatch={fmt1(perMatch(totals.crosses))}
          />
          <Row
            label="% точности навесов"
            total={fmtPct(totals.cross_acc)}
          />
        </dl>
      </div>
    </div>
  </section>
);
}

type RowProps = {
  label: string;
  total: string;
  perMatch?: string;
};

function Row({ label, total, perMatch }: RowProps) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right text-foreground">
        <span className="font-medium">{total}</span>
        {perMatch !== undefined && perMatch !== "—" && (
          <span className="ml-1 text-xs text-zinc-500">
            ({perMatch} за матч)
          </span>
        )}
      </dd>
    </div>
  );
}
