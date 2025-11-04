'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import RoleHeatmap from '@/components/players/RoleHeatmap';
import type { RolePercent } from '@/utils/roles';

type ApiOk = { ok: true; roles: RolePercent[] };
type ApiErr = { ok: false; error: string };

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function RoleHeatmapFromApi(props: { userId: number; range?: string }) {
  const { userId, range = '' } = props;

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (range) p.set('range', range);
    return p.toString();
  }, [range]);

  const url = `/api/player-roles/${userId}${qs ? `?${qs}` : ''}`;
  const { data, error, isLoading } = useSWR<ApiOk | ApiErr>(url, fetcher);

  if (isLoading) return <div className="text-sm text-muted-foreground">Загружаю тепловую карту…</div>;
  if (error || !data || !('ok' in data) || !data.ok) {
    return <div className="text-sm text-destructive">Не удалось загрузить роли</div>;
  }

  return (
    <RoleHeatmap
      rolePercents={data.roles}
      widthPx={500}
      heightPx={700}
      tooltip
    />
  );
}
