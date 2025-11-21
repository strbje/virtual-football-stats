// src/app/players/[userId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";
import PlayerRadar from "@/components/players/PlayerRadar";

// ---------- API types ----------
type ApiRole = { role: string; percent: number };
type ApiLeague = { label: string; pct: number };

type ApiProfileResponse = {
  ok: boolean;
  matches: number;
  currentRoleLast30?: string | null;
  roles: ApiRole[];
  leagues?: ApiLeague[];
  user?: { nickname?: string | null; team?: string | null } | null;
};

type ApiStatsTotals = {
  matches: number;

  goals: number;
  assists: number;
  goal_contrib: number;
  xg: number;
  xg_delta: number;
  shots: number;
  shots_on_target_pct: number | null;
  shots_per_goal: number | null;

  passes_xa: number;
  key_passes: number;
  pre_assists: number;
  allpasses: number;
  completedpasses: number;
  pass_acc: number | null;
  pxa: number | null;

  allstockes: number;
  completedstockes: number;
  dribble_pct: number | null;

  intercepts: number;
  selection: number;
  completedtackles: number;
  blocks: number;
  allselection: number;
  def_actions: number;
  beaten_rate: number | null;

  outs: number;
  duels_air: number;
  duels_air_win: number;
  aerial_pct: number | null;
  duels_off_win: number;
  duels_off_lose: number;
  off_duels_total: number;
  off_duels_win_pct: number | null;

  crosses: number;
  allcrosses: number;
  cross_acc: number | null;
};

type ApiStatsResponse = {
  ok: boolean;
  userId: number;
  matches: number;
  totals: ApiStatsTotals;
  perMatch?: Partial<ApiStatsTotals> | null;
};

// ---------- URL helpers ----------
const BASE =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3000");

const abs = (path: string) => new URL(path, BASE).toString();
const n = (v: unknown, d = 0) => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : d;
};

// ---------- Group roles for left bar chart ----------
function groupRolePercents(roles: ApiRole[]) {
  const GROUPS: Record<string, string[]> = {
    Форвард: ["ЛФД", "ЦФД", "ПФД", "ФРВ", "ЛФА", "ПФА"],
    "Атакующий полузащитник": ["ЛАП", "ЦАП", "ПАП"],
    "Крайний полузащитник": ["ЛП", "ПП"],
    "Центральный полузащитник": ["ЛЦП", "ЦП", "ПЦП", "ЛОП", "ПОП", "ЦОП"],
    "Крайний защитник": ["ЛЗ", "ПЗ"],
    "Центральный защитник": ["ЦЗ", "ЛЦЗ", "ПЦЗ"],
    Вратарь: ["ВРТ", "ВР"],
  };

  return Object.entries(GROUPS).map(([label, codes]) => {
    const pct = roles
      .filter((r) => codes.includes(r.role))
      .reduce((s, r) => s + n(r.percent), 0);
    return { label, value: pct };
  });
}

// ---------- Leagues + “Прочие” ----------
function withOthersBucket(leagues?: ApiLeague[]) {
  const list = Array.isArray(leagues) ? leagues.slice() : [];
  const sum = list.reduce((s, l) => s + n(l.pct), 0);
  const others = sum >= 0 && sum <= 100 ? Math.max(0, 100 - sum) : 0;

  const need = new Map<string, number>([
    ["ПЛ", 0],
    ["ФНЛ", 0],
    ["ПФЛ", 0],
    ["ЛФЛ", 0],
  ]);
  for (const l of list) if (need.has(l.label)) need.delete(l.label);
  for (const [label, pct] of need) list.push({ label, pct });

  list.push({ label: "Прочие", pct: others });
  const ORDER = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие"];
  list.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  return list;
}

