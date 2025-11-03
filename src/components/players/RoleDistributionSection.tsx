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

type ApiRole = { role: string; count: number; pct: number };
type ApiResponse = {
  ok: boolean;
  total: number;
  roles: ApiRole[];
  source?: string;
  error?: string;
};

type GroupRow = {
  key: RoleGroup;
  value: number; // суммарный % по группе
  chips: { role: RoleCode; pct: number }[]; // расшифровка по коротким кодам
};

const ORDER: RoleGroup[] = GROUP_ORDER;

const fmtPct = (v: number) => `${Math.round(v)}%`;

export default function RoleDistributionSection() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [byRole, setByRole] = React.useState<Record<RoleCode, number>>({} as any);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        if (!userId) throw new Error('userId not found in route');
        const r = await fetch(`/api/player-roles?userId=${userId}`, { cache: 'no-store' });
        const json: ApiResponse = await r.json();
        if (!json.ok) throw new Error(json.error || 'failed to load');

        const m: Record<RoleCode, number> = {} as any;
        json.roles.forEach((it) => {
          const code = (it.role ?? '').toUpperCase() as RoleCode;
          const cnt = Number(it.count ?? 0);
          if (!code || !isFinite(cnt) || cnt <= 0) return;
          m[code] = (m[code] ?? 0) + cnt;
        });

        if (alive) {
          setTotal(json.total);
          setByRole(m);
        }
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const rows: GroupRow[] = React.useMemo(() => {
    const res: GroupRow[] = ORDER.map((g) => ({ key: g, value: 0, chips: [] }));

    if (!total) return res;

    (Object.keys(byRole) as RoleCode[]).forEach((rc) => {
      const group = ROLE_TO_GROUP[rc];
      if (!group) return;
      const idx = ORDER.indexOf(group);
      if (idx < 0) return;

      const count = byRole[rc] ?? 0;
      if (count <= 0) return;

      const share = (count / total) * 100;
      res[idx].value += share;
      res[idx].chips.push({ role: rc, pct: share });
    });

    res.forEach((g) => g.chips.sort((a, b) => b.pct - a.pct));
    return res;
  }, [byRole, total]);

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
