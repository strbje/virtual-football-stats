// src/app/players/[userId]/page.tsx
import Link from "next/link";
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";
import { prisma } from "@/lib/prisma";

// Группировка по амплуа (твоя «правильная» логика)
import { groupRolePercents } from "@/lib/roles";

// Справочники и типы
import {
  HEATMAP_ROLES_ORDER,
  ROLE_LABELS,
  type RolePercent,
  type RoleCode,
} from "@/utils/roles";

export const dynamic = "force-dynamic";

type ApiRolesResp = {
  ok: boolean;
  matches: number;
  roles: { role: RoleCode; percent: number }[];
};

// Лейблы групп для левого барчарта (как в старой версии)
const GROUP_LABELS: Record<string, string> = {
  FORWARD: "Форвард",
  ATT_MID: "Атакующий полузащитник",
  WIDE_MID: "Крайний полузащитник",
  CENT_MID: "Центральный полузащитник",
  DEF_MID: "Опорный полузащитник",
  FULLBACK: "Крайний защитник",
  CENTER_BACK: "Центральный защитник",
  GOALKEEPER: "Вратарь",
};

// «мода за 30 матчей» для подписи в карточке
async function getCurrentRoleLast30(userId: number) {
  const rows = await prisma.$queryRaw<{ role_code: string; cnt: bigint }[]>`
    WITH last_matches AS (
      SELECT DISTINCT ums.match_id, tm.timestamp
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      WHERE ums.user_id = ${userId}
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
  const code = rows[0]?.role_code ?? null;
  return code ? (ROLE_LABELS as Record<string, string>)[code] ?? code : "—";
}

// распределение матчей по лигам (проценты)
async function getLeagueBuckets(userId: number) {
  const agg = await prisma.$queryRaw<
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
  `;
  const a = agg[0];
  if (!a) return [];
  const total = Number(a.total) || 1;
  const buckets = [
    { label: "ПЛ",  pct: Math.round((Number(a.pl)  * 100) / total) },
    { label: "ФНЛ", pct: Math.round((Number(a.fnl) * 100) / total) },
    { label: "ПФЛ", pct: Math.round((Number(a.pfl) * 100) / total) },
    { label: "ЛФЛ", pct: Math.round((Number(a.lfl) * 100) / total) },
  ];
  return buckets.filter(b => b.pct > 0);
}

export default async function PlayerProfile({
  params,
}: {
  params: { userId: string };
}) {
  const userId = Number(params.userId);

  // ник и актуальный клуб
  const [userRows, teamRows] = await Promise.all([
    prisma.$queryRaw<
      { id: number; gamertag: string | null; username: string | null }[]
    >`SELECT id, gamertag, username FROM tbl_users WHERE id = ${userId} LIMIT 1`,
    prisma.$queryRaw<{ team_name: string | null }[]>`
      SELECT c.team_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN teams c ON c.id = ums.team_id
      WHERE ums.user_id = ${userId}
      ORDER BY tm.timestamp DESC
      LIMIT 1
    `,
  ]);

  const nickname =
    userRows[0]?.gamertag || userRows[0]?.username || `User #${userId}`;
  const teamName = teamRows[0]?.team_name ?? null;

  // распределение по амплуа берём из твоего рабочего API (как договорились)
  const rolesJson = (await (
    await fetch(`/api/player-roles?userId=${userId}`, { cache: "no-store" })
  ).json()) as ApiRolesResp;

  const rolePercents: RolePercent[] = rolesJson.roles.map((r) => ({
    role: r.role,
    percent: r.percent,
  }));
  const matches = rolesJson.matches;

  // групповой барчарт (и русские подписи групп)
  const groupedRaw = groupRolePercents(rolePercents);
  const rolesForChart = groupedRaw.map((g: any) => ({
    label: GROUP_LABELS[g.group ?? g.label] ?? (g.label ?? String(g.group)),
    value: Number(g.value ?? g.percent ?? 0),
  }));

  // тепловая — без нулевых позиций
  const heatmapData = HEATMAP_ROLES_ORDER
    .map((code) => {
      const f = rolePercents.find((x) => x.role === code);
      return { role: code, percent: f ? f.percent : 0 };
    })
    .filter((x) => x.percent > 0);

  // «Актуальное амплуа» — МОДА ПОСЛЕДНИХ 30 МАТЧЕЙ
  const currentRoleLabel = await getCurrentRoleLast30(userId);

  // проценты по лигам
  const leagues = await getLeagueBuckets(userId);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold">{nickname}</h1>
        {teamName && (
          <div className="text-sm text-zinc-500 mt-1">{teamName}</div>
        )}
        <div className="mt-2">
          <a href="/players" className="text-blue-600 hover:underline text-sm">
            ← Ко всем игрокам
          </a>
        </div>
      </div>

      {/* Карточки */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:max-w-[720px]">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold tabular-nums">{matches}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">
            Актуальное амплуа <span title="За последние 30 матчей">ℹ️</span>
          </div>
          <div className="text-2xl font-semibold">{currentRoleLabel}</div>
        </div>
      </section>

      {/* Распределения: амплуа + лиги */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection
          roles={rolesForChart}
          leagues={leagues}   // теперь реальные проценты
          widthPx={500}
          tooltip
        />
      </section>

      {/* Тепловая карта */}
      <section className="md:max-w-[1100px]">
        <div className="text-sm font-semibold mb-2">Тепловая карта амплуа</div>
        <RoleHeatmap data={heatmapData} />
      </section>
    </div>
  );
}