// ---------- Radar fetch ----------
async function buildBaseURL() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function fetchPlayerRadar(userId: string) {
  try {
    const base = await buildBaseURL();
    const res = await fetch(`${base}/api/player-radar/${userId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as {
      ok: boolean;
      ready?: boolean;
      currentRole?: string | null;
      radar?: { label: string; pct: number | null }[];
    } | null;
  } catch {
    return null;
  }
}

// ---------- Page ----------
type Params = { userId: string };

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  return { title: `Игрок #${params.userId} — Virtual Football Stats` };
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: { tab?: string };
}) {
  const userId = params.userId;
  const tab = searchParams?.tab === "stats" ? "stats" : "profile";

  // основной API (амплуа + лиги + ник)
  const url = abs(`/api/player-roles?userId=${encodeURIComponent(userId)}`);
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold">{`User #${userId}`}</h1>
        <p className="text-red-600 mt-4">
          Ошибка загрузки: {res.status} {res.statusText}
        </p>
        <Link href="/players" className="text-blue-600 mt-3 inline-block">
          ← Ко всем игрокам
        </Link>
      </div>
    );
  }

  const data: ApiProfileResponse = await res.json();

  const nickname = (data.user?.nickname ?? `User #${userId}`) as string;
  const teamName = (data.user?.team ?? "") as string;
  const matches = n(data.matches);

  const rolesForChart = groupRolePercents(data.roles);
  const leagues = withOthersBucket(data.leagues);

  // радар
  const radarResp = await fetchPlayerRadar(userId);
  const radarReady =
    Boolean(radarResp?.ready) &&
    Array.isArray(radarResp?.radar) &&
    (radarResp!.radar!.length ?? 0) > 0;
  const radarData = radarResp?.radar ?? [];

  const currentRole = data.currentRoleLast30 || radarResp?.currentRole || "—";

  // --- если таб = stats — тянем статистику
  let stats: ApiStatsResponse | null = null;
  if (tab === "stats") {
    try {
      const statsRes = await fetch(abs(`/api/player-stats/${encodeURIComponent(userId)}`), {
        cache: "no-store",
      });
      if (statsRes.ok) {
        stats = (await statsRes.json()) as ApiStatsResponse;
      }
    } catch {
      stats = null;
    }
  }

  // производные: totals / perMatch (пока только считаем, UI пока показывает totals)
  const statsTotals: ApiStatsTotals | null =
    stats && stats.ok ? stats.totals : null;
  const statsPerMatch: Partial<ApiStatsTotals> | null =
    stats && stats.ok && (stats as any).perMatch
      ? ((stats as any).perMatch as Partial<ApiStatsTotals>)
      : null;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName ? (
          <div className="text-zinc-500 text-sm mt-1">{teamName}</div>
        ) : null}
        <Link href="/players" className="text-blue-600 mt-3 inline-block">
          ← Ко всем игрокам
        </Link>
      </div>

      {/* Верхние плитки */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Матчи</div>
          <div className="text-2xl font-semibold">{matches}</div>
          <div className="text-[11px] text-zinc-400 mt-2">
            *без учета национальных матчей
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Актуальное амплуа</div>
          <div className="text-2xl font-semibold" title="За последние 30 официальных матчей">
            {currentRole}
          </div>
        </div>
      </div>

      {/* Табы */}
      <div className="border-b border-zinc-200 mt-2">
        <nav className="flex gap-4 text-sm">
          <Link
            href={`/players/${userId}`}
            className={`pb-2 ${
              tab === "profile"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Профиль
          </Link>
          <Link
            href={`/players/${userId}?tab=stats`}
            className={`pb-2 ${
              tab === "stats"
                ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Статистика
          </Link>
        </nav>
      </div>

      {tab === "profile" ? (
        <>
          {/* Средняя зона: слева барчарты, справа радар */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
            <RoleDistributionSection
              roles={rolesForChart}
              leagues={leagues}
              tooltip
            />

            <div className="rounded-xl border border-zinc-200 p-4">
              {radarReady ? (
                <PlayerRadar
                  data={radarData.map((r) => ({
                    label: r.label,
                    pct: r.pct ?? 0,
                  }))}
                  footnote="*данные на основании кроссплея с 18 сезона"
                />
              ) : (
                <div className="text-zinc-500 text-sm">
                  Недостаточно матчей на актуальном амплуа (≥ 30), радар
                  недоступен.
                </div>
              )}
            </div>
          </section>

          {/* Тепловая карта */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">
              Тепловая карта амплуа
            </h3>
            <RoleHeatmap data={data.roles as any} />
          </div>
        </>
      ) : (
        // ====== TAB: STATISTICS ======
        <section className="mt-4">
          {!stats || !stats.ok ? (
            <div className="text-sm text-red-600">
              Не удалось загрузить статистику игрока.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Блок Атака */}
              <div className="rounded-xl border border-zinc-200 p-4">
                <h3 className="font-semibold mb-2 text-sm">Атака</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Голы</dt>
                    <dd>{stats.totals.goals}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Голевые передачи</dt>
                    <dd>{stats.totals.assists}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Гол+пас</dt>
                    <dd>{stats.totals.goal_contrib}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>xG (ожидаемые голы)</dt>
                    <dd>{stats.totals.xg.toFixed(1)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Реализация от xG</dt>
                    <dd>{stats.totals.xg_delta.toFixed(1)}</dd>
                  </div>
                  <div className="flex justify между">
                    <dt>Удары</dt>
                    <dd>{stats.totals.shots}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Точность ударов</dt>
                    <dd>
                      {stats.totals.shots_on_target_pct !== null
                        ? (stats.totals.shots_on_target_pct * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Ударов на гол</dt>
                    <dd>
                      {stats.totals.shots_per_goal !== null
                        ? stats.totals.shots_per_goal.toFixed(2)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Блок Созидание / Пасы */}
              <div className="rounded-xl border border-zinc-200 p-4">
                <h3 className="font-semibold mb-2 text-sm">Созидание и пасы</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Важные передачи</dt>
                    <dd>{stats.totals.key_passes}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Предголевые передачи</dt>
                    <dd>{stats.totals.pre_assists}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>xA-передачи (пасы под xG)</dt>
                    <dd>{stats.totals.passes_xa}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Всего пасов</dt>
                    <dd>{stats.totals.allpasses}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Точные пасы</dt>
                    <dd>{stats.totals.completedpasses}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Точность пасов</dt>
                    <dd>
                      {stats.totals.pass_acc !== null
                        ? (stats.totals.pass_acc * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>pXA (пасов на 0.5 xA)</dt>
                    <dd>
                      {stats.totals.pxa !== null
                        ? stats.totals.pxa.toFixed(1)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Блок Дриблинг / удержание мяча */}
              <div className="rounded-xl border border-zinc-200 p-4">
                <h3 className="font-semibold mb-2 text-sm">Дриблинг и удержание</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Обводки</dt>
                    <dd>{stats.totals.allstockes}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Успешные обводки</dt>
                    <dd>{stats.totals.completedstockes}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Успешность дриблинга</dt>
                    <dd>
                      {stats.totals.dribble_pct !== null
                        ? (stats.totals.dribble_pct * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Атак. единоборства</dt>
                    <dd>{stats.totals.off_duels_total}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Выигранные атак. единоборства</dt>
                    <dd>{stats.totals.duels_off_win}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Успешность атак. дуэлей</dt>
                    <dd>
                      {stats.totals.off_duels_win_pct !== null
                        ? (stats.totals.off_duels_win_pct * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Блок Оборона / борьба */}
              <div className="rounded-xl border border-zinc-200 p-4">
                <h3 className="font-semibold mb-2 text-sm">Оборона и борьба</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Перехваты</dt>
                    <dd>{stats.totals.intercepts}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Попытки отбора</dt>
                    <dd>{stats.totals.allselection}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Удачные отборы</dt>
                    <dd>{stats.totals.selection}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>% удачных отборов</dt>
                    <dd>
                      {stats.totals.allselection > 0
                        ? ((stats.totals.selection / stats.totals.allselection) * 100).toFixed(
                            1
                          ) + "%"
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Всего защитных действий</dt>
                    <dd>{stats.totals.def_actions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Beaten Rate</dt>
                    <dd>
                      {stats.totals.beaten_rate !== null
                        ? (stats.totals.beaten_rate * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Воздушные дуэли</dt>
                    <dd>{stats.totals.duels_air}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>% побед в воздухе</dt>
                    <dd>
                      {stats.totals.aerial_pct !== null
                        ? (stats.totals.aerial_pct * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Блок Навесы */}
              <div className="rounded-xl border border-zinc-200 p-4">
                <h3 className="font-semibold mb-2 text-sm">Навесы</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Все навесы</dt>
                    <dd>{stats.totals.allcrosses}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Успешные навесы</dt>
                    <dd>{stats.totals.crosses}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Точность навесов</dt>
                    <dd>
                      {stats.totals.cross_acc !== null
                        ? (stats.totals.cross_acc * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
