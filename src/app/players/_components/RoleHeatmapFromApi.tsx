"use client";

import useSWR from "swr";
import RoleHeatmap from "./RoleHeatmap";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function RoleHeatmapFromApi({
  userId,
  range, // "DD.MM.YYYY:DD.MM.YYYY" | ""
}: {
  userId: number;
  range?: string;
}) {
  const qs = range ? `?range=${encodeURIComponent(range)}` : "";
  const { data } = useSWR(`/api/player-roles/${userId}${qs}`, fetcher, { revalidateOnFocus: false });

  return (
    <RoleHeatmap
      width={500}
      height={700}
      byRolePercent={data?.byRole || {}}
    />
  );
}
