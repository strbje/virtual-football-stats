'use client';

import useSWR from 'swr';
import RoleHeatmap from '@/components/players/RoleHeatmap';           // ⬅️ default import
import type { RolePercent } from '@/components/players/RoleHeatmap';   // тип можно оставить

type ApiOk  = { ok: true;  roles: RolePercent[] };
type ApiErr = { ok: false; error: string };

const fetcher = (url: string) => fetch(url).then(r => r.json() as Promise<ApiOk | ApiErr>);

type Props = {
  userId: number;
  /** "dd.mm.yyyy:dd.mm.yyyy" или пусто */
  range?: string;
};

export default function RoleHeatmapFromApi({ userId, range = '' }: Props) {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const { data, isLoading, error } = useSWR<ApiOk | ApiErr>(
    `/api/player-roles/${userId}${qs}`,
    fetcher
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Загрузка теплокарты…</div>;
  if (error)     return <div className="text-sm text-red-500">Ошибка загрузки</div>;
  if (!data || ('ok' in data && !data.ok)) {
    const msg = !data ? 'нет данных' : data.error;
    return <div className="text-sm text-red-500">Не удалось получить роли: {msg}</div>;
  }

  return (
    <RoleHeatmap
      roles={data.roles}
      widthPx={500}
      heightPx={700}
      tooltip
    />
  );
}
