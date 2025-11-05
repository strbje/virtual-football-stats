//src/app/api/player-profile/[userId]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  const userId = Number(params.userId);
  if (!userId || Number.isNaN(userId)) {
    return NextResponse.json({ ok: false, error: "Bad userId" }, { status: 400 });
  }

  // Заготовка ответа — никогда не бросаем наружу
  const out: {
    ok: boolean;
    user: { nickname: string; team: string | null };
    currentRoleLast30: string | null;
    leagues: { label: string; pct: number }[];
    hint: string;
    _debug?: Record<string, unknown>;
  } = {
    ok: true,
    user: { nickname: `User #${userId}`, team: null },
    currentRoleLast30: null,
    leagues: [],
    hint: "За последние 30 матчей",
  };

  // 1) Ник / клуб (мягко)
  try {
    const u = await prisma.$queryRaw<{ gamertag: string | null; username: string | null }[]>`
      SELECT gamertag, username
      FROM tbl_users
      WHERE id = ${userId}
      LIMIT 1
    `;
    out.user.nickname = u[0]?.gamertag || u[0]?.username || out.user.nickname;
  } catch (e) {
    out._debug = { ...(out._debug || {}), userErr: String(e) };
  }

  try {
    const t = await prisma.$queryRaw<{ team_name: string | null }[]>`
      SELECT c.team_name
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN teams c ON c.id = ums.team_id
      WHERE ums.user_id = ${userId}
      ORDER BY tm.timestamp DESC
      LIMIT 1
    `;
    out.user.team = t[0]?.team_name ?? null;
  } catch (e) {
    out._debug = { ...(out._debug || {}), teamErr: String(e) };
  }

  // 2) Мода по последним 30 матчам: position_id -> tbl_field_positions.code
  try {
    const r = await prisma.$queryRaw<{ role_code: string | null; cnt: bigint }[]>`
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
    out.currentRoleLast30 = r[0]?.role_code ?? null;
  } catch (e) {
    out._debug = { ...(out._debug || {}), currentRoleErr: String(e) };
  }

  // 3) Проценты по лигам
  try {
    const a = (await prisma.$queryRaw<
      { total: bigint; pl: bigint; fnl: bigint; pfl: bigint; lfl: bigint }[]
    >`
      SELECT
        COUNT(DISTINCT ums.match_id) AS total,
        COUNT(DISTINCT CASE WHEN (LOWER(t.name) LIKE '%премьер%' OR UPPER(t.name) LIKE '%ПЛ%') THEN ums.match_id END) AS pl,
        COUNT(DISTINCT CASE WHEN UPPER(t.name) LIKE '%ФНЛ%' THEN ums.match_id END) AS fnl,
        COUNT(DISTINCT CASE WHEN UPPER(t.name) LIKE '%ПФЛ%' THEN ums.match_id END) AS pfl,
        COUNT(DISTINCT CASE WHEN UPPER(t.name) LIKE '%ЛФЛ%' THEN ums.match_id END) AS lfl
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON tm.id = ums.match_id
      JOIN tournament t        ON t.id  = tm.tournament_id
      WHERE ums.user_id = ${userId}
    `)[0];

    if (a) {
      const total = Math.max(1, Number(a.total));
      out.leagues = [
        { label: "ПЛ",  pct: Math.round((Number(a.pl)  * 100) / total) },
        { label: "ФНЛ", pct: Math.round((Number(a.fnl) * 100) / total) },
        { label: "ПФЛ", pct: Math.round((Number(a.pfl) * 100) / total) },
        { label: "ЛФЛ", pct: Math.round((Number(a.lfl) * 100) / total) },
      ].filter(x => x.pct > 0);
    }
  } catch (e) {
    out._debug = { ...(out._debug || {}), leaguesErr: String(e) };
  }

  return NextResponse.json(out);
}
