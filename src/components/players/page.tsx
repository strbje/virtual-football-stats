// src/components/players/page.tsx
import RoleHeatmap from '@/components/players/RoleHeatmap';
import { groupRolePercents, type RolePercent } from '@/utils/roles';

type Props = {
  data: RolePercent[]; // [{ role: 'ЦАП', percent: 21 }, ...] — уже агрегированные % по амплуа
  showBadges?: boolean;
};

export default function RoleDistributionSection({ data, showBadges = false }: Props) {
  const grouped = groupRolePercents(data);

  return (
    <section className="space-y-6">
      {/* Сверху — сгруппированное распределение */}
      <div>
        <h3 className="font-semibold mb-2">Распределение амплуа, % матчей</h3>
        <ul className="list-disc pl-5 space-y-1">
          {grouped.map((g) => (
            <li key={g.group}>
              {g.group}: {Math.round(g.percent)}%
            </li>
          ))}
        </ul>
      </div>

      {/* Ниже — тепловая карта по ВСЕМ амплуа */}
      <div>
        <h3 className="font-semibold mb-2">Тепловая карта амплуа</h3>
        <RoleHeatmap data={data} showBadges={showBadges} />
      </div>
    </section>
  );
}
