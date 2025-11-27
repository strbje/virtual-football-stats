// src/app/players/_components/RoleHeatmapFromApi.tsx
'use client';

import useSWR from 'swr';

// ВАЖНО: у нас default export у RoleHeatmap
// Если у тебя настроен alias "@", оставь строку ниже.
// Если alias не работает — замени на относительный путь '../../components/players/RoleHeatmap'
import RoleHeatmap, { RolePercent } from '@/components/players/RoleHeatmap';

type ApiOk = { ok: true; roles: RolePercent[] };
type ApiErr = { ok: false; error: string };
type Props = { userId: number; range?: string };

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function RoleHeatmapFromApi({ userId, range = '' }: Props) {
  const q = range ? `?range=${encodeURIComponent(range)}` : '';
  const { data, error, isLoading } = useSWR<ApiOk | ApiErr>(
    `/api/player-roles/${userId}${q}`,
    fetcher
  );

  if (isLoading) {
  return (
    <div className="
      rounded-2xl 
      border border-zinc-700/40 
      bg-zinc-900/40 
      shadow-lg shadow-zinc-900/40 
      p-4 text-sm 
      text-foreground
    ">
      Загружаем тепловую карту…
    </div>
  );
}

if (error || (!data || ("ok" in data && !data.ok))) {
  const msg =
    (data && "error" in data && data.error) ||
    (error as any)?.message ||
    "Нет данных";

  return (
    <div className="
      rounded-2xl 
      border border-red-700/40 
      bg-red-900/40 
      shadow-lg shadow-zinc-900/40 
      p-4 text-sm 
      text-red-300
    ">
      Ошибка загрузки: {msg}
    </div>
  );
}

// итог
return <RoleHeatmap data={("ok" in data ? data.roles : [])} />;
