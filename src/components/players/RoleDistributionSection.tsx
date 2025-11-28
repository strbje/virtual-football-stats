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

  /** Можно оставить на будущее, сейчас не критично */
  labelWidthPx?: number;
  rolesBarWidthPx?: number;
  leaguesBarWidthPx?: number;

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

function toRoleItems(
  input?: RoleItem[] | LegacyRolePercent[] | undefined,
): RoleItem[] {
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
  labelWidthPx?: number; // оставляем в сигнатуре для совместимости
  barWidthPx?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="flex items-center gap-3 text-xs md:text-sm">
      {/* подпись слева, с переносом и тултипом */}
      <div
        className="shrink-0 leading-snug text-zinc-100"
        style={{ minWidth: 180 }}
        title={hint}
      >
        {label}
      </div>

      {/* полоса занимает всё оставшееся место */}
      <div className="relative h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-400"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* процент справа */}
      <div className="w-10 shrink-0 text-right text-zinc-100">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
  labelWidthPx = 320, // сейчас не используем, но оставляем сигнатуру
  rolesBarWidthPx = 520,
  leaguesBarWidthPx = 460,
  tooltip = false,
}: Props) {
  // Унифицируем вход
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
                hint={roleHints[r.label]}
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
