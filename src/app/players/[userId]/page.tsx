// src/app/players/[userId]/page.tsx
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";

// группировки/агрегации берём из уже проверенной логики
import { groupRolePercents, toLeagueBuckets } from "@/lib/roles";

type Params = { userId: string };

type ApiRole = { role: string; percent: number };
type ApiLeague = { code: string; pct: number };

type ApiResponse = {
  ok: boolean;
  matches: number;
  roles: ApiRole[];
  currentRole?: string;         // если отдаёт API
  nickname?: string;            // если отдаёт API
  teamName?: string;            // если отдаёт API
  leagues?: ApiLeague[];        // если отдаёт API
};

function safeNumber(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function buildBaseURL(): string | null {
  // если задан публичный базовый адрес — используем его
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return null; // по умолчанию пойдём на относительный путь
}

export default async function PlayerPage({ params }: { params: Params }) {
  const userId = params.userId;

  // 1) тянем данные об амплуа/лигах
  const base = buildBaseURL();

  // сначала пробуем относительный путь (в большинстве окружений он работает),
  // если вдруг среда потребует абсолютный URL — есть запасной вариант
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

  // роли поштучно из API → агрегируем в группы для левого бара
  const grouped = groupRolePercents(
    data.roles.map(r => ({ role: r.role, percent: safeNumber(r.percent) }))
  );

  // подготовка ролей для RoleDistributionSection (ожидает label/value)
  const rolesForChart = grouped.map(g => ({ label: g.label, value: g.percent }));

  // лиги из API или формируем на лету (с «Прочие»)
  const leaguesFromApi = Array.isArray(data.leagues) ? data.leagues : [];
  const leagues = toLeagueBuckets(leaguesFromApi);

  // заголовок
  const nickname = data.nickname || `User #${userId}`;
  const teamName = data.teamName || "";

  // актуальное амплуа (из API, если нет — по максимуму за 30 матчей считается на стороне API)
  const currentRole = data.currentRole ?? "";

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* шапка */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName ? (
          <div className="text-sm text-zinc-500">{teamName}</div>
        ) : null}
        <a href="/players" className="mt-3 inline-block text-sky-600 hover:underline">
          ← Ко всем игрокам
        </a>
      </div>

      {/* KPI row — одна строка: Матчи + Актуальное амплуа */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Матчи */}
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-3xl font-semibold">{matches}</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            *без учета национальных матчей
          </div>
        </div>

        {/* Актуальное амплуа */}
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
          labelWidthPx={320}        // шире подписи — влезают длинные названия
          rolesBarWidthPx={520}     // левый бар
          leaguesBarWidthPx={460}   // правый бар
          tooltip
        />
      </section>

      {/* тепловая карта */}
      <div>
        <h3 className="text-sm font-medium text-zinc-700 mb-3">Тепловая карта амплуа</h3>
        <RoleHeatmap roles={data.roles} />
      </div>
    </div>
  );
}
