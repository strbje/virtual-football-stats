'use client';

import React from 'react';
import RoleHeatmap from '@/components/players/RoleHeatmap';
import type { RolePercent } from '@/lib/roles';

type ApiRole = {
  role?: string;
  pct?: number;      // бывает pct
  percent?: number;  // бывает percent
};

type ApiResp =
  | { ok: true; roles: ApiRole[] }
  | { ok: false; error: string };

export default function RoleHeatmapFromApi({ userId }: { userId: number }) {
  const [data, setData] = React.useState<RolePercent[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/player-roles?userId=${userId}`, { cache: 'no-store' });
        const j: ApiResp = await res.json();

        if (!('ok' in j) || !j.ok) {
          throw new Error(('error' in j && j.error) ? j.error : 'Bad API response');
        }

        const mapped: RolePercent[] = (j.roles ?? [])
          .map((r) => ({
            role: String(r.role ?? '').toUpperCase().trim(),
            percent: Number(r.percent ?? r.pct ?? 0),
          }))
          .filter((r) => r.role && isFinite(r.percent) && r.percent > 0);

        if (alive) setData(mapped);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Failed to load roles');
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  if (err) {
    // тихо не ломаем страницу
    return <div className="text-xs text-red-600">Не удалось загрузить теплокарту: {err}</div>;
  }
  if (!data) {
    return <div className="text-xs text-muted-foreground">Загрузка теплокарты…</div>;
  }

  return <RoleHeatmap data={data} />;
}
