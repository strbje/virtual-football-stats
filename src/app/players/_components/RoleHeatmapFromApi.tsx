"use client";

import useSWR from "swr";
import RoleHeatmap from "./RoleHeatmap";

type Props = {
  userId: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RoleHeatmapFromApi({ userId }: Props) {
  const { data, error, isLoading } = useSWR(
    userId ? `/api/player-roles-heatmap/${userId}` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="vfs-alert">
        Загружаем тепловую карту…
      </div>
    );
  }

  if (error || !data || ("ok" in data && !data.ok)) {
    const msg =
      (data && "error" in data && (data as any).error) ||
      (error as any)?.message ||
      "Нет данных";

    return (
      <div className="vfs-alert-error">
        Ошибка загрузки: {msg}
      </div>
    );
  }

  // НУЖНО: передаём проп именно "data"
  const roles = "ok" in data ? (data as any).roles : data;

  return <RoleHeatmap data={roles} />;
}
