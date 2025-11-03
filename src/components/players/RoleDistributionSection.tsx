'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import {
  ROLE_TO_GROUP,
  GROUP_LABELS,
  GROUP_ORDER,
  type RoleCode,
  type RoleGroup,
} from '@/lib/roles';

type ApiRole = { role: string; count?: number; pct?: number };
type ApiResponse = {
  ok: boolean;
  total: number;
  roles: ApiRole[];
  source?: string;
  error?: string;
};

// Пропсы делаем опциональными, чтобы не ломать существующие места вызова
type Props = {
  data?: { role: string; percent?: number; pct?: number; count?: number }[];
  debug?: boolean;
};

type GroupRow = {
  key: RoleGroup;
  value: number; // суммарный % по группе
  chips: { role: RoleCode; pct: number }[];
};

const ORDER: RoleGroup[] = GROUP_ORDER;
const fmtPct = (v: number) => `${Math.round(v)}%`;

/** Подсчёт процентов по группам из массива "коротких ролей" с их долями */
function computeFromList(
  list: { role: string; percent?: number; pct?: number; count?: number }[],
  totalCount?: number
): { rows: GroupRow[]; total: number } {
  const rows: GroupRow[] = ORDER.map((g) => ({ key: g, value: 0, chips: [] }));
  // total: если есть «count», можно нормировать по матчам
  let total = Number(totalCount ?? 0);

  // Если в данных есть count — посчитаем total как сумму count
  if (!total) {
    const sumCount = list.reduce((s, x) => s + (Number(x.count) || 0), 0);
    if (sumCount > 0) total = sumCount;
  }

  // Если total неизвестен, нормализуем по сумме процентов
  let sumPct = 0;

  list.forEach((x) => {
    const code = (x.role ?? '').toUpperCase().trim() as RoleCode;
    const grp = ROLE_TO_GROUP[code];
    if (!grp) return;

    const pctFromPercent = Number.isFinite(Number(x.percent))
      ? Number(x.percent)
      : Number.isFinite(Number(x.pct))
      ? Number(x.pct)
      : undefined;

    let pct: number | undefined = pctFromPercent;

    if (pct === undefined && total > 0 && Number(x.count) > 0) {
      pct = (Number(x.count) / total) * 100;
    }

    if (!Number.isFinite(pct) || (pct as number) <= 0) return;

    const idx = ORDER.indexOf(grp);
    rows[idx].value += pct as number;
    rows[idx].chips.push({ role: code, pct: pct as number });

    sumPct += pct as number;
  });

  // Нормализация, если вход не суммируется к 100
  if (sumPct > 0 && Math.abs(sumPct - 100) > 0.5) {
    const k = 100 / sumPct;
    rows.forEach((r) => {
      r.value *= k;
      r.chips.forEach((c) => (c.pct *= k));
    });
  }

  rows.forEach((r) => r.chips.sort((a, b) => b.pct - a.pct));
  return { rows, total };
}

export default function RoleDistributionSection(props: Props) {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<GroupRow[]>(
    ORDER.map((g) => ({ key: g, value: 0, chips: [] }))
  );

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) основной источник — API
        if (!userId) throw new Error('userId not found in route');
        const r = await fetch(`/api/player-roles?userId=${userId}`, { cache: 'no-store' });
        const json: ApiResponse = await r.json();

        if (json.ok && Array.isArray(json.roles)) {
          const list = json.roles.map((it) => ({
            role: (it.role ?? '').toUpperCase(),
            count: Number(it.count ?? 0),
            pct: Number(it.pct ?? 0),
          }));
          const { rows } = computeFromList(list, json.total);
          if (alive) setRows(rows);
          return;
        }

        // 2) запасной вариант — то, что пришло пропсом data (если передают)
        if (props.data && props.data.length) {
          const { rows } = computeFromList(props.data);
          if (alive) setRows(rows);
          return;
        }

        throw new Error(json.error || 'failed to load');
      } catch (e: any) {
        // если API упал, но есть props.data — попробуем из них
        if (props.data && props.data.length) {
          const { rows } = computeFromList(props.data);
          setRows(rows);
          setError(null);
        } else {
          setError(e?.message || String(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="space-y-5">
      {loading && <div className="text-sm text-gray-500">Загружаем распределение по амплуа…</div>}
      {error && <div className="text-sm text-red-500">Ошибка загрузки распределения: {error}</div>}

      {!loading &&
        !error &&
        rows.map((g) => (
          <div key={g.key} className="grid grid-cols-[200px_1fr_64px] items-center gap-3">
            <div className="text-sm text-gray-700">{GROUP_LABELS[g.key]}</div>

            <div className="relative h-3 rounded-full bg-emerald-50">
              <div
                className="absolute left-0 top-0 h-3 rounded-full bg-emerald-600 transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, g.value))}%` }}
                aria-label={`${GROUP_LABELS[g.key]}: ${fmtPct(g.value)}`}
                title={`${GROUP_LABELS[g.key]}: ${fmtPct(g.value)}`}
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {g.chips.map((c) => (
                  <span
                    key={c.role}
                    className="text-[11px] px-2 py-[2px] rounded-md bg-gray-100 text-gray-800"
                    title={`${c.role} — ${fmtPct(c.pct)}`}
                  >
                    {c.role} <span className="opacity-70">{fmtPct(c.pct)}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="text-right text-sm text-gray-600">{fmtPct(g.value)}</div>
          </div>
        ))}

      <div className="text-xs text-gray-500">Без учёта матчей национальных сборных (ЧМ/ЧЕ).</div>
    </div>
  );
}
