'use client';

import React from 'react';
import RoleHeatmap from '@/components/players/RoleHeatmap';

type ApiRole = { role: string; count: number; pct: number };
type ApiResp =
  | { ok: true; roles: ApiRole[] }
  | { ok: false; error: string };

export default function RoleHeatmapFromApi({ userId }: { userId: number }) {
  const [roles, setRoles] = React.useState<ApiRole[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/player-roles?userId=${userId}`, { cache: 'no-store' });
        const json: ApiResp = await res.json();
        if (!alive) return;
        if ('ok' in json && json.ok) {
          setRoles(json.roles);
        } else {
          setErr((json as any).error ?? 'Unknown error');
        }
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? 'Network error');
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  if (err) {
    return <div className="text-sm text-red-500">Не удалось загрузить роли: {err}</div>;
  }
  if (!roles) {
    return <div className="text-sm text-gray-500">Загружаю тепловую карту…</div>;
  }

  // RoleHeatmap принимает короткие коды и проценты — этого из API достаточно
  return <RoleHeatmap data={roles} caption="Тепловая карта амплуа" />;
}
