import * as React from "react";

type RoleItem = { label: string; value: number };
type LegacyRolePercent = { role: string; percent: number };
type LeagueItem = { label: string; pct: number };

type Props = {
  roles?: RoleItem[];
  data?: RoleItem[] | LegacyRolePercent[];
  leagues?: LeagueItem[];
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

function BarRow({
  label,
  percent,
}: {
  label: string;
  percent: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="grid grid-cols-[1fr_60px_40px] items-center gap-2 text-sm">
      {/* название амплуа */}
      <div className="text-zinc-100 leading-snug">{label}</div>

      {/* бар */}
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-sky-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* число */}
      <div className="text-right text-zinc-200">{pct}%</div>
    </div>
  );
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
}: Props) {
  const left = roles ? toRoleItems(roles) : toRoleItems(data);

  return (
    <div className="vfs-card p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Левая колонка */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">
            Распределение по амплуа
          </h3>

          <div className="space-y-2">
            {left.map((r) => (
              <BarRow key={r.label} label={r.label} percent={r.value} />
            ))}
          </div>
        </div>

        {/* Правая колонка */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">
            Распределение по лигам
          </h3>

          {!leagues.length ? (
            <div className="text-sm text-zinc-500">Нет данных</div>
          ) : (
            <div className="space-y-2">
              {leagues.map((l) => (
                <BarRow key={l.label} label={l.label} percent={l.pct} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
