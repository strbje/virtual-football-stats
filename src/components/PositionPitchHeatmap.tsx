// src/components/PositionPitchHeatmap.tsx
'use client';

import React, { useMemo } from 'react';
import clsx from 'clsx';

type RawRoleDatum = { role: string; count: number }; // «сырые» амплуа из БД
type HeatmapProps = {
  data: RawRoleDatum[];           // например [{role:'ЛЦЗ', count:12}, {role:'ПФД', count:3}, ...]
  title?: string;
};

// ---- 1) Маппинг «сырых» амплуа -> каноническое ----
const ALIAS_TO_CANON: Record<string, string> = {
  // Вратарь
  'ВР': 'ВР', 'ВРТ': 'ВР', 'ГК': 'ВР',

  // Линия защиты
  'ЛЗ': 'ЛЗ',
  'ПЗ': 'ПЗ',
  'ЦЗ': 'ЦЗ', 'ЛЦЗ': 'ЦЗ', 'ПЦЗ': 'ЦЗ',

  // Опорка / центр
  'ЦОП': 'ОП', 'ЛОП': 'ОП', 'ПОП': 'ОП',
  'ЦП': 'ЦП', 'ЛЦП': 'ЦП', 'ПЦП': 'ЦП',

  // Полуфланги
  'ЛП': 'ЛП',
  'ПП': 'ПП',

  // Атака из полузащиты
  'ЦАП': 'АП',

  // Нападающие и фланговые вингеры
  'ЦФД': 'ОФ',
  'ЛАП': 'ЛВ', 'ЛФА': 'ЛВ',
  'ПАП': 'ПВ', 'ПФА': 'ПВ',
  'ФРВ': 'ЦФ', 'ЛФД': 'ЦФ', 'ПФД': 'ЦФ',

  // На всякий случай частые альтернативы
  'НАП': 'ЦФ', 'СТ': 'ЦФ', 'RW': 'ПВ', 'LW': 'ЛВ', 'CAM': 'АП', 'CDM': 'ОП',
  'CM': 'ЦП', 'RM': 'ПП', 'LM': 'ЛП', 'CB': 'ЦЗ', 'LB': 'ЛЗ', 'RB': 'ПЗ', 'GK': 'ВР',
};

// Порядок отрисовки (сверху-вниз), чтобы слой был предсказуемым
const CANON_ORDER = ['ЦФ','ОФ','ЛВ','ПВ','АП','ЛП','ПП','ЦП','ОП','ЛЗ','ЦЗ','ПЗ','ВР'];

// ---- 2) Координаты на «поле» (grid 6×9; можно подстроить при желании) ----
/** gridRow / gridColumn — 1-based; gridRowEnd/gridColumnEnd — включительно */
const POS_LAYOUT: Record<string, {r:number; c:number; rs?:number; cs?:number}> = {
  // ВЕРХ (атака)
  'ЦФ': { r: 2, c: 4, rs: 2, cs: 2 },
  'ОФ': { r: 3, c: 4, rs: 2, cs: 2 },

  // Фланговая атака
  'ЛВ': { r: 3, c: 2, rs: 3, cs: 2 },
  'ПВ': { r: 3, c: 6, rs: 3, cs: 2 },

  // АП
  'АП': { r: 5, c: 4, rs: 2, cs: 2 },

  // Полуфланги
  'ЛП': { r: 6, c: 2, rs: 2, cs: 2 },
  'ПП': { r: 6, c: 6, rs: 2, cs: 2 },

  // Центр
  'ЦП': { r: 7, c: 4, rs: 2, cs: 2 },
  'ОП': { r: 8, c: 4, rs: 2, cs: 2 },

  // Защита
  'ЛЗ': { r: 9, c: 2, rs: 3, cs: 2 },
  'ЦЗ': { r: 9, c: 4, rs: 3, cs: 2 },
  'ПЗ': { r: 9, c: 6, rs: 3, cs: 2 },

  // Вратарь
  'ВР': { r: 12, c: 4, rs: 2, cs: 2 },
};

