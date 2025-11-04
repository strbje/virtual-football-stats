import React from "react";
import type { RolePercent } from "@/utils/roles";

type LeagueBar = { label: string; percent: number };

export default function RoleDistributionSection({
  roles,
  leagues,
  widthPx,
  tooltip,
}: {
  roles: RolePercent[];
  leagues?: LeagueBar[];
  widthPx: number;
  tooltip?: boolean;
}) {
  const W = Math.max(320, widthPx); // визуально не сжимать слишком
  const bar = (label: string, percent: number, key: string) => (
    <div key={key} className="flex items-center gap-3">
      <div className="w-56 text-sm text-gray-700">{label}</div>
      <div className="flex-1">
        <div
          className="h-2.5 rounded bg-emerald-100 relative"
          style={{ width: W }}
          title={tooltip ? `${percent}%` : undefined}
        >
          <div
            className="absolute left-0 top-0 h-2.5 rounded bg-emerald-600"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="w-10 text-sm text-gray-500">{percent}%</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        {roles.map((r) => bar(r.role, r.percent, `role-${r.role}`))}
      </div>

      {leagues && leagues.length > 0 && (
        <div>
          <div className="mb-2 font-medium text-gray-700">Распределение по лигам</div>
          {leagues.map((l) => bar(l.label, l.percent, `lg-${l.label}`))}
        </div>
      )}
    </div>
  );
}
