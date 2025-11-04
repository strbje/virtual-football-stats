// src/components/players/RoleDistributionSection.tsx
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

type RoleLike = { role: string; percent?: number; pct?: number; count?: number };
type ApiRole = { role: string; count?: number; pct?: number };

type ApiResponse = {
  ok: boolean;
  total: number;
  roles: ApiRole[];
  source?: string;
  error?: string;
};

type Props = {
  /** Алиас: можно передать список ролей как roles … */
  roles?: RoleLike[];
  /** …или как data (старый проп) */
  data?: RoleLike[];
  /** Доп. пропы, которые уже используются в page.tsx — делаем опциональными */
  leagues?: { label: string; percent: number }[];
  widthPx?: number;
  tooltip?: boolean;
  debug?: boolean;
};

type GroupRow = {
  key: RoleGroup;
  value: number; // суммарный % по группе
  rolesList: { role: RoleCode; pct: number }[]; // детали для подсказки
};

const ORDER: RoleGroup[] = GROUP_ORDER;
const fmtPct = (v: number) => `${Math.round(v)}%`;

/** Подсчёт процентов по группам из массива ролей */
function computeFromList(list: RoleLike[], totalCount?: number): { rows: GroupRow[]; total: number } {
  const rows: GroupRow[] = ORDER.map((g) => ({ key: g, value: 0, rolesList: [] }));
  let total = Number(totalCount ?? 0);

  // если есть count — посчитаем total как сумму count
  if (!total) {
    const sumCount = list.reduce((s, x) => s + (Number(x.count) || 0), 0);
    if (sumCount > 0) total = sumCount;
  }

  let sumPct = 0;
  for (const x of list) {
    const code = (x.role ?? '').toUpperCase().trim() as RoleCode;
    const grp = ROLE_TO_GROUP[code];
    if (!grp) continue;

    const pctFromPercent = Number.isFinite(Number(x.percent))
      ? Number(x.percent)
      : Number.isFinite(Number(x.pct))
      ? Number(x.pct)
      : undefined;

    let pct: number | undefined = pctFromPercent;

    if (pct === undefined && total > 0 && Number(x.count) > 0) {
      pct = (Number(x.count) / total) * 100;
    }

    if (!Number.isFinite(pct) || (pct as number) <= 0) continue;

    const idx = ORDER.indexOf(grp);
    rows[idx].value += pct as number;
    rows[idx].rolesList.push({ role: code, pct: pct as number });
    sumPct += pct as number;
  }

  // Нормализация, если не ровно 100
  if (sumPct > 0 && Math.abs(sumPct - 100) > 0.5) {
    const k = 100 / sumPct;
    rows.forEach((r) => {
      r.value *= k;
      r.rolesList.forEach((c) => (c.pct *= k));
    });
  }

  // Сортируем роли в группе по вкладу
  rows.forEach((r) => r.rolesList.sort((a, b) => b.pct - a.pct));

  return { rows, total: total || 0 };
}

export default function RoleDistributionSection(props: Props) {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const initialRows: GroupRow[] = ORDER.map((g) => ({ key: g, value: 0, rolesList: [] }));
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<GroupRow[]>(initialRows);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) приоритет — проп roles / data
        const localList = (props.roles && props.roles.length ? props.roles : props.data) ?? null;
        if (localList) {
          const { rows } = computeFromList(localList);
          if (alive) setRows(rows);
          return;
        }

        // 2) иначе — API
        if (!userId) throw new Error('userId not found in route');
        const r = await fetch(`/api/player-roles?userId=${userId}`, { cache: 'no-store' });
        const json: ApiResponse = await r.json();

        if (json.ok && Array.isArray(json.roles)) {
          const list: RoleLike[] = json.roles.map((it) => ({
            role: (it.role ?? '').toUpperCase(),
            count: Number(it.count ?? 0),
            pct: Number(it.pct ?? 0),
          }));
          const { rows } = computeFromList(list, json.total);
          if (alive) setRows(rows);
        } else {
          throw new Error(json.error || 'failed to load roles');
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, JSON.stringify(props.roles), JSON.stringify(props.data)]);

  return (
    <div className="space-y-5">
      {loading && <div className="text-sm text-gray-500">Загружаем распределение по амплуа…</div>}
      {error && <div className="text-sm text-red-500">Ошибка загрузки распределения: {error}</div>}

      {!loading &&
        !error &&
        rows.map((g) => {
          const rolesTooltip = g.rolesList.map((c) => `${c.role} — ${fmtPct(c.pct)}`).join(' · ');
          const title = `${GROUP_LABELS[g.key]}: ${fmtPct(g.value)}${
            rolesTooltip ? `\nВходит: ${rolesTooltip}` : ''
          }`;

          return (
            <div key={g.key} className="grid grid-cols-[200px_1fr_64px] items-center gap-3">
              <div className="text-sm text-gray-700">{GROUP_LABELS[g.key]}</div>

              <div className="relative h-3 rounded-full bg-emerald-50">
                <div
                  className="absolute left-0 top-0 h-3 rounded-full bg-emerald-600 transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, g.value))}%` }}
                  aria-label={title}
                  title={props.tooltip === false ? undefined : title}
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