// ---- 3) Утилиты цвета и округления ----
const clamp = (x:number, lo:number, hi:number) => Math.min(hi, Math.max(lo, x));
/** Красный (0) → Зелёный (120) по доле */
function colorByShare(share01: number): string {
  const hue = 120 * clamp(share01, 0, 1); // 0=red, 120=green
  return `hsl(${hue} 75% 45%)`;
}
const pct = (x: number) => Math.round(x * 100);

// ---- 4) Агрегация в канон + расчёт процентов ----
function aggregateToCanon(data: RawRoleDatum[]) {
  const bucket = new Map<string, number>();
  let total = 0;

  for (const { role, count } of data) {
    const canon = ALIAS_TO_CANON[role.trim().toUpperCase()];
    if (!canon) continue;                // незнакомые амплуа просто пропускаем
    const prev = bucket.get(canon) ?? 0;
    bucket.set(canon, prev + count);
    total += count;
  }

  // массив c долями (только сыгранные)
  const rows = Array.from(bucket.entries()).map(([canon, cnt]) => ({
    canon,
    count: cnt,
    share: total > 0 ? cnt / total : 0,
  }));

  // min/max для градиента
  const min = rows.reduce((m, r) => Math.min(m, r.share), Infinity);
  const max = rows.reduce((m, r) => Math.max(m, r.share), -Infinity);

  return { rows, total, min: min === Infinity ? 0 : min, max: max === -Infinity ? 1 : max };
}

// ---- 5) Сам компонент ----
export default function PositionPitchHeatmap({ data, title = 'Тепловая карта позиций' }: HeatmapProps) {
  const { rows, total, min, max } = useMemo(() => aggregateToCanon(data), [data]);

  // нормируем share в 0..1 относительно min..max, чтобы градиент был заметным
  const norm = (s: number) => {
    if (max <= min) return 0; // все равны
    return (s - min) / (max - min);
  };

  // для удобства обращения по ключу
  const byCanon = useMemo(() => {
    const m = new Map(rows.map(r => [r.canon, r]));
    return m;
  }, [rows]);

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-500 mb-3">{title}</div>

      {/* «Поле»: 6 колонок × 13 строк, соотношение сторон близкое к 2:3 */}
      <div
        className="relative rounded-xl border overflow-hidden"
        style={{
          background: 'linear-gradient(#eafff1 0%, #eafff1 100%)',
          aspectRatio: '2 / 3',
        }}
      >
        {/* сетка */}
        <div
          className="absolute inset-2 grid"
          style={{
            gridTemplateColumns: 'repeat(8, 1fr)', // чуть шире для краёв
            gridTemplateRows: 'repeat(14, 1fr)',
            background:
              'radial-gradient(circle at 50% 33%, rgba(0,0,0,0.05) 0 2px, transparent 2px), radial-gradient(circle at 50% 66%, rgba(0,0,0,0.05) 0 2px, transparent 2px)',
            border: '1px solid #b8f3cd',
            borderRadius: 16,
          }}
        >
          {CANON_ORDER.map((key) => {
            const coords = POS_LAYOUT[key];
            if (!coords) return null;
            const row = byCanon.get(key);
            if (!row || row.count === 0) return null; // показываем только реальные позиции

            const share = row.share;
            const share01 = norm(share);

            return (
              <div
                key={key}
                style={{
                  gridColumn: `${coords.c} / span ${coords.cs ?? 1}`,
                  gridRow: `${coords.r} / span ${coords.rs ?? 1}`,
                  alignSelf: 'center',
                  justifySelf: 'center',
                }}
              >
                <div
                  className={clsx(
                    'rounded-xl border shadow-sm text-center select-none',
                    'flex items-center justify-center'
                  )}
                  style={{
                    width: 110,
                    height: 64,
                    background: colorByShare(share01),
                    color: '#fff',
                    borderColor: 'rgba(0,0,0,0.2)',
                  }}
                  title={`${key}: ${pct(share)}% (${row.count} из ${total})`}
                >
                  <div className="text-sm font-semibold">
                    {key} · {pct(share)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* легенда */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
        <span>Меньше матчей</span>
        <div className="h-2 flex-1 rounded-full"
             style={{background: 'linear-gradient(90deg, hsl(0 75% 45%), hsl(120 75% 45%))'}} />
        <span>Больше матчей</span>
      </div>
    </div>
  );
}
