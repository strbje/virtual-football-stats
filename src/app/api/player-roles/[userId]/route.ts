// src/app/api/player-roles/[userId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // важно: в твоём prisma.ts экспорт именно { prisma }

type RoleRow = { role: string; matches: bigint | number };
type LeagueRow = { league: string; matches: bigint | number };

// Безопасный парсер "YYYY-MM-DD" или "YYYY-MM-DD hh:mm:ss" → unix (секунды)
function parseTs(input?: string | null): number | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Если пришла только дата — прибиваем время к началу суток.
  const withTime = /\d{2}:\d{2}:\d{2}$/.test(s) ? s : `${s} 00:00:00`;

  const dt = new Date(withTime.replace(" ", "T") + "Z"); // UTC
  const ts = Math.floor(dt.getTime() / 1000);
  return Number.isFinite(ts) ? ts : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const url = new URL(req.url);

    // Диапазон из query (?range=YYYY-MM-DD:YYYY-MM-DD)
    const range = url.searchParams.get("range") || "";
    const [a, b] = range.split(":");

    const fromTs = parseTs(a) ?? 0; // по умолчанию "с начала времён"
    // если конец не указан — прибиваем к 23:59:59, иначе год 3000
    const toTsParsed = parseTs(b ? `${b} 23:59:59` : "");
    const toTs = toTsParsed ?? 32503680000;

    const userId = Number(params.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: "Bad userId" }, { status: 400 });
    }

    // 1) Распределение по амплуа в выбранном периоде
    const roles = await prisma.$queryRaw<RoleRow[]>`
      SELECT 
        sp.short_name AS role, 
        COUNT(*)      AS matches
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      GROUP BY sp.short_name
      ORDER BY matches DESC
    `;

    // 2) Распределение по лигам (ПЛ/ФНЛ/ПФЛ/ЛФЛ/Другое) в выбранном периоде
    const leagues = await prisma.$queryRaw<LeagueRow[]>`
      SELECT 
        CASE
          WHEN t.name LIKE '%Премьер%' OR t.name LIKE '%ПЛ%'  THEN 'ПЛ'
          WHEN t.name LIKE '%ФНЛ%'                             THEN 'ФНЛ'
          WHEN t.name LIKE '%ПФЛ%'                             THEN 'ПФЛ'
          WHEN t.name LIKE '%ЛФЛ%'                             THEN 'ЛФЛ'
          ELSE 'Другое'
        END AS league,
        COUNT(*) AS matches
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN tournament t        ON tm.tournament_id = t.id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      GROUP BY league
      ORDER BY matches DESC
    `;

    // 3) Актуальное амплуа: по последним 30 матчам игрока
    // подвыборка последних 30 его матчей, затем группировка по амплуа
    const last30 = await prisma.$queryRaw<RoleRow[]>`
      SELECT 
        sp.short_name AS role,
        COUNT(*)      AS matches
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE ums.user_id = ${userId}
        AND ums.match_id IN (
          SELECT u2.match_id
          FROM tbl_users_match_stats u2
          JOIN tournament_match tm2 ON u2.match_id = tm2.id
          WHERE u2.user_id = ${userId}
          ORDER BY tm2.timestamp DESC
          LIMIT 30
        )
      GROUP BY sp.short_name
      ORDER BY matches DESC
    `;
    const topRoleLast30 = last30[0]?.role ?? null;

    // Нормализуем bigint → number
    const toNum = (x: bigint | number) => (typeof x === "bigint" ? Number(x) : x);
    const rolesOut = roles.map(r => ({ role: r.role, matches: toNum(r.matches) }));
    const leaguesOut = leagues.map(l => ({ league: l.league, matches: toNum(l.matches) }));

    return NextResponse.json({
      ok: true,
      fromTs,
      toTs,
      roles: rolesOut,
      leagues: leaguesOut,
      topRoleLast30,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
