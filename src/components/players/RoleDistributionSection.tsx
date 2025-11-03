// src/components/players/RoleDistributionSection.tsx
'use client';

import React from 'react';
import {
  ROLE_TO_GROUP,
  GROUP_LABELS,
  groupRolePercents,
  type RolePercent,
  type RoleGroup,
} from '@/lib/roles';

/** --- ПАРАМЕТРЫ ВНЕШНЕГО ВИДА --- */
const BAR_HEIGHT = 14;     // высота зелёной полосы
const ROW_GAP = 12;        // вертикальный отступ между строками
const LABEL_WIDTH = 180;   // ширина колонки с подписями слева
const PCT_WIDTH = 48;      // ширина колонки с процентом справа

/** Обратный индекс: группа -> список коротких ролей, которые в неё входят */
const GROUP_ROLES: Record<RoleGroup, string[]> = Object.entries(ROLE_TO_GROUP).reduce(
  (acc, [role, group]) => {
    (acc[group as RoleGroup] ??= []).push(role);
    return acc;
  },
  {} as Record<RoleGroup, string[]>
);

/** Карта процента по короткой роли из сырых данных */
function buildPctByRole(raw: RolePercent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const { role, percent } of raw) {
    const code = (role ?? '').toUpperCase().trim();
    if (!code) continue;
    map.set(code, (map.get(code) ?? 0) + (percent ?? 0));
  }
  return map;
}

export default function RoleDistributionSection({
  data,
  debug = false,
  title = 'Распределение по амплуа',
  footnote = 'Без учёта матчей национальных сборных (ЧМ/ЧЕ).',
}: {
  /** Сырые проценты по коротким ролям: [{ role:'ЦАП', percent: 21 }, ...] */
  data: RolePercent[];
  /** Включить подсказки: какие короткие роли сложились в каждую группу */
  debug?: boolean;
  /** Заголовок секции */
  title?: string;
  /** Сноска под блоком (оставь пустым, если не нужна) */
  footnote?: string | null;
}) {
  const grouped = groupRolePercents(data);
  const pctByRole = buildPctByRole(data);

  return (
    <section className="rounded-2xl border p-4">
      <h3 className="mb-4 text-sm font-medium text-gray-600">{title}</h3>

      <div className="flex flex-col" style={{ gap: ROW_GAP }}>
        {grouped.map(({ group, percent }) => {
          const label = GROUP_LABELS[group];
          const pct = Math.max(0, Math.min(100, Math.round(percent)));

          // роли, которые входят в эту группу и реально присутствуют (>0)
          const members =
            (GROUP_ROLES[group] ?? [])
              .map((r) => ({ role: r, pct: Math.round(pctByRole.get(r) ?? 0) }))
              .filter((x) => x.pct > 0)
              .sort((a, b) => b.pct - a.pct);

          return (
            <div key={group}>
              <div className="flex items-center">
                {/* подпись группы */}
                <div
                  className="pr-3 text-[13px] text-gray-800 truncate"
                  style={{ width: LABEL_WIDTH }}
                  title={label}
                >
                  {label}
                </div>

                {/* фон + зелёная полоса */}
                <div className="relative flex-1 h-[1px]">
                  <div className="h-[10px] w-full rounded-full bg-emerald-100/60" />
                  <div
                    className="absolute left-0 top-0 h-[10px] rounded-full bg-emerald-600"
                    style={{ width: `${pct}%`, height: BAR_HEIGHT }}
                  />
                </div>

                {/* значение % */}
                <div
                  className="pl-3 text-[13px] font-medium text-gray-700 text-right tabular-nums"
                  style={{ width: PCT_WIDTH }}
                >
                  {pct}%
                </div>
              </div>

              {/* подсказки: какие короткие роли вошли в группу */}
              {debug && members.length > 0 && (
                <div className="mt-2 ml-[calc(var(--label-w,0px))]" style={{ '--label-w': `${LABEL_WIDTH}px` } as React.CSSProperties}>
                  <div className="flex flex-wrap gap-6 pl-3">
                    {members.map((m) => (
                      <div
                        key={m.role}
                        className="text-[12px] text-gray-600"
                        title={`Короткая роль: ${m.role} — ${m.pct}%`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block rounded-md bg-gray-100 px-1.5 py-[1px] text-gray-800">
                            {m.role}
                          </span>
                          <span className="tabular-nums">{m.pct}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footnote && (
        <div className="mt-3 text-[12px] text-gray-500">{footnote}</div>
      )}
    </section>
  );
}
