'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import {
  ROLE_GROUPS,
  ROLE_LABELS,
  ROLE_TO_GROUP,
  type RoleCode,
} from './roles';

type ApiRole = { role: string; count: number; pct: number };
type ApiResponse = {
  ok: boolean;
  total: number;
  roles: ApiRole[];
  source?: string;
  error?: string;
};

type GroupKey =
  | 'Форвард'
  | 'Атакующий полузащитник'
  | 'Крайний полузащитник'
  | 'Центральный полузащитник'
  | 'Опорный полузащитник'
  | 'Крайний защитник'
  | 'Центральный защитник'
  | 'Вратарь';

const ORDER: GroupKey[] = [
  'Форвард',
  'Атакующий полузащитник',
  'Крайний полузащитник',
  'Центральный полузащитник',
  'Опорный полузащитник',
  'Крайний защитник',
  'Центральный защитник',
  'Вратарь',
];

function fmtPct(n: number) {
  // те же визуальные «целые» проценты, что и раньше
  return `${Math.round(n)}%`;
}

export default function RoleDistributionSection() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [roles, setRoles] = React.useState<Record<RoleCode, number>>({} as any);

  React.useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        if (!userId) throw new Error('userId not found in route');
        const r = await fetch(`/api/player-roles?userId=${userId}`, { cache: 'no-store' });
        const json: ApiResponse = await r.json();
        if (!json.ok) throw new Error(json.error || 'failed to load');

        // Сохраняем тотал и мапу ролей -> count
        const map: Record<RoleCode, number> = {} as any;
        json.roles.forEach((it) => {
          const code = it.role.toUpperCase() as RoleCode;
          map[code] = (map[code] ?? 0) + it.count;
        });

        if (alive) {
          setTotal(json.total);
          setRoles(map);
        }
      } catch (e: any) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [userId]);

  // Подготовка данных по группам
  const groups = React.useMemo(() => {
    // структура для каждой группы
    const result = ORDER.map((g) => ({
      name: g as GroupKey,
      value: 0, // % от общего тотала
      chips: [] as { role: RoleCode; pct: number }[],
    }));

    if (!total) return result;

    // суммируем по ролям, используя ROLE_TO_GROUP и ROLE_GROUPS
    (Object.keys(roles) as RoleCode[]).forEach((rc) => {
      const group = ROLE_TO_GROUP[rc];
      if (!group) return;
      const idx = ORDER.indexOf(group as GroupKey);
      if (idx < 0) return;

      const count = roles[rc] ?? 0;
      if (count <= 0) return;

      const overallPct = (count / total) * 100;
      result[idx].value += overallPct;
      result[idx].chips.push({ role: rc, pct: overallPct });
    });

    // сортируем чипы внутри группы по убыванию процента
    result.forEach((g) => g.chips.sort((a, b) => b.pct - a.pct));

    return result;
  }, [roles, total]);

  return (
    <div className="space-y-5">
      {loading && (
        <div className="text-sm text-gray-500">Загружаем распределение по амплуа…</div>
      )}
      {err && (
        <div className="text-sm text-red-500">
          Ошибка загрузки распределения: {err}
        </div>
      )}

      {!loading &&
        !err &&
        groups.map((g) => (
          <div key={g.name} className="grid grid-cols-[200px_1fr_64px] items-center gap-3">
            <div className="text-sm text-gray-700">{g.name}</div>

            {/* бар */}
            <div className="relative h-3 rounded-full bg-emerald-50">
              <div
                className="absolute left-0 top-0 h-3 rounded-full bg-emerald-600 transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, g.value))}%` }}
                aria-label={`${g.name}: ${fmtPct(g.value)}`}
                title={`${g.name}: ${fmtPct(g.value)}`}
              />
              {/* чипы с ролями поверх бара */}
              <div className="mt-2 flex flex-wrap gap-1">
                {g.chips.map((c) => (
                  <span
                    key={c.role}
                    className="text-[11px] px-2 py-[2px] rounded-md bg-gray-100 text-gray-800"
                    title={`${ROLE_LABELS[c.role]} — ${fmtPct(c.pct)}`}
                  >
                    {c.role} <span className="opacity-70">{fmtPct(c.pct)}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="text-right text-sm text-gray-600">{fmtPct(g.value)}</div>
          </div>
        ))}

      <div className="text-xs text-gray-500">
        Без учёта матчей национальных сборных (ЧМ/ЧЕ).
      </div>
    </div>
  );
}
