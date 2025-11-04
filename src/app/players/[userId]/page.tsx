// src/app/players/[userId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RoleHeatmapFromApi from "@/app/players/_components/RoleHeatmapFromApi";
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import type { RolePercent } from "@/utils/roles";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const getOne = (sp: SearchParams, k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) || "";

function parseRange(range?: string) {
  if (!range) return { fromTs: 0, toTs: 32503680000 };
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
  const range = getOne(searchParams, "range");
  const { fromTs, toTs } = parseRange(range);

  const user = await prisma.$queryRaw<
    { id: number; gamertag: string | null; username: string | null }[]
  >`SELECT id, gamertag, username FROM tbl_users WHERE id = ${userId} LIMIT 1`;
  const title = user[0]?.gamertag || user[0]?.username || `User #${userId}`;

  // Матчи в диапазоне (DISTINCT match_id)
  const played = await prisma.$queryRaw<{ matches: bigint }[]>`
    SELECT COUNT(DISTINCT ums.match_id) AS matches
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    WHERE ums.user_id = ${userId}
      AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
  `;
  const totalMatches = Number(played?.[0]?.matches ?? 0);

  // Актуальное амплуа: последние 30 уникальных матчей -> мода роли
  const last30Mode = await prisma.$queryRaw<{ role_code: string; cnt: bigint }[]>`
    WITH last_matches AS (
      SELECT DISTINCT ums.match_id, tm.timestamp
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      ORDER BY tm.timestamp DESC
      LIMIT 30
    ),
    per_match_roles AS (
      SELECT lm.match_id,
             COALESCE(fp.code, sp.short_name) AS role_code,
             COUNT(*) AS freq
      FROM last_matches lm
      JOIN tbl_users_match_stats ums ON ums.match_id = lm.match_id AND ums.user_id = ${userId}
      JOIN skills_positions sp ON sp.id = ums.skill_id
      LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
      GROUP BY lm.match_id, COALESCE(fp.code, sp.short_name)
    ),
    pick_role AS (
      SELECT pmr.match_id, pmr.role_code
      FROM per_match_roles pmr
      JOIN (
        SELECT match_id, MAX(freq) AS m
        FROM per_match_roles
        GROUP BY match_id
      ) mx ON mx.match_id = pmr.match_id AND mx.m = pmr.freq
      GROUP BY pmr.match_id, pmr.role_code
    )
    SELECT role_code, COUNT(*) AS cnt
    FROM pick_role
    GROUP BY role_code
    ORDER BY cnt DESC
    LIMIT 1
  `;
  const currentRole = last30Mode[0]?.role_code || "—";

  // Распределение ролей в диапазоне
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

  // Распределение по лигам
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
  const Lraw = leaguesAgg[0] || { total: 0n, pl: 0n, fnl: 0n, pfl: 0n, lfl: 0n };
  const totalL = Number(Lraw.total) || 1;
  const leagues = [
    { label: "ПЛ",  percent: Math.round((Number(Lraw.pl)  * 100) / totalL) },
    { label: "ФНЛ", percent: Math.round((Number(Lraw.fnl) * 100) / totalL) },
    { label: "ПФЛ", percent: Math.round((Number(Lraw.pfl) * 100) / totalL) },
    { label: "ЛФЛ", percent: Math.round((Number(Lraw.lfl) * 100) / totalL) },
  ].filter(x => x.percent > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="mt-2">
            <DateRangeFilter initialRange={range || ""} />
          </div>
        </div>
        <Link href="/players" className="text-blue-600 hover:underline text-sm">
          ← Ко всем игрокам
        </Link>
      </div>

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

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[700px]">
        <RoleDistributionSection
          roles={rolePercents}
          leagues={leagues}
          widthPx={500}
          tooltip
        />
      </section>

      <section className="md:max-w-[700px]">
        <h3 className="font-semibold mb-2">Тепловая карта амплуа</h3>
        <div style={{ width: 500, height: 700 }}>
          <RoleHeatmapFromApi userId={userId} range={range || ''} />
        </div>
      </section>
    </div>
  );
}
