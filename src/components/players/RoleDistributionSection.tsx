import RoleHeatmapFromApi from '@/app/players/_components/RoleHeatmapFromApi';
import type { RolePercent } from '@/utils/roles';

export type LeagueBar = { label: string; percent: number };

type Props =
  | {
      /** исторически на странице передаётся data — поддерживаем для обратной совместимости */
      data: RolePercent[];
      leagues?: LeagueBar[];
      widthPx?: number;
      tooltip?: boolean;
      userId?: number;  // чтобы тут же вставить теплокарту, если нужно
      range?: string;
    }
  | {
      roles: RolePercent[];
      leagues?: LeagueBar[];
      widthPx?: number;
      tooltip?: boolean;
      userId?: number;
      range?: string;
    };

/** Прогресс-бары по амплуа + опционально внизу теплокарта */
export default function RoleDistributionSection(props: Props) {
  const roles: RolePercent[] = 'roles' in props ? props.roles : props.data;
  const { leagues, userId, range } = props as any;

  return (
    <div className="space-y-4">
      {/* Прогресс-бары по амплуа */}
      <div className="space-y-2">
        {roles.map(r => (
          <div key={r.role} className="flex items-center gap-3">
            <div className="w-56 shrink-0 text-sm">{labelByRole(r.role)}</div>
            <div className="h-2 w-full rounded bg-emerald-50">
              <div
                className="h-2 rounded bg-emerald-600"
                style={{ width: `${Math.max(0, Math.min(100, r.percent))}%` }}
                title={`${r.percent.toFixed(0)}%`}
              />
            </div>
            <div className="w-10 text-right text-sm text-muted-foreground">
              {r.percent.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>

      {/* Если нужно — второй барчарт по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ) */}
      {leagues && leagues.length > 0 && (
        <div className="space-y-2 pt-4">
          {leagues.map(x => (
            <div key={x.label} className="flex items-center gap-3">
              <div className="w-56 shrink-0 text-sm">{x.label}</div>
              <div className="h-2 w-full rounded bg-zinc-100">
                <div
                  className="h-2 rounded bg-zinc-700"
                  style={{ width: `${Math.max(0, Math.min(100, x.percent))}%` }}
                  title={`${x.percent.toFixed(0)}%`}
                />
              </div>
              <div className="w-10 text-right text-sm text-muted-foreground">
                {x.percent.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Тепловая карта (500×700), если передан userId */}
      {typeof userId === 'number' && (
        <section className="pt-6">
          <h3 className="font-semibold mb-2">Тепловая карта амплуа</h3>
          <div style={{ width: 500, height: 700 }}>
            <RoleHeatmapFromApi userId={userId} range={range ?? ''} />
          </div>
        </section>
      )}
    </div>
  );
}

function labelByRole(code: RolePercent['role']) {
  // короткие подписи — можно заменить на ROLE_LABELS, если есть
  return code;
}
