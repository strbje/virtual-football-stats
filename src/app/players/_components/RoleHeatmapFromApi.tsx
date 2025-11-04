'use client';

import useSWR from 'swr';
import RoleHeatmap from '@/components/players/RoleHeatmap';

type RolePercent = { role: string; percent: number };

// Подстрой под фактическую форму ответа твоего API:
type ApiResponse =
  | { ok: true; roles: RolePercent[] }
  | { ok: false; error: string };

type Props = {
  userId: number;
  /** строка вида "dd.mm.yyyy:dd.mm.yyyy" или пустая */
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
  if ('ok' in data && data.ok === false) {
    return (
      <div className="text-red-500 text-sm">
        {data.error || 'Ошибка API'}
      </div>
    );
  }

  // Если у твоего RoleHeatmap обязательные пропы widthPx/heightPx — можно передать их здесь,
  // но сейчас оставляю только роли, т.к. контейнер на странице уже фиксирует 500×700.
  return <RoleHeatmap roles={('ok' in data ? data.roles : [])} />;
}
