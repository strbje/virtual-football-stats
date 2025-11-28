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

  /** Ширина колонки с подписями слева (амплуа/лиги), px */
  labelWidthPx?: number;
  /** Ширина прогресс-бара слева (амплуа), px */
  rolesBarWidthPx?: number;
  /** Ширина прогресс-бара справа (лиги), px */
  leaguesBarWidthPx?: number;

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
  return (input as LegacyRolePercent[]).map((r) => ({
    label: (r as LegacyRolePercent).role,
    value: Number((r as LegacyRolePercent).percent || 0),
  }));
}

function BarRow({
  label,
  percent,
  hint,
  labelWidthPx,
  barWidthPx,
}: {
  label: string;
  percent: number;
  hint?: string;
  labelWidthPx: number;
  barWidthPx: number;
}) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));

  return (
    <div className="flex items-center gap-3 text-xs md:text-sm">
      {/* подпись слева */}
      <div className="shrink-0" style={{ width: labelWidthPx }}>
        <div className="text-zinc-200">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>
        )}
      </div>

      {/* полоса */}
      <div
        className="relative h-1.5 rounded-full bg-zinc-800 overflow-hidden"
        style={{ width: barWidthPx }}
      >
        <div
          className="h-full rounded-full bg-sky-400"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* процент справа */}
      <div className="w-10 text-right text-zinc-200">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
  labelWidthPx = 320, // было 210 → расширил для длинных русских названий
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
          <div>
            {left.map((r) => (
              <BarRow
                key={r.label}
                label={r.label}
                percent={r.value}
                hint={roleHints[r.label]}
                labelWidthPx={labelWidthPx}
                barWidthPx={rolesBarWidthPx}
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
            <div>
              {leagues.map((l) => (
                <BarRow
                  key={l.label}
                  label={l.label}
                  percent={l.pct}
                  hint={leagueHints[l.label]}
                  labelWidthPx={labelWidthPx}
                  barWidthPx={leaguesBarWidthPx}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
