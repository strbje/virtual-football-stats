'use client';

import React from 'react';

type RoleItem = {
  label: string;        // подпись столбца (например, "ЦЗ")
  value: number;        // количество матчей
  pct?: number;         // доля (0..1) — не обязательно
};

type LeagueBucket = {
  label: string;        // "ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ"
  pct: number;          // доля (0..1)
};

type Props = {
  /** Барчарт по амплуа (кол-во матчей). Должен соответствовать тем же данным, что идут в тепловую карту. */
  roles: RoleItem[];
  /** Сумма матчей (должна совпадать с источником теплокарты/баров) */
  totalMatches: number;
  /** Актуальное амплуа (за последние 30 матчей) — строка вроде "ЦЗ" */
  topRoleLabel?: string;
  /** Подсказка для "Актуальное амплуа" */
  topRoleHint?: string; // например: "За последние 30 матчей"
  /** Барчарт по лигам (доли) */
  leagues?: LeagueBucket[];
  /** Ширина, к которой подгоняем бары, чтобы совпадало с 500px теплокарты */
  alignWidthPx?: number; // по умолчанию 500
};

export default function RoleDistributionSection({
  roles,
  totalMatches,
  topRoleLabel,
  topRoleHint = 'За последние 30 матчей',
  leagues = [],
  alignWidthPx = 500,
}: Props) {
  // Защита от NaN/негатива
  const safeTotal = Math.max(0, Number.isFinite(totalMatches) ? totalMatches : 0);

  // Для «половинной» ширины ролей (как просил — ужать по оси X в 2 раза),
  // а общий контейнер всё равно тянем под 500, чтобы визуально совпадало с теплокартой.
  const rolesBarMaxWidth = Math.max(0, Math.floor(alignWidthPx / 2));
  const leaguesBarMaxWidth = Math.max(0, Math.floor(alignWidthPx / 2)); // тот же масштаб для симметрии

  return (
    <section className="space-y-3">
      {/* Карточки сверху */}
      <div className="grid grid-cols-3 gap-3">
        {/* Кол-во матчей */}
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="text-xs text-zinc-500">Матчей в выборке</div>
          <div className="text-2xl font-semibold">{safeTotal}</div>
        </div>

        {/* Актуальное амплуа */}
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <span>Актуальное амплуа</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600"
              title={topRoleHint}
            >
              i
            </span>
          </div>
          <div className="text-2xl font-semibold">
            {topRoleLabel ?? '—'}
          </div>
        </div>

        {/* Плейс для расширяемой карточки (можно использовать позже) */}
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="text-xs text-zinc-500">Пусто (резерв под метрику)</div>
          <div className="text-2xl font-semibold">—</div>
        </div>
      </div>

      {/* Блоки барчартов */}
      <div className="grid grid-cols-2 gap-6 pt-2">
        {/* Барчарт — распределение матчей по амплуа (ужат по X в 2 раза) */}
        <div>
          <div className="text-sm font-semibold mb-2">Распределение матчей по амплуа</div>
          <div className="space-y-2">
            {roles && roles.length > 0 ? (
              roles.map((r: RoleItem) => {
                const width = safeTotal > 0 ? Math.round((r.value / safeTotal) * rolesBarMaxWidth) : 0;
                const pct = safeTotal > 0 ? (r.value / safeTotal) : 0;
                return (
                  <div key={r.label} className="flex items-center gap-3">
                    <div className="w-20 shrink-0 text-sm">{r.label}</div>
                    <div className="h-2 w-full rounded bg-zinc-100" style={{ maxWidth: rolesBarMaxWidth }}>
                      <div
                        className="h-2 rounded bg-zinc-800"
                        style={{ width }}
                        title={`${r.value} матчей (${Math.round(pct * 100)}%)`}
                      />
                    </div>
                    <div className="w-14 text-right text-xs text-zinc-600">
                      {Math.round(pct * 100)}%
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-zinc-500">Нет данных</div>
            )}
          </div>
        </div>

        {/* Барчарт — доля матчей по лигам */}
        <div>
          <div className="text-sm font-semibold mb-2">Доля матчей по лигам</div>
          <div className="space-y-2">
            {leagues && leagues.length > 0 ? (
              leagues.map((x: LeagueBucket) => {
                const width = Math.round(x.pct * leaguesBarMaxWidth);
                return (
                  <div key={x.label} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 text-sm">{x.label}</div>
                    <div className="h-2 w-full rounded bg-zinc-100" style={{ maxWidth: leaguesBarMaxWidth }}>
                      <div
                        className="h-2 rounded bg-zinc-800"
                        style={{ width }}
                        title={`${Math.round(x.pct * 100)}%`}
                      />
                    </div>
                    <div className="w-14 text-right text-xs text-zinc-600">
                      {Math.round(x.pct * 100)}%
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-zinc-500">Нет данных</div>
            )}
          </div>
        </div>
      </div>

      {/* Примечание/подсказка */}
      <div className="text-[11px] text-zinc-500 pt-1">
        Бары ужаты по оси X вдвое для визуального соответствия теплокарте (ширина 500px).
      </div>
    </section>
  );
}
