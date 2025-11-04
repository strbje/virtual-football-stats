// src/app/players/[userId]/page.tsx
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";
import { groupRolePercents } from "@/lib/roles";
import {
  HEATMAP_ROLES_ORDER,
  ROLE_LABELS,
  type RolePercent,
  type RoleCode,
} from "@/utils/roles";

export const dynamic = "force-dynamic";

type ApiResp = {
  ok: boolean;
  matches: number;
  roles: { role: RoleCode; percent: number }[];
  currentRoleLast30?: RoleCode | null;
  leagues?: { label: string; pct: number }[];
  user?: { nickname: string; team: string | null };
  error?: string;
};

const GROUP_LABELS: Record<string, string> = {
  FORWARD: "Форвард",
  ATT_MID: "Атакующий полузащитник",
  WIDE_MID: "Крайний полузащитник",
  CENT_MID: "Центральный полузащитник",
  DEF_MID: "Опорный полузащитник",
  FULLBACK: "Крайний защитник",
  CENTER_BACK: "Центральный защитник",
  GOALKEEPER: "Вратарь",
};

export default async function PlayerPage({ params }: { params: { userId: string } }) {
  const userId = Number(params.userId);
  const res = await fetch(`/api/player-roles?userId=${userId}`, { cache: "no-store" });
  const data = (await res.json()) as ApiResp;

  if (!data.ok) {
    // мягкая заглушка, чтобы страница не падала
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">User #{userId}</h1>
        <p className="mt-2 text-sm text-red-600">Ошибка загрузки: {data.error ?? "unknown"}</p>
      </div>
    );
  }

  const nickname = data.user?.nickname ?? `User #${userId}`;
  const teamName = data.user?.team ?? null;

  const rolePercents: RolePercent[] = data.roles.map(r => ({ role: r.role, percent: r.percent }));
  const matches = data.matches;

  // группировки для левого бара
  const grouped = groupRolePercents(rolePercents);
  const rolesForChart = grouped.map((g: any) => ({
    label: GROUP_LABELS[g.group ?? g.label] ?? (g.label ?? String(g.group)),
    value: Number(g.value ?? g.percent ?? 0),
  }));

  // тепловая — только >0
  const heatmapData = HEATMAP_ROLES_ORDER
    .map(code => {
      const f = rolePercents.find(x => x.role === code);
      return { role: code, percent: f ? f.percent : 0 };
    })
    .filter(x => x.percent > 0);

  // актуальное амплуа (мода за 30)
  const currentRole =
    (data.currentRoleLast30 && (ROLE_LABELS as any)[data.currentRoleLast30]) ||
    data.currentRoleLast30 ||
    "—";

  // лиги
  const leagues = (data.leagues ?? []).map(x => ({ label: x.label, pct: x.pct }));

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName && <div className="text-sm text-zinc-500 mt-1">{teamName}</div>}
        <div className="mt-2">
          <a href="/players" className="text-blue-600 hover:underline text-sm">← Ко всем игрокам</a>
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:max-w-[720px]">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold tabular-nums">{matches}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500" title="За последние 30 матчей">Актуальное амплуа</div>
          <div className="text-2xl font-semibold">{currentRole}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection
          roles={rolesForChart}
          leagues={leagues}
          widthPx={500}
          tooltip
        />
      </section>

      <section className="md:max-w-[1100px]">
        <div className="text-sm font-semibold mb-2">Тепловая карта амплуа</div>
        <RoleHeatmap data={heatmapData} />
      </section>
    </div>
  );
}
