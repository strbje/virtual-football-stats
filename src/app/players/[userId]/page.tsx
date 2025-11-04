// src/app/players/[userId]/page.tsx
import { headers } from "next/headers";
import Link from "next/link";

import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";

// Агрегация (твоя логика) — из lib
import { groupRolePercents } from "@/lib/roles";

// Справочники, типы и упаковка «лиг» — из utils
import {
  ROLE_LABELS,
  HEATMAP_ROLES_ORDER,
  toLeagueBuckets,
  type RoleCode,
  type RolePercent,
} from "@/utils/roles";

export const dynamic = "force-dynamic";

type ApiRolesResp = {
  ok: boolean;
  matches: number;
  roles: { role: RoleCode; percent: number }[];
  error?: string;
};

type UserRow = { id: number; gamertag: string | null; username: string | null };

// --- helpers ---
async function buildBaseURL() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function pickCurrentRole(roles: RolePercent[]): string {
  if (!roles.length) return "—";
  const top = roles.slice().sort((a, b) => b.percent - a.percent)[0].role;
  return ROLE_LABELS?.[top] ?? top;
}

// --- page ---
export default async function PlayerProfile({
  params,
}: {
  params: { userId: string };
}) {
  const userId = params.userId;
  const base = await buildBaseURL();

  // 1) имя игрока
  const userRes = await fetch(
    `${base}/api/sql?query=${encodeURIComponent(
      `SELECT id, gamertag, username FROM tbl_users WHERE id = ${Number(
        userId
      )} LIMIT 1`
    )}`,
    { cache: "no-store" }
  ).catch(() => null);

  let title = `User #${userId}`;
  if (userRes && userRes.ok) {
    const rows = (await userRes.json()) as { rows: UserRow[] };
    const u = rows?.rows?.[0];
    if (u) title = u.gamertag || u.username || title;
  }

  // 2) распределение по амплуа
  const rolesResp = await fetch(
    `${base}/api/player-roles?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  const rolesJson = (await rolesResp.json()) as ApiRolesResp;

  const rolePercents: RolePercent[] = rolesJson.roles.map((r) => ({
    role: r.role,
    percent: r.percent,
  }));

  // 3) группировка (из lib) + приведение к формату RoleDistributionSection
  const grouped = groupRolePercents(rolePercents);
  const rolesForChart = grouped.map((g: any) => ({
    label: g.label ?? g.group ?? String(g.role ?? ""),
    value: g.value ?? g.percent ?? 0,
  }));

  // 4) тепловая карта по фиксированному порядку
  const heatmapData = HEATMAP_ROLES_ORDER.map((code) => {
    const found = rolePercents.find((x) => x.role === code);
    return { role: code, percent: found ? found.percent : 0 };
  });

  // 5) лиги — заглушка (готовы принять реальные данные)
  const leagues = toLeagueBuckets([]);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <Link href="/players" className="text-blue-600 hover:underline text-sm">
          ← Ко всем игрокам
        </Link>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold tabular-nums">
            {rolesJson.matches}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Актуальное амплуа</div>
          <div className="text-2xl font-semibold">
            {pickCurrentRole(rolePercents)}
          </div>
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
