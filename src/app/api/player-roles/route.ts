// src/app/api/player-roles/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Маппинг позиций (skill_id/position_id -> короткий код RoleCode) — как у тебя в utils/roles */
const ROLE_CODE_FROM_POSITION = {
  // ключи = tbl_field_positions.code
  "ВР": "ВРТ",
  "ЦЗ": "ЦЗ",
  "ЛЦЗ": "ЛЦЗ",
  "ПЦЗ": "ПЦЗ",
  "ЛЗ": "ЛЗ",
  "ПЗ": "ПЗ",
  "ЦОП": "ЦОП",
  "ЛОП": "ЛОП",
  "ПОП": "ПОП",
  "ЦП": "ЦП",
  "ЛЦП": "ЛЦП",
  "ПЦП": "ПЦП",
  "ЦАП": "ЦАП",
  "ЛАП": "ЛАП",
  "ПАП": "ПАП",
  "ЛФД": "ЛФД",
  "ПФД": "ПФД",
  "ЦФД": "ЦФД",
  "ЛФА": "ЛФА",
  "ПФА": "ПФА",
  "ФРВ": "ФРВ",
} as const;

type RoleCode = (typeof ROLE_CODE_FROM_POSITION)[keyof typeof ROLE_CODE_FROM_POSITION] | string;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const userId = Number(userIdParam);
  if (!userIdParam || Number.isNaN(userId)) {
    return NextResponse.json({ ok: false, error: "userId query param is required" }, { status: 400 });
  }

  try {
    // 1) все матчи игрока с позицией
    const rows = await prisma.$queryRaw<
      { position_code: string | null }[]
    >`
      SELECT fp.code AS position_code
      FROM tbl_users_match_stats ums
      LEFT JOIN tbl_field_positions fp ON fp.id = ums.position_id
      WHERE ums.user_id = ${userId}
    `;

    const total = rows.length;
    // агрегация по RoleCode
    const counts = new Map<RoleCode, number>();
    for (const r of rows) {
      const code = r.position_code ?? "";
      const role: RoleCode = (ROLE_CODE_FROM_POSITION as any)[code] ?? code;
      if (!role) continue;
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    const roles = Array.from(counts.entries())
      .map(([role, cnt]) => ({ role, percent: total ? +(cnt * 100 / total).toFixed(2) : 0 }))
      .sort((a, b) => b.percent - a.percent);

    // 2) «Актуальное амплуа»: мода по последним 30 матчам
    const last30 = await prisma.$queryRaw<{ role_code: string | null; cnt: bigint }[]>`
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
               fp.code AS role_code,
               COUNT(*) AS freq
        FROM last_matches lm
        JOIN tbl_users_match_stats ums
          ON ums.match_id = lm.match_id AND ums.user_id = ${userId}
        LEFT JOIN tbl_field_positions fp ON fp.id = ums.position_id
        GROUP BY lm.match_id, fp.code
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
    const last30Code = last30[0]?.role_code ?? null;
    const currentRoleLast30: RoleCode | null =
      last30Code ? ((ROLE_CODE_FROM_POSITION as any)[last30Code] ?? last30Code) : null;

    // 3) проценты матчей по лигам
    const leagueAgg = await prisma.$queryRaw<
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
    const a = leagueAgg[0];
    const leagues = a
      ? [
          { label: "ПЛ",  pct: Math.round((Number(a.pl)  * 100) / Math.max(1, Number(a.total))) },
          { label: "ФНЛ", pct: Math.round((Number(a.fnl) * 100) / Math.max(1, Number(a.total))) },
          { label: "ПФЛ", pct: Math.round((Number(a.pfl) * 100) / Math.max(1, Number(a.total))) },
          { label: "ЛФЛ", pct: Math.round((Number(a.lfl) * 100) / Math.max(1, Number(a.total))) },
        ].filter(x => x.pct > 0)
      : [];

    // 4) ник и актуальный клуб (для шапки)
    const [userRow] = await prisma.$queryRaw<
      { gamertag: string | null; username: string | null }[]
    >`SELECT gamertag, username FROM tbl_users WHERE id = ${userId} LIMIT 1`;
    const [teamRow] = await prisma.$queryRaw<{ team_name: string | null }[]>`
      SELECT c.team_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN teams c ON c.id = ums.team_id
      WHERE ums.user_id = ${userId}
      ORDER BY tm.timestamp DESC
      LIMIT 1
    `;

    return NextResponse.json({
      ok: true,
      matches: total,
      roles,
      currentRoleLast30,            // NEW
      leagues,                      // NEW
      user: {                       // NEW
        nickname: userRow?.gamertag || userRow?.username || `User #${userId}`,
        team: teamRow?.team_name ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
