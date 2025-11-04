// src/components/players/RoleDistributionSection.tsx
'use client';

import React from 'react';
import {
  ROLE_LABELS,
  type RoleItem,
  type LeagueBucket,
  type RolePercent,
} from '@/utils/roles';

type RolesInput = RoleItem[] | RolePercent[];
type LeagueInput = LeagueBucket[] | { label: string; percent: number }[];

type Props = {
  /** можно передать {label,value}[] или {role,percent}[]  */
  roles?: RolesInput;
  /** legacy-проп: тоже принимает оба формата (для обратной совместимости) */
  data?: RolesInput;
  /** можно передать {label,pct}[] или {label,percent}[] */
  leagues?: LeagueInput;
  /** ширина зоны графиков (подгон к теплокарте), px */
  widthPx?: number;
  /** включать title-подсказки на барах */
  tooltip?: boolean;
};

function normalizeRoles(input?: RolesInput): RoleItem[] {
  if (!input || input.length === 0) return [];
  const first: any = input[0];
  // если уже {label,value}
  if ('label' in first && 'value' in first) return input as RoleItem[];
  // иначе {role,percent} -> маппим в {label,value}
  return (input as RolePercent[]).map((it) => ({
    label: ROLE_LABELS[it.role],
    value: it.percent,
  }));
}

function normalizeLeagues(input?: LeagueInput): LeagueBucket[] {
  if (!input || (input as any[]).length === 0) return [];
  const first: any = (input as any[])[0];
  // если уже {label,pct}
  if ('pct' in first) return input as LeagueBucket[];
  // иначе {label,percent} -> {label,pct}
  return (input as { label: string; percent: number }[]).map((x) => ({
    label: x.label,
    pct: x.percent,
  }));
}

export default function RoleDistributionSection({
  roles,
  data,
  leagues,
  widthPx = 500,
  tooltip = true,
}: Props) {
  // поддерживаем и roles, и data
  const items: RoleItem[] = normalizeRoles(roles ?? data);
  const leaguesN: LeagueBucket[] = normalizeLeagues(leagues);

  const leftLabelWidth = 56; // ширина текстовой колонки
  const barMaxWidth = Math.max(0, widthPx - leftLabelWidth);

  return (
    <div className="space-y-6">
      {/* БАР: распределение по амплуа */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Распределение по амплуа</div>
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-56 shrink-0 text-sm">{r.label}</div>
              <div className="h-2 w-full rounded bg-zinc-100" style={{ maxWidth: barMaxWidth }}>
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

      {/* БАР: распределение по лигам (если передано) */}
      {leaguesN.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Распределение по лигам</div>
          <div className="space-y-2">
            {leaguesN.map((x) => (
              <div key={x.label} className="flex items-center gap-3">
                <div className="w-56 shrink-0 text-sm">{x.label}</div>
                <div className="h-2 w-full rounded bg-zinc-100" style={{ maxWidth: barMaxWidth }}>
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
