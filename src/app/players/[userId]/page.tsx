// src/app/players/[userId]/page.tsx
import { headers } from "next/headers";
import Link from "next/link";

import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";

// ВАЖНО: берём агрегации и справочники из src/lib/roles.ts (как ты просил)
import {
  ROLE_LABELS,
  HEATMAP_ROLES_ORDER,
  type RoleCode,
  type RolePercent,
  groupRolePercents,     // корректная группировка по ролям
  toLeagueBuckets,       // подготовка «распределения по лигам»
} from "@/lib/roles";

export const dynamic = "force-dynamic";

type ApiRolesResp = {
  ok: boolean;
  matches: number;
  roles: { role: RoleCode; percent: number }[];
  error?: string;
};

type UserRow = { id: number; gamertag: string | null; username: string | null };

// --- утилиты

function buildBaseURL() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// «текущее амплуа» — просто топ-роль по доле (как было до начальной возни).
function pickCurrentRole(roles: RolePercent[]): string {
  if (!roles.length) return "—";
  const top = roles.slice().sort((a, b) => b.percent - a.percent)[0].role;
  return ROLE_LABELS[top] ?? top;
}

// --- страница

export default async function PlayerProfile({
  params,
}: {
  params: { userId: string };
}) {
  const userId = params.userId;
  const base = buildBaseURL();

  // 1) базовая инфа игрока (чтобы убрать User #NaN)
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

  // 2) распределение по амплуа (наш рабочий API, уже без BigInt)
  const rolesResp = await fetch(
    `${base}/api/player-roles?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  const rolesJson = (await rolesResp.json()) as ApiRolesResp;

  const rolePercents: RolePercent[] = rolesJson.roles.map((r) => ({
    role: r.role,
    percent: r.percent,
  }));

  // 3) сгруппировать амплуа для бар-чарта по группам (форвард/полузащита/защита/вратарь)
  const groupedRoles = groupRolePercents(rolePercents);

  // 4) тепловая карта: фиксированный порядок всех позиций из справочника
  const heatmapData = HEATMAP_ROLES_ORDER.map((code) => {
    const found = rolePercents.find((x) => x.role === code);
    return { role: code, percent: found ? found.percent : 0 };
  });

  // 5) распределение по лигам — оставляем заглушку (как раньше), чтобы не ломать.
  // Если у тебя уже есть реальные проценты по лигам — просто подай сюда массив и toLeagueBuckets их упакует.
  const leagues = toLeagueBuckets([]);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* хедер */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <Link href="/players" className="text-blue-600 hover:underline text-sm">
          ← Ко всем игрокам
        </Link>
      </div>

      {/* карточки метрик */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold tabular-nums">
            {rolesJson.matches}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Актуальное амплуа</div>
          <div className="text-2xl font-semibold">{pickCurrentRole(rolePercents)}</div>
        </div>
      </section>

      {/* распределения: слева амплуа, справа лиги (как просили) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection roles={groupedRoles} leagues={leagues} widthPx={500} tooltip />
      </section>

      {/* тепловая карта — БЕЗ BigInt, из уже нормализованных процентов */}
      <section className="md:max-w-[1100px]">
        <div className="text-sm font-semibold mb-2">Тепловая карта амплуа</div>
        <RoleHeatmap data={heatmapData} />
      </section>
    </div>
  );
}
