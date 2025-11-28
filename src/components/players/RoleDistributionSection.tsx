import * as React from "react";

// Новый нормальный тип
type RoleItem = { label: string; value: number };
// Старый тип, который приходит со страницы
type LegacyRolePercent = { role: string; percent: number };
// Правый бар (лиги)
type LeagueItem = { label: string; pct: number };

type Props = {
  /** Новый проп — уже готовые пары label/value */
  roles?: RoleItem[];
  /** Наследный проп — мог быть либо RoleItem[], либо RolePercent[] */
  data?: RoleItem[] | LegacyRolePercent[];
  leagues?: LeagueItem[];

  /** Подсказки по группам амплуа / лигам по hover */
  tooltip?: boolean;
};

const GROUP_ROLES: Record<string, string[]> = {
  Форвард: ["ЦФД", "ЛФД", "ПФД", "ФРВ"],
  "Атакующий полузащитник": ["ЦАП", "ЛАП", "ПАП"],
  "Крайний полузащитник": ["ЛП", "ПП"],
  "Центральный полузащитник": ["ЦП", "ЛЦП", "ПЦП"],
  "Опорный полузащитник": ["ЦОП", "ЛОП", "ПОП"],
  "Крайний защитник": ["ЛЗ", "ПЗ"],
  "Центральный защитник": ["ЦЗ", "ЛЦЗ", "ПЦЗ"],
  Вратарь: ["ВРТ"],
};

function toRoleItems(
  input?: RoleItem[] | LegacyRolePercent[] | undefined,
): RoleItem[] {
  if (!input) return [];

  // Уже новый формат
  if (
    input.length &&
    "label" in (input[0] as any) &&
    "value" in (input[0] as any)
  ) {
    return (input as RoleItem[]).map((r) => ({
      label: r.label,
      value: Number(r.value || 0),
    }));
  }

  // Старый формат
  return (input as LegacyRolePercent[]).map((r) => ({
    label: (r as LegacyRolePercent).role,
    value: Number((r as LegacyRolePercent).percent || 0),
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
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));

  return (
    <div
      className="flex items-center gap-3 text-xs md:text-sm"
      title={hint || undefined}
    >
      {/* подпись слева */}
      <div className="w-40 shrink-0 text-zinc-200">{label}</div>

      {/* полоса — занимает всё свободное место */}
      <div className="relative h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-400"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* процент справа */}
      <div className="w-10 shrink-0 text-right text-zinc-200">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
  tooltip = false,
}: Props) {
  // Унифицируем вход: либо roles, либо data
  const left = roles ? toRoleItems(roles) : toRoleItems(data);

  const roleHints: Record<string, string | undefined> = {};
  if (tooltip) {
    for (const [g, list] of Object.entries(GROUP_ROLES)) {
      roleHints[g] = `Входит: ${list.join(", ")}`;
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
        {/* Левый: амплуа */}
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
                hint={tooltip ? roleHints[r.label] : undefined}
              />
            ))}
          </div>
        </div>

        {/* Правый: лиги */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Распределение по лигам
          </h3>
          {!leagues?.length ? (
            <div className="text-sm text-zinc-500">Нет данных</div>
          ) : (
            <div className="space-y-1.5">
              {leagues.map((l) => (
                <BarRow
                  key={l.label}
                  label={l.label}
                  percent={l.pct}
                  hint={tooltip ? leagueHints[l.label] : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
