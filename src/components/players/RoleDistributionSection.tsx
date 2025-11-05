// src/components/players/RoleDistributionSection.tsx
import * as React from "react";

// Новый нормальный тип
type RoleItem = { label: string; value: number };
// Старый тип, который приходит со страницы src/components/players/page.tsx
type LegacyRolePercent = { role: string; percent: number };
// Правый бар (лиги)
type LeagueItem = { label: string; pct: number };

type Props = {
  /** Новый проп — уже готовые пары label/value */
  roles?: RoleItem[];
  /** Наследный проп — мог быть либо RoleItem[], либо RolePercent[] */
  data?: RoleItem[] | LegacyRolePercent[];
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

function toRoleItems(input?: RoleItem[] | LegacyRolePercent[] | undefined): RoleItem[] {
  if (!input) return [];
  // Если это уже RoleItem[]
  if (input.length && "label" in (input[0] as any) && "value" in (input[0] as any)) {
    return (input as RoleItem[]).map((r) => ({ label: r.label, value: Number(r.value || 0) }));
  }
  // Иначе считаем, что это LegacyRolePercent[] -> превращаем в label/value
  return (input as LegacyRolePercent[]).map((r) => ({
    label: (r as LegacyRolePercent).role,
    value: Number((r as LegacyRolePercent).percent || 0),
  }));
}

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
      <div className="relative h-[8px] rounded bg-zinc-200" style={{ width: widthPx }}>
        <div className="absolute left-0 top-0 h-full rounded bg-zinc-900" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-[40px] text-right text-sm tabular-nums text-zinc-600">{pct}%</div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
  widthPx = 420,
  tooltip = false,
}: Props) {
  // Унифицируем вход
  const left: RoleItem[] = roles ? toRoleItems(roles) : toRoleItems(data);

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Левый: амплуа */}
      <div>
        <div className="text-sm font-semibold mb-2">Распределение по амплуа</div>
        <div>
          {left.map((r) => (
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
