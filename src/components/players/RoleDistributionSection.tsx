// src/components/players/RoleDistributionSection.tsx
import { RolePercent, groupRolePercents } from '@/utils/roles';

export default function RoleDistributionSection({ data }: { data: RolePercent[] }) {
  const grouped = groupRolePercents(data);
  return (
    <div>
      <h3 className="font-semibold mb-2">Распределение амплуа, % матчей</h3>
      <ul className="list-disc pl-5 space-y-1">
        {grouped.map(g => (
          <li key={g.group}>{g.group}: {Math.round(g.percent)}%</li>
        ))}
      </ul>
    </div>
  );
}
