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
  goals: string;
  assists: string;
  goal_contrib: string;
  xg: string;
  xg_delta: string;
  shots: string;
  shots_on_target_pct: string;
  shots_per_goal: string;
  passes_xa: string;
  key_passes: string;
  pre_assists: string;
  allpasses: string;
  completedpasses: string;
  pass_acc: string;
  pxa: string;
  allstockes: string;
  completedstockes: string;
  dribble_pct: string;
  intercepts: string;
  selection: string;
  completedtackles: string;
  blocks: string;
  allselection: string;
  def_actions: string;
  beaten_rate: string;
  outs: string;
  duels_air: string;
  duels_air_win: string;
  aerial_pct: string;
  duels_off_win: string;
  duels_off_lose: string;
  off_duels_total: string;
  off_duels_win_pct: string;
  crosses: string;
  allcrosses: string;
  cross_acc: string;
};

type ApiStatsResponse = {
  ok: boolean;
  userId: number;
  matches: number;
  totals: ApiStatsTotals;
  // perMatch прилетает, но типизировать жёстко не обязательно
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
  searchParams?: { tab?: string; scope?: string };
}) {
  const userId = params.userId;
  const tab = searchParams?.tab === "stats" ? "stats" : "profile";
  const scope = searchParams?.scope === "all" ? "all" : "recent";

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
      const statsRes = await fetch(
      abs(
        `/api/player-stats/${encodeURIComponent(userId)}?scope=${scope}`,
      ),
      { cache: "no-store" },
    );
      if (statsRes.ok) {
        stats = (await statsRes.json()) as ApiStatsResponse;
      }
    } catch {
      stats = null;
    }
  }

  // подготовка totals/perMatch для удобства
  let statsTotals: ApiStatsTotals | null = null;
  let statsPerMatch: any = null;
  if (stats && stats.ok) {
    statsTotals = stats.totals;
    statsPerMatch = (stats as any).perMatch ?? null;
  }

  const formatPerMatch = (v: any, digits = 2) => {
    if (v === null || v === undefined) return null;
    const num = Number(v);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(digits);
  };

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
          <div
            className="text-2xl font-semibold"
            title="За последние 30 официальных матчей"
          >
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
            href={`/players/${userId}?tab=stats&scope=${scope}`}
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
            <RoleDistributionSection roles={rolesForChart} leagues={leagues} tooltip />

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
                  Недостаточно матчей на актуальном амплуа (≥ 30), радар недоступен.
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
          {!statsTotals ? (
            <div className="text-sm text-red-600">
              Не удалось загрузить статистику игрока.
            </div>
          ) : (
            <>
              {/* Переключатель периода */}
              <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
                <span className="mr-1">Период:</span>
                <Link
                  href={`/players/${userId}?tab=stats&scope=from18`}
                  className={`px-2 py-1 rounded-full border text-xs ${
                    scope === "from18"
                      ? "border-blue-600 text-blue-600 bg-blue-50"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  С 18 сезона
                </Link>
                <Link
                  href={`/players/${userId}?tab=stats&scope=career`}
                  className={`px-2 py-1 rounded-full border text-xs ${
                    scope === "career"
                      ? "border-blue-600 text-blue-600 bg-blue-50"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  За всю карьеру
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Блок Атака */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <h3 className="font-semibold mb-2 text-sm">Атака</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Голы</dt>
                      <dd className="text-right">
                        <span>{statsTotals.goals}</span>
                        {statsPerMatch?.goals != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.goals, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Голевые передачи</dt>
                      <dd className="text-right">
                        <span>{statsTotals.assists}</span>
                        {statsPerMatch?.assists != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.assists, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Гол+пас</dt>
                      <dd className="text-right">
                        <span>{statsTotals.goal_contrib}</span>
                        {statsPerMatch?.goal_contrib != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.goal_contrib, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>xG (ожидаемые голы)</dt>
                      <dd className="text-right">
                        <span>{Number(statsTotals.xg).toFixed(1)}</span>
                        {statsPerMatch?.xg != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.xg, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify_between">
                      <dt>Реализация от xG</dt>
                      <dd>{Number(statsTotals.xg_delta).toFixed(1)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Удары</dt>
                      <dd className="text-right">
                        <span>{statsTotals.shots}</span>
                        {statsPerMatch?.shots != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.shots, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Точность ударов</dt>
                      <dd>
                        {(Number(statsTotals.shots_on_target_pct) * 100).toFixed(1)}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Ударов на гол</dt>
                      <dd>{Number(statsTotals.shots_per_goal).toFixed(2)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Блок Созидание / Пасы */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <h3 className="font-semibold mb-2 text-sm">Созидание и пасы</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Важные передачи</dt>
                      <dd className="text-right">
                        <span>{statsTotals.key_passes}</span>
                        {statsPerMatch?.key_passes != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.key_passes, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Предголевые передачи</dt>
                      <dd className="text-right">
                        <span>{statsTotals.pre_assists}</span>
                        {statsPerMatch?.pre_assists != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.pre_assists, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>xA(ожидаемые голевые)</dt>
                      <dd className="text-right">
                        <span>{statsTotals.passes_xa}</span>
                        {statsPerMatch?.passes_xa != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.passes_xa, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Всего пасов</dt>
                      <dd className="text-right">
                        <span>{statsTotals.allpasses}</span>
                        {statsPerMatch?.allpasses != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.allpasses, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Точные пасы</dt>
                      <dd className="text-right">
                        <span>{statsTotals.completedpasses}</span>
                        {statsPerMatch?.completedpasses != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.completedpasses, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Точность пасов</dt>
                      <dd>
                        {(Number(statsTotals.pass_acc) * 100).toFixed(1)}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>pXA</dt>
                      <dd>{Number(statsTotals.pxa).toFixed(1)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Блок Дриблинг / удержание мяча */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <h3 className="font-semibold mb-2 text-sm">
                    Дриблинг и удержание
                  </h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Обводки</dt>
                      <dd className="text-right">
                        <span>{statsTotals.allstockes}</span>
                        {statsPerMatch?.allstockes != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.allstockes, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешные обводки</dt>
                      <dd className="text-right">
                        <span>{statsTotals.completedstockes}</span>
                        {statsPerMatch?.completedstockes != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.completedstockes, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешность дриблинга</dt>
                      <dd>
                        {(Number(statsTotals.dribble_pct) * 100).toFixed(1)}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Атак. единоборства</dt>
                      <dd className="text-right">
                        <span>{statsTotals.off_duels_total}</span>
                        {statsPerMatch?.off_duels_total != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.off_duels_total, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Выигранные атак. единоборства</dt>
                      <dd className="text-right">
                        <span>{statsTotals.duels_off_win}</span>
                        {statsPerMatch?.duels_off_win != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.duels_off_win, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешность атак. дуэлей</dt>
                      <dd>
                        {(Number(statsTotals.off_duels_win_pct) * 100).toFixed(1)}%
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
                      <dd className="text-right">
                        <span>{statsTotals.intercepts}</span>
                        {statsPerMatch?.intercepts != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.intercepts, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Попытки отбора</dt>
                      <dd className="text-right">
                        <span>{statsTotals.allselection}</span>
                        {statsPerMatch?.allselection != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.allselection, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Удачные отборы</dt>
                      <dd className="text-right">
                        <span>{statsTotals.selection}</span>
                        {statsPerMatch?.selection != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.selection, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>% удачных отборов</dt>
                      <dd>
                        {(
                          (Number(statsTotals.selection) /
                            Math.max(1, Number(statsTotals.allselection))) *
                          100
                        ).toFixed(1)}
                        %
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Всего защитных действий</dt>
                      <dd className="text-right">
                        <span>{statsTotals.def_actions}</span>
                        {statsPerMatch?.def_actions != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.def_actions, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Beaten Rate</dt>
                      <dd>
                        {statsTotals.beaten_rate != null
                          ? `${(
                              Number(statsTotals.beaten_rate) * 100
                            ).toFixed(1)}%`
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Воздушные дуэли</dt>
                      <dd className="text-right">
                        <span>{statsTotals.duels_air}</span>
                        {statsPerMatch?.duels_air != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.duels_air, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>% побед в воздухе</dt>
                      <dd>
                        {(Number(statsTotals.aerial_pct) * 100).toFixed(1)}%
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
                      <dd className="text-right">
                        <span>{statsTotals.allcrosses}</span>
                        {statsPerMatch?.allcrosses != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.allcrosses, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешные навесы</dt>
                      <dd className="text-right">
                        <span>{statsTotals.crosses}</span>
                        {statsPerMatch?.crosses != null && (
                          <span className="text-xs text-zinc-500 ml-2">
                            ({formatPerMatch(statsPerMatch.crosses, 2)} за матч)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Точность навесов</dt>
                      <dd>
                        {(Number(statsTotals.cross_acc) * 100).toFixed(1)}%
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
