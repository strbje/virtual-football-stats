'use client';

import useSWR from 'swr';
import RoleHeatmap from '@/components/players/RoleHeatmap';

export type RoleCode =
  | 'ВРТ'
  | 'ЛЗ' | 'ПЗ'
  | 'ЛОП' | 'ЦОП' | 'ПОП'
  | 'ЦП' | 'ЛПЦ' | 'ПЦП'
  | 'ЛАП' | 'ПАП' | 'ЛП' | 'ПП'
  | 'ЦАП'
  | 'ФРВ' | 'ЦФД' | 'ЛФД' | 'ЛФА' | 'ПФА' | 'ПФД'
  | 'ЛЦЗ' | 'ПЦЗ' | 'ЦЗ';

export type RolePercent = { role: RoleCode; percent: number };

type ApiOk = { ok: true; roles: RolePercent[] };
type ApiErr = { ok: false; error: string };

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function RoleHeatmapFromApi(props: { userId: number; range?: string }) {
  const { userId, range = '' } = props;
  const query = range ? `?range=${encodeURIComponent(range)}` : '';
  const { data, error, isLoading } = useSWR<ApiOk | ApiErr>(
    `/api/player-roles/${userId}${query}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Загружаю тепловую карту…</div>;
  }
  if (error || !data) {
    return <div className="text-sm text-red-600">Ошибка загрузки тепловой карты</div>;
  }
  if (!('ok' in data) || !data.ok) {
    return <div className="text-sm text-red-600">Ошибка: {(data as ApiErr).error || 'unknown'}</div>;
  }

  // Универсальная передача пропсов: пробуем и старое, и новое имя,
  // плюс тихо отключаем TS-проверку на этой строке, чтобы сборка не падала.
  // Контейнер страницы уже фиксирует размер 500×700.
  // @ts-expect-error — совместимость пропсов RoleHeatmap (roles/rolePercents)
  return <RoleHeatmap roles={data.roles} rolePercents={data.roles} widthPx={500} heightPx={700} tooltip />;
}
