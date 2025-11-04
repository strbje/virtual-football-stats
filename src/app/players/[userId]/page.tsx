// src/app/players/[userId]/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RoleHeatmapFromApi from "@/app/players/_components/RoleHeatmapFromApi";
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import type { RolePercent } from "@/utils/roles";

export const dynamic = "force-dynamic";

type SearchParamsDict = Record<string, string | string[] | undefined>;

function getVal(d: SearchParamsDict, k: string): string {
  const v = d[k];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function parseRange(range?: string): { fromTs: number; toTs: number } {
  if (!range) return { fromTs: 0, toTs: 32503680000 }; // до 3000 года
  const [start, end] = range.split(":").map((s) => s?.trim()).filter(Boolean);
  const fromTs = start ? Math.floor(new Date(`${start} 00:00:00`).getTime() / 1000) : 0;
  const toTs = end ? Math.floor(new Date(`${end} 23:59:59`).getTime() / 1000) : 32503680000;
  return { fromTs, toTs };
}

export default async function PlayerPage(props: any) {
  const params = (props?.params ?? {}) as { userId?: string };
  const searchParams = (props?.searchParams ?? {}) as SearchParamsDict;

  const userIdStr = params.userId ?? "";
  const userId = Number(userIdStr);
  if (!Number.isFinite(userId)) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Неверный ID игрока</h1>
        <Link href="/players" className="text-blue-600 hover:underline">← Вернуться к списку игроков</Link>
      </div>
    );
  }

  const range = getVal(searchParams, "range");
  const { fromTs, toTs } = parseRange(range);

  // 1) Игрок
  const user = await prisma.$queryRaw<
    { id: number; gamertag: string | null; username: string | null }[]
  >`SELECT u.id, u.gamertag, u.username
     FROM tbl_users u
     WHERE u.id = ${userId}
     LIMIT 1`;
  if (!user.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Игрок не найден</h1>
        <Link href="/players" className="text-blue-600 hover:underline">← Вернуться к списку игроков</Link>
      </div>
    );
  }

  // 2) Матчи (тот же источник, что бары/теплокарта)
  const matchesRow = await prisma.$queryRaw<{ matches: bigint }[]>`
    SELECT COUNT(*) AS matches
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    WHERE ums.user_id = ${userId} AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
  `;
  const totalMatches = Number(matchesRow?.[0]?.matches ?? 0);

  // 3) «Актуальное амплуа» — мода по последним 30 матчам
  const currentRoleRow = await prisma.$queryRaw<{ role: string | null }[]>`
    WITH last30 AS (
      SELECT ums.match_id, tm.timestamp,
             COALESCE(fp.code, sp.short_name) AS role_code
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm         ON tm.id = ums.match_id
      JOIN skills_positions  sp        ON sp.id = ums.skill_id
      LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      ORDER BY tm.timestamp DESC
      LIMIT 30
    )
    SELECT role_code AS role
    FROM last30
    GROUP BY role_code
    ORDER BY COUNT(*) DESC, MAX(timestamp) DESC
    LIMIT 1
  `;
  const currentRole = currentRoleRow?.[0]?.role ?? "—";

  // 4) Распределение по амплуа
  const rolesRows = await prisma.$queryRaw<{ role: string; cnt: bigint }[]>`
    SELECT COALESCE(fp.code, sp.short_name) AS role, COUNT(*) AS cnt
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm         ON tm.id = ums.match_id
    JOIN skills_positions  sp        ON sp.id = ums.skill_id
    LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
    WHERE ums.user_id = ${userId}
      AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
    GROUP BY COALESCE(fp.code, sp.short_name)
    ORDER BY cnt DESC
  `;
  const rolesTotal = rolesRows.reduce((s, r) => s + Number(r.cnt), 0) || 1;
  const rolePercents: RolePercent[] = rolesRows
    .map((r) => ({
      role: r.role as RolePercent["role"],
      percent: Math.round((Number(r.cnt) * 100) / rolesTotal),
    }))
    .filter((x) => x.percent > 0);

  // 5) Распределение по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ)
  const leaguesRow = await prisma.$queryRaw<
    { total: bigint; pl: bigint; fnl: bigint; pfl: bigint; lfl: bigint }[]
  >`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(t.name) LIKE '%премьер%' OR UPPER(t.name) LIKE '%ПЛ%'  THEN 1 ELSE 0 END) AS pl,
      SUM(CASE WHEN UPPER(t.name) LIKE '%ФНЛ%'                                     THEN 1 ELSE 0 END) AS fnl,
      SUM(CASE WHEN UPPER(t.name) LIKE '%ПФЛ%'                                     THEN 1 ELSE 0 END) AS pfl,
      SUM(CASE WHEN UPPER(t.name) LIKE '%ЛФЛ%'                                     THEN 1 ELSE 0 END) AS lfl
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t        ON t.id  = tm.tournament_id
    WHERE ums.user_id = ${userId}
      AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
  `;
  const L = leaguesRow?.[0];
  const leaguesTotal = Math.max(1, Number(L?.total ?? 0));
  const leagues = [
    { label: "ПЛ",  percent: Math.round((Number(L?.pl  ?? 0) * 100) / leaguesTotal) },
    { label: "ФНЛ", percent: Math.round((Number(L?.fnl ?? 0) * 100) / leaguesTotal) },
    { label: "ПФЛ", percent: Math.round((Number(L?.pfl ?? 0) * 100) / leaguesTotal) },
    { label: "ЛФЛ", percent: Math.round((Number(L?.lfl ?? 0) * 100) / leaguesTotal) },
  ].filter(x => x.percent > 0);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user[0]?.gamertag || user[0]?.username || `User #${userId}`}
          </h1>
        </div>
        <Link href="/players" className="text-blue-600 hover:underline text-sm">← Ко всем игрокам</Link>
      </header>

      {/* Плитки: Матчи + Актуальное амплуа */}
      <section className="grid grid-cols-2 gap-4 md:max-w-[700px]">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Матчи</div>
          <div className="text-2xl font-semibold">{totalMatches}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">
            Актуальное амплуа <span title="За последние 30 матчей">ℹ️</span>
          </div>
          <div className="text-2xl font-semibold">{currentRole}</div>
        </div>
      </section>

      {/* Два барчарта: роли и лиги */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[700px]">
        <RoleDistributionSection
          roles={rolePercents}
          leagues={leagues}
          widthPx={500}  // синхронизировано с шириной теплокарты
          tooltip
        />
      </section>

      {/* Тепловая карта */}
      <section className="md:max-w-[700px]">
        <h3 className="font-semibold mb-2">Тепловая карта амплуа</h3>
        <div style={{ width: 500, height: 700 }}>
          <RoleHeatmapFromApi userId={userId} />
        </div>
      </section>
    </div>
  );
}
