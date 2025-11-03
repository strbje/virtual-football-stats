'use client';

import React from 'react';
import RoleHeatmap from '@/components/players/RoleHeatmap';
import type { RolePercent } from '@/lib/roles';

// Формат ответа API может быть { role, pct } или { role, percent }.
// Приводим к RolePercent и отбрасываем нули.
type ApiRole = {
  role?: string;
  pct?: number;
  percent?: number;
};

export default function RoleHeatmapFromApi({ roles }: { roles: ApiRole[] }) {
  const mapped: RolePercent[] = (roles ?? [])
    .map((r) => ({
      role: String(r.role ?? '').toUpperCase().trim(),
      percent: Number(r.percent ?? r.pct ?? 0),
    }))
    .filter((r) => r.role && isFinite(r.percent) && r.percent > 0);

  // Никаких лишних пропов (caption и т.п. здесь не нужен)
  return <RoleHeatmap data={mapped} />;
}
