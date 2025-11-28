import * as React from "react";

// Новый тип
type RoleItem = { label: string; value: number };
// Старый тип
type LegacyRolePercent = { role: string; percent: number };
// Лиги
type LeagueItem = { label: string; pct: number };

type Props = {
  roles?: RoleItem[];
  data?: RoleItem[] | LegacyRolePercent[];
  leagues?: LeagueItem[];
  tooltip?: boolean;
};

const GROUP_ROLES: Record<string, string[]> = {
  Форвард: ["ЦФД", "ЛФД", "ПФД", "ФРВ", "ЛФА", "ПФА"],
  "Атакующий полузащитник": ["ЦАП", "ЛАП", "ПАП"],
  "Крайний полузащитник": ["ЛП", "ПП"],
  "Центральный полузащитник": ["ЦП", "ЛЦП", "ПЦП"],
  "Опорный полузащитник": ["ЦОП", "ЛОП", "ПОП"],
  "Крайний защитник": ["ЛЗ", "ПЗ"],
  "Центральный защитник": ["ЦЗ", "ЛЦЗ", "ПЦЗ"],
  Вратарь: ["ВРТ"],
};

function toRoleItems(input?: RoleItem[] | LegacyRolePercent[]): RoleItem[] {
  if (!input) return [];
  const first = input[0] as any;

  // Уже новый формат { label, value }
  if (first && "label" in first && "value" in first) {
    return (input as RoleItem[]).map((r) => ({
      label: r.label,
      value: Number(r.value || 0),
    }));
  }

  // Старый формат { role, percent }
  return (input as LegacyRolePercent[]).map((r) => ({
    label: r.role,
    value: Number(r.percent || 0),
  }));
}

function BarRow({
  label,
  percent,
  hint,
}: {
  label: string;
  percent: number;
  hint?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="flex items-center gap-3 text-xs md:text-sm">
      {/* подпись слева, перенос по словам, тултип на hover */}
      <div
        className="w-44 shrink-0 text-zinc-100 leading-snug whitespace-normal break-words"
        title={hint}
      >
        {label}
      </div>

      {/* трек фиксированной ширины, хорошо видимый на тёмном фоне */}
      <div className="h-2.5 w-40 rounded-full bg-zinc-700/80 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-400"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* процент справа */}
      <div className="w-10 text-right text-zinc-100">{pct}%</div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
  tooltip = false,
}: Props) {
  const left = roles ? toRoleItems(roles) : toRoleItems(data);

  const roleHints: Record<string, string | undefined> = {};
  if (tooltip) {
    for (const [groupLabel, codes] of Object.entries(GROUP_ROLES)) {
      roleHints[groupLabel] = `Входит: ${codes.join(", ")}`;
    }
  }

  const leagueHints: Record<string, string | undefined> = {};
  if (tooltip) {
    leagueHints["Прочие"] =
      "Включает турниры вне ПЛ/ФНЛ/ПФЛ/ЛФЛ (например, LastDance, Кубок России и др.)";
  }

  return (
    <div className="vfs-card">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Левый столбец: амплуа */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Распределение по амплуа
          </h3>
          <div className="space-y-1.5">
            {left.map((r) => (
              <BarRow
                key={r.label}
                label={r.label}
                percent={r.value}
                hint={roleHints[r.label]}
              />
            ))}
          </div>
        </div>

        {/* Правый столбец: лиги */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Распределение по лигам
          </h3>
          {!leagues.length ? (
            <div className="text-sm text-zinc-500">Нет данных</div>
          ) : (
            <div className="space-y-1.5">
              {leagues.map((l) => (
                <BarRow
                  key={l.label}
                  label={l.label}
                  percent={l.pct}
                  hint={leagueHints[l.label]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
