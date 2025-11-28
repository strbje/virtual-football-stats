import * as React from "react";

type RoleItem = { label: string; value: number };
type LegacyRolePercent = { role: string; percent: number };
type LeagueItem = { label: string; pct: number };

type Props = {
  roles?: RoleItem[];
  data?: RoleItem[] | LegacyRolePercent[];
  leagues?: LeagueItem[];
  tooltip?: boolean;
};

// Группы амплуа для подсказок
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

function toRoleItems(
  input?: RoleItem[] | LegacyRolePercent[]
): RoleItem[] {
  if (!input) return [];

  const first = input[0] as any;
  if (first && "label" in first && "value" in first) {
    return (input as RoleItem[]).map((r) => ({
      label: r.label,
      value: Number(r.value || 0),
    }));
  }

  return (input as LegacyRolePercent[]).map((r) => ({
    label: r.role,
    value: Number(r.percent || 0),
  }));
}

type BarRowProps = {
  label: string;
  percent: number;
  hint?: string;
};

function BarRow({ label, percent, hint }: BarRowProps) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className="grid grid-cols-[1fr_80px_40px] items-center gap-2 text-sm"
      title={hint}
    >
      {/* название (может переноситься на 2 строки) */}
      <div className="text-zinc-100 leading-snug">{label}</div>

      {/* бар */}
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-sky-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* число справа */}
      <div className="text-right text-zinc-200">{pct}%</div>
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
    for (const [group, list] of Object.entries(GROUP_ROLES)) {
      roleHints[group] = `Входит: ${list.join(", ")}`;
    }
  }

  const leagueHints: Record<string, string | undefined> = {};
  if (tooltip) {
    leagueHints["Прочие"] =
      "Включает турниры вне ПЛ/ФНЛ/ПФЛ/ЛФЛ (например, LastDance, Кубок России и др.)";
  }

  return (
    <div className="vfs-card p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Левая колонка: амплуа */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">
            Распределение по амплуа
          </h3>

          <div className="space-y-2">
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

        {/* Правая колонка: лиги */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">
            Распределение по лигам
          </h3>

          {!leagues.length ? (
            <div className="text-sm text-zinc-500">Нет данных</div>
          ) : (
            <div className="space-y-2">
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
