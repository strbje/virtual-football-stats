// src/components/players/RoleDistributionSection.tsx
'use client';

import { groupRolePercents, type RolePercent } from '@/utils/roles';

export default function RoleDistributionSection({ data }: { data: RolePercent[] }) {
  const grouped = groupRolePercents(data);
  if (!grouped.length) return null;

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Распределение амплуа, % матчей</h3>
      <ul className="list-disc pl-5 space-y-1">
        {grouped
          .filter(g => g.percent > 0) // на всякий случай
          .map(g => (
            <li key={g.group}>
              {g.group}: {Math.round(g.percent)}%
            </li>
          ))}
      </ul>
    </section>
  );
}
