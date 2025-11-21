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
  perMatch?: Partial<ApiStatsTotals>;
  scope?: "recent" | "all";
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
          `/api/player-stats/${encodeURIComponent(
            userId
          )}?scope=${scope === "all" ? "all" : "recent"}`
        ),
        { cache: "no-store" }
      );
      if (statsRes.ok) {
        stats = (await statsRes.json()) as ApiStatsResponse;
      }
    } catch {
      stats = null;
    }
  }

  const statsTotals: ApiStatsTotals | null =
    stats && stats.ok ? stats.totals : null;
  const statsPerMatch: Partial<ApiStatsTotals> | null =
    stats && stats.ok && (stats as any).perMatch
      ? ((stats as any).perMatch as Partial<ApiStatsTotals>)
      : null;

  // хелпер: показать "итого (X за матч)"
  const withPerMatch = (
    total: string | number | undefined,
    perMatch?: string | number | null
  ) => {
    const totalNum = total ?? "";
    if (perMatch === undefined || perMatch === null) return totalNum;
    const v = Number(perMatch);
    if (!Number.isFinite(v)) return totalNum;
    return (
      <>
        {totalNum}{" "}
        <span className="text-[11px] text-zinc-500">
          ({v.toFixed(2)} за матч)
        </span>
      </>
    );
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
          {!stats || !stats.ok || !statsTotals ? (
            <div className="text-sm text-red-600">
              Не удалось загрузить статистику игрока.
            </div>
          ) : (
            <>
              {/* Переключатель периода */}
              <div className="mb-3 flex gap-3 text-xs text-zinc-600">
                <span className="mt-[2px]">Период:</span>
                <Link
                  href={`/players/${userId}?tab=stats`}
                  className={
                    scope === "recent"
                      ? "px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                      : "px-2 py-1 rounded-full hover:bg-zinc-100"
                  }
                >
                  С&nbsp;18 сезона
                </Link>
                <Link
                  href={`/players/${userId}?tab=stats&scope=all`}
                  className={
                    scope === "all"
                      ? "px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                      : "px-2 py-1 rounded-full hover:bg-zinc-100"
                  }
                >
                  За&nbsp;всю карьеру
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Блок Атака */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <h3 className="font-semibold mb-2 text-sm">Атака</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Голы</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.goals,
                          statsPerMatch?.goals
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Голевые передачи</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.assists,
                          statsPerMatch?.assists
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Гол+пас</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.goal_contrib,
                          statsPerMatch?.goal_contrib
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>xG (ожидаемые голы)</dt>
                      <dd>
                        {withPerMatch(
                          Number(statsTotals.xg).toFixed(1),
                          statsPerMatch?.xg
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Реализация от xG</dt>
                      <dd>{Number(statsTotals.xg_delta).toFixed(1)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Удары</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.shots,
                          statsPerMatch?.shots
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Точность ударов</dt>
                      <dd>
                        {(Number(statsTotals.shots_on_target_pct) * 100).toFixed(
                          1
                        )}
                        %
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Ударов на гол</dt>
                      <dd>
                        {Number(statsTotals.shots_per_goal).toFixed(2)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Блок Созидание / Пасы */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <h3 className="font-semibold mb-2 text-sm">
                    Созидание и пасы
                  </h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Важные передачи</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.key_passes,
                          statsPerMatch?.key_passes
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Предголевые передачи</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.pre_assists,
                          statsPerMatch?.pre_assists
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>xA-передачи (пасы под xG)</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.passes_xa,
                          statsPerMatch?.passes_xa
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Всего пасов</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.allpasses,
                          statsPerMatch?.allpasses
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Точные пасы</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.completedpasses,
                          statsPerMatch?.completedpasses
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
                      <dt>pXA (пасов на 0.5 xA)</dt>
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
                      <dd>
                        {withPerMatch(
                          statsTotals.allstockes,
                          statsPerMatch?.allstockes
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешные обводки</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.completedstockes,
                          statsPerMatch?.completedstockes
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
                      <dd>
                        {withPerMatch(
                          statsTotals.off_duels_total,
                          statsPerMatch?.off_duels_total
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Выигранные атак. единоборства</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.duels_off_win,
                          statsPerMatch?.duels_off_win
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешность атак. дуэлей</dt>
                      <dd>
                        {(Number(statsTotals.off_duels_win_pct) * 100).toFixed(
                          1
                        )}
                        %
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Блок Оборона / борьба */}
                <div className="rounded-xl border border-zinc-200 p-4">
                  <h3 className="font-semibold mb-2 text-sm">
                    Оборона и борьба
                  </h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Перехваты</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.intercepts,
                          statsPerMatch?.intercepts
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Попытки отбора</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.allselection,
                          statsPerMatch?.allselection
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Удачные отборы</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.selection,
                          statsPerMatch?.selection
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>% удачных отборов</dt>
                      <dd>
                        {(
                          (Number(statsTotals.selection) /
                            Math.max(
                              1,
                              Number(statsTotals.allselection)
                            )) *
                          100
                        ).toFixed(1)}
                        %
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Всего защитных действий</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.def_actions,
                          statsPerMatch?.def_actions
                        )}
                      </dd>
                    </div>
                    <div className="flex justify_between">
                      <dt>Beaten Rate</dt>
                      <dd>
                        {(Number(statsTotals.beaten_rate) * 100).toFixed(1)}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Воздушные дуэли</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.duels_air,
                          statsPerMatch?.duels_air
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
                      <dd>
                        {withPerMatch(
                          statsTotals.allcrosses,
                          statsPerMatch?.allcrosses
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Успешные навесы</dt>
                      <dd>
                        {withPerMatch(
                          statsTotals.crosses,
                          statsPerMatch?.crosses
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
