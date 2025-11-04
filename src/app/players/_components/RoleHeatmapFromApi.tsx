'use client';

import useSWR from 'swr';
import { RoleHeatmap } from '@/components/players/RoleHeatmap';
import type { RolePercent } from '@/components/players/RoleHeatmap';

type ApiOk = { ok: true; roles: RolePercent[] };
type ApiErr = { ok: false; error: string };

const fetcher = (url: string) => fetch(url).then(r => r.json() as Promise<ApiOk | ApiErr>);

type Props = {
  userId: number;
  /** Формат "dd.mm.yyyy:dd.mm.yyyy" или пустая строка */
  range?: string;
};

export default function RoleHeatmapFromApi({ userId, range = '' }: Props) {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const { data, isLoading, error } = useSWR<ApiOk | ApiErr>(`/api/player-roles/${userId}${qs}`, fetcher);

  if (isLoading) return <div className="text-sm text-muted-foreground">Загрузка тепловой карты…</div>;
  if (error)     return <div className="text-sm text-red-500">Ошибка загрузки</div>;
  if (!data || ('ok' in data && !data.ok)) {
    const msg = !data ? 'нет данных' : ('error' in data ? data.error : 'ошибка');
    return <div className="text-sm text-red-500">Не удалось получить роли: {msg}</div>;
  }

  // ✅ ВАЖНО: передаём props, которые реально есть у RoleHeatmap
  return (
    <RoleHeatmap
      roles={data.roles}
      widthPx={500}
      heightPx={700}
      tooltip
    />
  );
}
