// src/app/players/[userId]/page.tsx
import { headers } from "next/headers";
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

// безопасный fetch с абсолютным URL (без падений страницы)
async function safeJsonAbs(base: string, path: string): Promise<any> {
  try {
    const url = `${base}${path}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} @ ${path}` };
    return await res.json();
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export default async function PlayerPage({ params }: { params: { userId: string } }) {
  const userId = Number(params.userId);

  // строим абсолютную базу для fetch
  const h = await headers(); // в твоей версии это Promise
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;

  // 1) основной путь: /api/player-roles/[userId]
  let data: ApiResp = await safeJsonAbs(base, `/api/player-roles/${userId}`);

  // 2) fallback на старый формат: /api/player-roles?userId=...
  if (!data?.ok) {
    data = await safeJsonAbs(base, `/api/player-roles?userId=${userId}`);
  }

  if (!data?.ok) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">{`User #${userId}`}</h1>
        <p className="mt-2 text-sm text-red-600">Ошибка загрузки: {data?.error ?? "unknown"}</p>
        <a href="/players" className="mt-4 inline-block text-blue-600 hover:underline">
          ← Ко всем игрокам
        </a>
      </div>
    );
  }

  const matches = Number(data.matches ?? 0);
  const rolePercents: RolePercent[] = Array.isArray(data.roles)
    ? data.roles.map((r) => ({ role: r.role, percent: Number(r.percent || 0) }))
    : [];

  // ник/команда (если API отдаёт)
  const nickname = data.user?.nickname ?? `User #${userId}`;
  const teamName = data.user?.team ?? null;

  // «Актуальное амплуа» (мода 30) + подсказка
  const currentRole =
    (data.currentRoleLast30 &&
      ((ROLE_LABELS as Record<string, string>)[data.currentRoleLast30] ??
        data.currentRoleLast30)) ||
    "—";
  const currentRoleHint = "За последние 30 матчей";

  // левый бар — твоя корректная агрегация
  const grouped = groupRolePercents(rolePercents);
  const rolesForChart = grouped.map((g: any) => ({
    label: GROUP_LABELS[g.group ?? g.label] ?? (g.label ?? String(g.group)),
    value: Number(g.value ?? g.percent ?? 0),
  }));

  // правый бар по лигам (если есть)
  const leagues =
    Array.isArray(data.leagues) && data.leagues.length
      ? data.leagues.map((x) => ({ label: x.label, pct: Number(x.pct || 0) }))
      : [];

  // тепловая — только позиции с >0%
  const heatmapData = HEATMAP_ROLES_ORDER
    .map((code) => {
      const f = rolePercents.find((x) => x.role === code);
      return { role: code, percent: f ? Number(f.percent || 0) : 0 };
    })
    .filter((x) => x.percent > 0);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* шапка */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName && <div className="text-sm text-zinc-500 mt-1">{teamName}</div>}
        <div className="mt-2">
          <a href="/players" className="text-blue-600 hover:underline text-sm">
            ← Ко всем игрокам
          </a>
        </div>
      </div>

      {/* карточки */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:max-w-[720px]">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold tabular-nums">{matches}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500" title={currentRoleHint}>
            Актуальное амплуа
          </div>
          <div className="text-2xl font-semibold">{currentRole}</div>
        </div>
      </section>

      {/* распределения */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection roles={rolesForChart} leagues={leagues} widthPx={500} tooltip />
      </section>

      {/* тепловая */}
      <section className="md:max-w-[1100px]">
        <div className="text-sm font-semibold mb-2">Тепловая карта амплуа</div>
        <RoleHeatmap data={heatmapData} />
      </section>
    </div>
  );
}
