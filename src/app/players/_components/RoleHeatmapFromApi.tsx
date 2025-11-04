'use client';

import useSWR from 'swr';
import RoleHeatmap from '@/components/players/RoleHeatmap';

type RolePercent = { role: string; percent: number };

type ApiOk = { ok: true; roles: RolePercent[] };
type ApiErr = { ok: false; error: string };
type ApiResponse = ApiOk | ApiErr;

type Props = {
  userId: number;
  /** "dd.mm.yyyy:dd.mm.yyyy" или пустая строка */
  range?: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export default function RoleHeatmapFromApi({ userId, range }: Props) {
  const qs =
    range && range.trim().length > 0
      ? `?range=${encodeURIComponent(range)}`
      : '';

  const { data, error, isLoading } = useSWR<ApiResponse>(
    `/api/player-roles/${userId}${qs}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (error) {
    return (
      <div className="text-red-500 text-sm">
        Не удалось загрузить тепловую карту
      </div>
    );
  }
  if (!data || isLoading) {
    return <div className="text-sm text-muted-foreground">Загрузка…</div>;
  }
  if (!('ok' in data) || data.ok === false) {
    return (
      <div className="text-red-500 text-sm">
        {('error' in data && data.error) || 'Ошибка API'}
      </div>
    );
  }

  // ВАЖНО: RoleHeatmap ожидает prop `rolePercents`, а не `roles`.
  return (
    <RoleHeatmap
      rolePercents={data.roles}
      widthPx={500}
      heightPx={700}
      tooltip
    />
  );
}
