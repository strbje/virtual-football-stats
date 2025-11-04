// src/app/players/_components/RoleHeatmapFromApi.tsx
'use client';

import * as React from 'react';
import RoleHeatmap, { type RolePercent } from '@/components/players/RoleHeatmap';

type Props = {
  userId: number;
  fromTs?: number | null;
  toTs?: number | null;
  caption?: string;
};

export default function RoleHeatmapFromApi({ userId, fromTs, toTs, caption }: Props) {
  const [data, setData] = React.useState<RolePercent[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const p = new URLSearchParams();
    if (fromTs) p.set('fromTs', String(fromTs));
    if (toTs) p.set('toTs', String(toTs));

    fetch(`/api/player-roles/${userId}${p.toString() ? `?${p}` : ''}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((j) => {
        if (!j?.ok) throw new Error(j?.error || 'Failed to load');
        // ожидаем массив объектов { role, percent }
        setData(Array.isArray(j.data) ? j.data : []);
        setErr(null);
      })
      .catch(e => setErr(e.message));
  }, [userId, fromTs, toTs]);

  if (err) {
    return <div className="text-sm text-red-600">Не удалось загрузить тепловую карту: {err}</div>;
  }
  if (!data) {
    return <div className="text-sm text-gray-500">Загрузка тепловой карты…</div>;
  }

  return <RoleHeatmap data={data} caption={caption ?? 'Тепловая карта амплуа'} />;
}
