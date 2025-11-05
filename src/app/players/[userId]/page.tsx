// src/app/players/[userId]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";

// ---------- типы ответа API ----------
type ApiRole = { role: string; percent: number };
type ApiLeague = { code: string; pct: number }; // ожидалось ранее
type ApiResponse = {
  ok: boolean;
  matches: number;
  currentRole?: string | null;
  roles: ApiRole[];
  leagues?: ApiLeague[];
  nickname?: string | null;
  teamName?: string | null;
};

// ---------- утилиты ----------
const BASE =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3000");

const abs = (path: string) => new URL(path, BASE).toString();

const safeNum = (v: unknown, d = 0) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
};

// сгруппировать роли в большие блоки + вернуть для тепловой/барчартов
function groupRolePercents(roles: ApiRole[]) {
  // группы как у тебя в lib/utils
  const GROUPS: Record<string, string[]> = {
    "Форвард": ["ЛФД", "ЦФД", "ПФД", "ФРВ"],
    "Атакующий полузащитник": ["ЛАП", "ЦАП", "ПАП"],
    "Крайний полузащитник": ["ЛП", "ПП"],
    "Центральный полузащитник": ["ЛЦП", "ЦП", "ПЦП", "ЛОП", "ПОП", "ЦОП"],
    "Крайний защитник": ["ЛЗ", "ПЗ"],
    "Центральный защитник": ["ЦЗ", "ЛЦЗ", "ПЦЗ"],
    "Вратарь": ["ВРТ"],
  };

  const dict = Object.entries(GROUPS).map(([label, codes]) => {
    const pct = roles
      .filter((r) => codes.includes(r.role))
      .reduce((s, r) => s + safeNum(r.percent), 0);
    return { label, value: pct };
  });

  return dict;
}

// бакеты лиг: ПЛ / ФНЛ / ПФЛ / ЛФЛ / Прочие
function makeLeagueBuckets(leagues?: ApiLeague[]) {
  if (!leagues || !leagues.length) return [];
  const map: Record<string, number> = { ПЛ: 0, ФНЛ: 0, ПФЛ: 0, ЛФЛ: 0, Прочие: 0 };

  for (const l of leagues) {
    const code = (l.code || "").toUpperCase();
    const pct = safeNum(l.pct);
    if (code === "ПЛ" || code === "ФНЛ" || code === "ПФЛ" || code === "ЛФЛ") {
      map[code] += pct;
    } else {
      map["Прочие"] += pct;
    }
  }

  return [
    { label: "ПЛ", pct: map["ПЛ"] },
    { label: "ФНЛ", pct: map["ФНЛ"] },
    { label: "ПФЛ", pct: map["ПФЛ"] },
    { label: "ЛФЛ", pct: map["ЛФЛ"] },
    { label: "Прочие", pct: map["Прочие"] },
  ];
}

// ---------- страница ----------
type Params = { userId: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Игрок #${params.userId} — Virtual Football Stats` };
}

export default async function PlayerPage({ params }: { params: Params }) {
  const userId = params.userId;

  // абсолютный URL + верное имя параметра userId (camelCase!)
  const url = abs(`/api/player-roles?userId=${encodeURIComponent(userId)}`);

  // server fetch
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold">{`User #${userId}`}</h1>
        <p className="text-red-600 mt-4">
          Ошибка загрузки: {res.status} {res.statusText}
        </p>
        <Link href="/players" className="text-blue-600 mt-4 inline-block">
          ← Ко всем игрокам
        </Link>
      </div>
    );
  }

  const data: ApiResponse = await res.json();

  const nickname = data.nickname || `User #${userId}`;
  const team = data.teamName || "";
  const matches = safeNum(data.matches);
  const currentRole = data.currentRole || "—";

  const roleGroups = groupRolePercents(data.roles);
  const leagues = makeLeagueBuckets(data.leagues);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* хлебные крошки/название */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {team ? <div className="text-zinc-500 text-sm mt-1">{team}</div> : null}
        <Link href="/players" className="text-blue-600 mt-3 inline-block">
          ← Ко всем игрокам
        </Link>
      </div>

      {/* верхние плитки */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 p-4">
          <div className="text-sm text-zinc-500 mb-1">Матчи</div>
          <div className="text-2xl font-semibold">{matches}</div>
          <div className="text-[11px] text-zinc-400 mt-2">*без учета национальных матчей</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <div className="text-sm text-zinc-500 mb-1">Актуальное амплуа</div>
          <div className="text-2xl font-semibold" title="За последние 30 матчей">
            {currentRole}
          </div>
        </div>
      </div>

      {/* распределения: амплуа и лиги — в одном ряду */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection
          roles={roleGroups} // [{label, value}]
          leagues={leagues}  // [{label, pct}]
          tooltip
        />
      </section>

      {/* тепловая карта амплуа */}
      <div>
        <h3 className="text-sm font-medium text-zinc-700 mb-3">Тепловая карта амплуа</h3>
        {/* Компонент использует свои источники (как раньше). Пропсы не передаем. */}
        <RoleHeatmap />
      </div>
    </div>
  );
}
