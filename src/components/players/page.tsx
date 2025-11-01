import RoleHeatmap from '@/components/players/RoleHeatmap';
import { groupRolePercents, ROLE_TO_GROUP, type RolePercent } from '@/utils/roles';

// rawRolePercents — это то, что уже получаешь из БД: [{role:'ЦАП', percent: 21}, ...]
const rawRolePercents: RolePercent[] = playerRolePercentsFromDB; // ← подставь свой источник

const grouped = groupRolePercents(rawRolePercents);

// Рендер:
<section className="space-y-6">
  {/* Сверху — сгруппированное распределение */}
  <div>
    <h3 className="font-semibold mb-2">Распределение амплуа, % матчей</h3>
    <ul className="list-disc pl-5 space-y-1">
      {grouped.map(g => (
        <li key={g.group}>
          {g.group}: {Math.round(g.percent)}%
        </li>
      ))}
    </ul>
  </div>

  {/* Ниже — тепловая карта по ВСЕМ амплуа */}
  <div>
    <h3 className="font-semibold mb-2">Тепловая карта амплуа</h3>
    <RoleHeatmap data={rawRolePercents} showBadges={false} />
  </div>
</section>
