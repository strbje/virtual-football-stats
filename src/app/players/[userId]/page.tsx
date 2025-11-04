// src/app/players/[userId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RoleHeatmapFromApi from "@/app/players/_components/RoleHeatmapFromApi";
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import type { RolePercent } from "@/utils/roles";
import { ROLE_LABELS } from "@/utils/roles";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getOne(sp: SearchParams, k: string) {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v ?? "";
}

function parseRange(range?: string) {
  if (!range) return { fromTs: 0, toTs: 32503680000 }; // до 01.01.3000
  const [a, b] = range.split(":");
  const fromTs = a ? Math.floor(new Date(`${a} 00:00:00`).getTime() / 1000) : 0;
  const toTs = b ? Math.floor(new Date(`${b} 23:59:59`).getTime() / 1000) : 32503680000;
  return { fromTs, toTs };
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: SearchParams;
}) {
  const userId = Number(params.userId);
  if (!Number.isFinite(userId)) return <div className="p-6">Неверный ID</div>;

  const rangeParam = getOne(searchParams, "range");
  const { fromTs, toTs } = parseRange(rangeParam);

  // --- Игрок (заголовок)
  const user = await prisma.$queryRaw<
    { id: number; gamertag: string | null; username: string | null }[]
  >`
    SELECT u.id, u.gamertag, u.username
    FROM tbl_users u
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  const title = user[0]?.gamertag || user[0]?.username || `User #${userId}`;

  // --- Матчи игрока = DISTINCT match_id
  const played = await prisma.$queryRaw<{ matches: bigint }[]>`
    SELECT COUNT(DISTINCT ums.match_id) AS matches
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    WHERE ums.user_id = ${userId}
      AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
  `;
  const totalMatches = Number(played?.[0]?.matches ?? 0);

  // --- Последние 30 уникальных матчей и актуальное амплуа (мода)
  const last30 = await prisma.$queryRaw<
    { match_id: number; ts: number; role_code: string | null }[]
  >`
    WITH uniq AS (
      SELECT DISTINCT ums.match_id, tm.timestamp AS ts
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      ORDER BY tm.timestamp DESC
      LIMIT 30
    )
    SELECT u.match_id,
           u.ts,
           COALESCE(fp.code, sp.short_name) AS role_code
    FROM uniq u
    JOIN tbl_users_match_stats ums ON ums.match_id = u.match_id AND ums.user_id = ${userId}
    JOIN skills_positions sp ON sp.id = ums.skill_id
    LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
  `;
  const roleCounts = new Map<string, number>();
  for (const r of last30) {
    const key = r.role_code ?? "—";
    roleCounts.set(key, (roleCounts.get(key) ?? 0) + 1);
  }
  let currentRole = "—";
  let maxCnt = -1;
  for (const [k, v] of roleCounts) {
    if (v > maxCnt) {
      maxCnt = v;
      currentRole = k;
    }
  }

  // --- Распределение ролей (проценты по DISTINCT match_id)
  const roleRows = await prisma.$queryRaw<{ role: string; cnt: bigint }[]>`
    SELECT COALESCE(fp.code, sp.short_name) AS role,
           COUNT(DISTINCT ums.match_id)     AS cnt
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm         ON tm.id = ums.match_id
    JOIN skills_positions  sp        ON sp.id = ums.skill_id
    LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
    WHERE ums.user_id = ${userId}
      AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
    GROUP BY COALESCE(fp.code, sp.short_name)
    ORDER BY cnt DESC
  `;
  const rolesTotal = roleRows.reduce((s, r) => s + Number(r.cnt), 0) || 1;
  const rolePercents: RolePercent[] = roleRows.map((r) => ({
    role: r.role as RolePercent["role"],
    percent: Math.round((Number(r.cnt) * 100) / rolesTotal),
  }));

  // 🟢 Преобразуем RolePercent[] -> RoleItem[] ({label, value}) для RoleDistributionSection
  const roleItems = rolePercents.map((r) => ({
    label: ROLE_LABELS[r.role] ?? r.role,
    value: r.percent,
  }));

  // --- Распределение по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ) — проценты по DISTINCT match_id
  const leaguesAgg = await prisma.$queryRaw<
    { total: bigint; pl: bigint; fnl: bigint; pfl: bigint; lfl: bigint }[]
  >`
    SELECT
      COUNT(DISTINCT ums.match_id) AS total,
      COUNT(DISTINCT CASE
        WHEN (LOWER(t.name) LIKE '%премьер%' OR UPPER(t.name) LIKE '%ПЛ%')
        THEN ums.match_id END) AS pl,
      COUNT(DISTINCT CASE WHEN UPPER(t.name) LIKE '%ФНЛ%' THEN ums.match_id END) AS fnl,
      COUNT(DISTINCT CASE WHEN UPPER(t.name) LIKE '%ПФЛ%' THEN ums.match_id END) AS pfl,
      COUNT(DISTINCT CASE WHEN UPPER(t.name) LIKE '%ЛФЛ%' THEN ums.match_id END) AS lfl
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t        ON t.id  = tm.tournament_id
    WHERE ums.user_id = ${userId}
      AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
  `;
  const Lraw = leaguesAgg[0];
  const L = {
    total: Number(Lraw?.total ?? 0),
    pl: Number(Lraw?.pl ?? 0),
    fnl: Number(Lraw?.fnl ?? 0),
    pfl: Number(Lraw?.pfl ?? 0),
    lfl: Number(Lraw?.lfl ?? 0),
  };
  const leaguesTotal = Math.max(1, L.total);
  const leagues = [
    { label: "ПЛ", percent: Math.round((L.pl * 100) / leaguesTotal) },
    { label: "ФНЛ", percent: Math.round((L.fnl * 100) / leaguesTotal) },
    { label: "ПФЛ", percent: Math.round((L.pfl * 100) / leaguesTotal) },
    { label: "ЛФЛ", percent: Math.round((L.lfl * 100) / leaguesTotal) },
  ].filter((x) => x.percent > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="mt-2">
            <DateRangeFilter initialRange={rangeParam || ""} />
          </div>
        </div>
        <Link href="/players" className="text-blue-600 hover:underline text-sm">
          ← Ко всем игрокам
        </Link>
      </div>

      {/* Плитки */}
      <section className="grid grid-cols-2 gap-4 md:max-w-[700px]">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Матчи</div>
          <div className="text-2xl font-semibold">{totalMatches}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">
            Актуальное амплуа <span title="За последние 30 уникальных матчей">ℹ️</span>
          </div>
          <div className="text-2xl font-semibold">{currentRole}</div>
        </div>
      </section>

      {/* Два бара шириной как теплокарта */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[700px]">
        <RoleDistributionSection
          roles={roleItems}          // <-- здесь уже {label,value}
          leagues={leagues}
          widthPx={500}              // совпадает с шириной теплокарты
          tooltip
        />
      </section>

      {/* Теплокарта 500x700 */}
      <section className="md:max-w-[700px]">
        <h3 className="font-semibold mb-2">Тепловая карта амплуа</h3>
        <div style={{ width: 500, height: 700 }}>
          <RoleHeatmapFromApi userId={userId} />
        </div>
      </section>
    </div>
  );
}
