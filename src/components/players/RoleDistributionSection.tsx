import * as React from "react";

/** Левый бар: роли (группы амплуа). Правый бар: лиги */
type RoleItem = { label: string; value: number }; // value = %
type LeagueItem = { label: string; pct: number }; // pct = %

type Props = {
  roles: RoleItem[];
  leagues?: LeagueItem[];
  widthPx?: number;
  tooltip?: boolean;
};

const GROUP_ROLES: Record<string, string[]> = {
  "Форвард": ["ЦФД", "ЛФД", "ПФД", "ФРВ"],
  "Атакующий полузащитник": ["ЦАП", "ЛАП", "ПАП"],
  "Крайний полузащитник": ["ЛП", "ПП"],
  "Центральный полузащитник": ["ЦП", "ЛЦП", "ПЦП"],
  "Опорный полузащитник": ["ЦОП", "ЛОП", "ПОП"],
  "Крайний защитник": ["ЛЗ", "ПЗ"],
  "Центральный защитник": ["ЦЗ", "ЛЦЗ", "ПЦЗ"],
  "Вратарь": ["ВРТ"],
};

function BarRow({
  label,
  percent,
  hint,
  widthPx = 420,
}: {
  label: string;
  percent: number;
  hint?: string;
  widthPx?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex items-center gap-3 py-1" title={hint}>
      <div className="w-[210px] text-sm text-zinc-700 truncate">{label}</div>
      <div
        className="relative h-[8px] rounded bg-zinc-200"
        style={{ width: widthPx }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded bg-zinc-900"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-[40px] text-right text-sm tabular-nums text-zinc-600">
        {pct}%
      </div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  leagues = [],
  widthPx = 420,
  tooltip = false,
}: Props) {
  // Подсказки по группам амплуа
  const roleHints: Record<string, string | undefined> = {};
  if (tooltip) {
    for (const [g, list] of Object.entries(GROUP_ROLES)) {
      roleHints[g] = `Входит: ${list.join(", ")}`;
    }
  }

  // Подсказки для лиг — отдельно для «Прочие»
  const leagueHints: Record<string, string | undefined> = {};
  if (tooltip) {
    leagueHints["Прочие"] =
      "Включает турниры вне ПЛ/ФНЛ/ПФЛ/ЛФЛ (например, LastDance, Кубок России и др.)";
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Левый: роли */}
      <div>
        <div className="text-sm font-semibold mb-2">Распределение по амплуа</div>
        <div>
          {roles.map((r) => (
            <BarRow
              key={r.label}
              label={r.label}
              percent={r.value}
              hint={roleHints[r.label]}
              widthPx={widthPx}
            />
          ))}
        </div>
      </div>

      {/* Правый: лиги */}
      <div>
        <div className="text-sm font-semibold mb-2">Распределение по лигам</div>
        {!leagues?.length ? (
          <div className="text-sm text-zinc-500">Нет данных</div>
        ) : (
          <div>
            {leagues.map((l) => (
              <BarRow
                key={l.label}
                label={l.label}
                percent={l.pct}
                hint={leagueHints[l.label]}
                widthPx={widthPx}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
