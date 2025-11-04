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

type Props = {
  data?: { role: string; percent?: number; pct?: number; count?: number }[];
  debug?: boolean;
};

type GroupRow = {
  key: RoleGroup;
  value: number;                     // суммарный % по группе
  rolesList: { role: RoleCode; pct: number }[]; // детали для подсказки
};

const ORDER: RoleGroup[] = GROUP_ORDER;
const fmtPct = (v: number) => `${Math.round(v)}%`;

/** Подсчёт процентов по группам из массива ролей */
function computeFromList(
  list: { role: string; percent?: number; pct?: number; count?: number }[],
  totalCount?: number
): { rows: GroupRow[]; total: number } {
  const rows: GroupRow[] = ORDER.map((g) => ({ key: g, value: 0, rolesList: [] }));
  let total = Number(totalCount ?? 0);

  // если в данных есть count — посчитаем total как сумму count
  if (!total) {
    const sumCount = list.reduce((s, x) => s + (Number(x.count) || 0), 0);
    if (sumCount > 0) total = sumCount;
  }

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
    rows[idx].rolesList.push({ role: code, pct: pct as number });

    sumPct += pct as number;
  });

  // нормализация, если вход не суммируется к 100
  if (sumPct > 0 && Math.abs(sumPct - 100) > 0.5) {
    const k = 100 / sumPct;
    rows.forEach((r) => {
      r.value *= k;
      r.rolesList.forEach((c) => (c.pct *= k));
    });
  }

  // сортируем роли внутри группы по убыванию вклада
  rows.forEach((r) => r.rolesList.sort((a, b) => b.pct - a.pct));

  return { rows, total: total || 0 };
}

export default function RoleDistributionSection(props: Props) {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<GroupRow[]>(
    ORDER.map((g) => ({ key: g, value: 0, rolesList: [] }))
  );

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

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
        } else if (props.data?.length) {
          const { rows } = computeFromList(props.data);
          if (alive) setRows(rows);
        } else {
          throw new Error(json.error || 'failed to load');
        }
      } catch (e: any) {
        if (props.data?.length) {
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

      {!loading && !error && rows.map((g) => {
        const rolesTooltip = g.rolesList
          .map((c) => `${c.role} — ${fmtPct(c.pct)}`)
          .join(' · ');
        const title = `${GROUP_LABELS[g.key]}: ${fmtPct(g.value)}\n${rolesTooltip ? `Входит: ${rolesTooltip}` : ''}`;

        return (
          <div key={g.key} className="grid grid-cols-[200px_1fr_64px] items-center gap-3">
            <div className="text-sm text-gray-700">{GROUP_LABELS[g.key]}</div>

            <div className="relative h-3 rounded-full bg-emerald-50">
              <div
                className="absolute left-0 top-0 h-3 rounded-full bg-emerald-600 transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, g.value))}%` }}
                aria-label={title}
                title={title}
              />
            </div>

            <div className="text-right text-sm text-gray-600">{fmtPct(g.value)}</div>
          </div>
        );
      })}

      <div className="text-xs text-gray-500">Без учёта матчей национальных сборных (ЧМ/ЧЕ).</div>
    </div>
  );
}
