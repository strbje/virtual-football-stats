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
type ApiResponse = {
  ok: boolean;
  matches: number;
  currentRoleLast30?: string | null;
  roles: ApiRole[];
  leagues?: ApiLeague[];
  user?: { nickname?: string | null; team?: string | null } | null;
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
    "Форвард": ["ЛФД", "ЦФД", "ПФД", "ФРВ"],
    "Атакующий полузащитник": ["ЛАП", "ЦАП", "ПАП"],
    "Крайний полузащитник": ["ЛП", "ПП"],
    "Центральный полузащитник": ["ЛЦП", "ЦП", "ПЦП", "ЛОП", "ПОП", "ЦОП"],
    "Крайний защитник": ["ЛЗ", "ПЗ"],
    "Центральный защитник": ["ЦЗ", "ЛЦЗ", "ПЦЗ"],
    "Вратарь": ["ВРТ"],
  };

  return Object.entries(GROUPS).map(([label, codes]) => {
    const pct = roles.filter(r => codes.includes(r.role)).reduce((s, r) => s + n(r.percent), 0);
    return { label, value: pct };
  });
}

// ---------- Leagues + “Прочие” ----------
function withOthersBucket(leagues?: ApiLeague[]) {
  const list = Array.isArray(leagues) ? leagues.slice() : [];
  const sum = list.reduce((s, l) => s + n(l.pct), 0);
  const others = sum >= 0 && sum <= 100 ? Math.max(0, 100 - sum) : 0;

  // гарантируем базовые ярлыки
  const need = new Map<string, number>([
    ["ПЛ", 0],
    ["ФНЛ", 0],
    ["ПФЛ", 0],
    ["ЛФЛ", 0],
  ]);
  for (const l of list) if (need.has(l.label)) need.delete(l.label);
  for (const [label, pct] of need) list.push({ label, pct });

  // добавляем «Прочие» и сортируем фиксированно
  list.push({ label: "Прочие", pct: others });
  const ORDER = ["ПЛ", "ФНЛ", "ПФЛ", "ЛФЛ", "Прочие"];
  list.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  return list;
}

// ---------- Radar fetch ----------
async function buildBaseURL() {
  const h = await headers(); // в app-route это Promise
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Игрок #${params.userId} — Virtual Football Stats` };
}

export default async function PlayerPage({ params }: { params: Params }) {
  const userId = params.userId;

  // основной API
  const url = abs(`/api/player-roles?userId=${encodeURIComponent(userId)}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold">{`User #${userId}`}</h1>
        <p className="text-red-600 mt-4">Ошибка загрузки: {res.status} {res.statusText}</p>
        <Link href="/players" className="text-blue-600 mt-3 inline-block">← Ко всем игрокам</Link>
      </div>
    );
  }

  const data: ApiResponse = await res.json();

  // шапка
  const nickname = (data.user?.nickname ?? `User #${userId}`) as string;
  const teamName = (data.user?.team ?? "") as string;
  const matches = n(data.matches);

  // барчарты
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

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName ? <div className="text-zinc-500 text-sm mt-1">{teamName}</div> : null}
        <Link href="/players" className="text-blue-600 mt-3 inline-block">← Ко всем игрокам</Link>
      </div>

      {/* Верхние плитки */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Матчи</div>
          <div className="text-2xl font-semibold">{matches}</div>
          <div className="text-[11px] text-zinc-400 mt-2">*без учета национальных матчей</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 min-h-[80px] flex flex-col justify-center">
          <div className="text-sm text-zinc-500 mb-1">Актуальное амплуа</div>
          <div className="text-2xl font-semibold" title="За последние 30 матчей">
            {currentRole}
          </div>
        </div>
      </div>

      {/* Средняя зона: слева барчарты, справа радар */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        {/* Левая колонка — распределения */}
        <RoleDistributionSection roles={rolesForChart} leagues={leagues} tooltip />

        {/* Правая колонка — радар */}
        <div className="rounded-xl border border-zinc-200 p-4">
          {radarReady ? (
            <PlayerRadar
              data={radarData.map(r => ({ label: r.label, pct: r.pct ?? 0 }))}
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
        <h3 className="text-sm font-semibold text-zinc-800 mb-3">Тепловая карта амплуа</h3>
        <RoleHeatmap data={data.roles as any} />
      </div>
    </div>
  );
}
