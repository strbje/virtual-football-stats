"use client";

import React from "react";
import type { RoleItem, LeagueBucket } from "./types";

type Props = {
  roles: RoleItem[];              // [{label,value}]
  leagues?: LeagueBucket[];       // [{label,pct}]
  widthPx?: number;               // чтобы ровняться под ширину теплокарты (500)
  tooltip?: boolean;              // ховер-подсказки
};

export default function RoleDistributionSection({
  roles,
  leagues = [],
  widthPx = 500,
  tooltip = true,
}: Props) {
  const barWidth = widthPx; // ширина контейнера, совпадает с теплокартой

  return (
    <div className="space-y-6">
      {/* БАР: распределение ролей */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Распределение по амплуа</div>
        <div className="space-y-2">
          {roles.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-56 shrink-0 text-sm">{r.label}</div>
              <div className="h-2 w-full rounded bg-zinc-100" style={{ maxWidth: barWidth - 56 }}>
                <div
                  className="h-2 rounded bg-zinc-900"
                  style={{ width: `${r.value}%` }}
                  title={tooltip ? `${r.value}%` : undefined}
                />
              </div>
              <div className="w-10 text-right text-sm tabular-nums">{r.value}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* БАР: распределение по лигам */}
      {leagues.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Распределение по лигам</div>
          <div className="space-y-2">
            {leagues.map((x) => (
              <div key={x.label} className="flex items-center gap-3">
                <div className="w-56 shrink-0 text-sm">{x.label}</div>
                <div className="h-2 w-full rounded bg-zinc-100" style={{ maxWidth: barWidth - 56 }}>
                  <div
                    className="h-2 rounded bg-zinc-900"
                    style={{ width: `${x.pct}%` }}
                    title={tooltip ? `${x.pct}%` : undefined}
                  />
                </div>
                <div className="w-10 text-right text-sm tabular-nums">{x.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
