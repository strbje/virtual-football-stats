// src/app/players/[userId]/page.tsx
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";
import { groupRolePercents } from "@/lib/roles";

type Params = { userId: string };

type ApiRole = { role: string; percent: number };
type ApiLeague = { code: string; pct: number };

type ApiResponse = {
  ok: boolean;
  matches: number;
  roles: ApiRole[];
  currentRole?: string;
  nickname?: string;
  teamName?: string;
  leagues?: ApiLeague[];
};

function safeNumber(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function buildBaseURL(): string | null {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return null;
}

/** Локально собираем распределение лиг + «Прочие». */
function makeLeagueBuckets(leaguesFromApi: ApiLeague[] | undefined) {
  const src = Array.isArray(leaguesFromApi) ? leaguesFromApi : [];
  const wanted: Record<string, string> = { PL: "ПЛ", FNL: "ФНЛ", PFL: "ПФЛ", LFL: "ЛФЛ" };
  const acc: Record<string, number> = { ПЛ: 0, ФНЛ: 0, ПФЛ: 0, ЛФЛ: 0, Прочие: 0 };

  for (const it of src) {
    const code = (it.code || "").toUpperCase();
    const pct = safeNumber(it.pct);
    const label = wanted[code];
    if (label) acc[label] += pct;
    else acc["Прочие"] += pct;
  }

  return [
    { label: "ПЛ", pct: acc["ПЛ"] },
    { label: "ФНЛ", pct: acc["ФНЛ"] },
    { label: "ПФЛ", pct: acc["ПФЛ"] },
    { label: "ЛФЛ", pct: acc["ЛФЛ"] },
    { label: "Прочие", pct: acc["Прочие"] },
  ];
}

export default async function PlayerPage({ params }: { params: Params }) {
  const userId = params.userId;

  // --- fetch с резервным абсолютным URL ---
  const base = buildBaseURL();
  let data: ApiResponse | null = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(`/api/player-roles?userId=${userId}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as ApiResponse;
  } catch (e: any) {
    if (base) {
      try {
        const res2 = await fetch(`${base}/api/player-roles?userId=${userId}`, { cache: "no-store" });
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        data = (await res2.json()) as ApiResponse;
      } catch (e2: any) {
        fetchError = `Failed to fetch player-roles: ${String(e2?.message ?? e2)}`;
      }
    } else {
      fetchError = `Failed to parse URL for relative fetch: ${String(e?.message ?? e)}`;
    }
  }

  if (!data?.ok) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold">{`User #${userId}`}</h1>
        <p className="mt-3 text-sm text-red-600">
          Ошибка загрузки: {fetchError ?? "нет данных от API /api/player-roles"}
        </p>
        <a href="/players" className="mt-4 inline-block text-sky-600 hover:underline">
          ← Ко всем игрокам
        </a>
      </div>
    );
  }

  const matches = safeNumber(data.matches, 0);
  const nickname = data.nickname || `User #${userId}`;
  const teamName = data.teamName || "";
  const currentRole = data.currentRole ?? "";

  // роли → группировки (для левого бара)
  const grouped = groupRolePercents(
    data.roles.map((r) => ({ role: r.role, percent: safeNumber(r.percent) }))
  );
  const rolesForChart = grouped.map((g: any) => ({
    label: g.label ?? g.group,
    value: safeNumber(g.percent),
  }));

  // лиги с «Прочие»
  const leagues = makeLeagueBuckets(data.leagues);

  // алиас без TS-типов, чтобы не спорить с сигнатурой RoleHeatmap
  const Heatmap: any = RoleHeatmap;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* шапка */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName ? <div className="text-sm text-zinc-500">{teamName}</div> : null}
        <a href="/players" className="mt-3 inline-block text-sky-600 hover:underline">
          ← Ко всем игрокам
        </a>
      </div>

      {/* KPI row — Матчи слева, Актуальное амплуа справа */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-3xl font-semibold">{matches}</div>
          <div className="mt-1 text-[11px] text-zinc-500">*без учета национальных матчей</div>
        </div>

        <div className="rounded-xl border p-4" title="За последние 30 матчей">
          <div className="text-sm text-zinc-500">Актуальное амплуа</div>
          <div className="text-3xl font-semibold">{currentRole}</div>
        </div>
      </div>

      {/* распределения: амплуа слева, лиги справа */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection
          roles={rolesForChart}
          leagues={leagues}
          labelWidthPx={320}
          rolesBarWidthPx={520}
          leaguesBarWidthPx={460}
          tooltip
        />
      </section>

      {/* тепловая */}
      <div>
        <h3 className="text-sm font-medium text-zinc-700 mb-3">Тепловая карта амплуа</h3>
        <Heatmap/>
      </div>
    </div>
  );
}
