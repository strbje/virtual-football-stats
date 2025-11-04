// src/app/components/player/RoleDistributionSection.tsx
"use client";

import React from "react";
import type { RoleItem, LeagueBucket } from "@/utils/roles";

type Props = {
  /** новый проп (рекомендуемый) */
  roles?: RoleItem[];
  /** старый проп из page.tsx — оставлен для обратной совместимости */
  data?: RoleItem[];
  /** опциональное распределение по лигам */
  leagues?: LeagueBucket[];
  /** чтобы ровняться под ширину теплокарты (по умолчанию 500) */
  widthPx?: number;
  /** включать title-подсказки на барах */
  tooltip?: boolean;
};

export default function RoleDistributionSection({
  roles,
  data,
  leagues = [],
  widthPx = 500,
  tooltip = true,
}: Props) {
  // единая точка входа: поддерживаем и roles, и data
  const items: RoleItem[] = roles ?? data ?? [];

  const barWidth = widthPx; // ширина контейнера, совпадает с теплокартой

  return (
    <div className="space-y-6">
      {/* БАР: распределение по амплуа */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Распределение по амплуа</div>
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-56 shrink-0 text-sm">{r.label}</div>
              <div
                className="h-2 w-full rounded bg-zinc-100"
                style={{ maxWidth: barWidth - 56 }}
              >
                <div
                  className="h-2 rounded bg-zinc-900"
                  style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }}
                  title={tooltip ? `${r.value}%` : undefined}
                />
              </div>
              <div className="w-12 text-right text-sm tabular-nums">
                {r.value}%
              </div>
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
                <div
                  className="h-2 w-full rounded bg-zinc-100"
                  style={{ maxWidth: barWidth - 56 }}
                >
                  <div
                    className="h-2 rounded bg-zinc-900"
                    style={{ width: `${Math.max(0, Math.min(100, x.pct))}%` }}
                    title={tooltip ? `${x.pct}%` : undefined}
                  />
                </div>
                <div className="w-12 text-right text-sm tabular-nums">
                  {x.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
