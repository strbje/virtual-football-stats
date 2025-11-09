// src/app/api/player-roles/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// === Канон фильтра по «официальным» турнирам (твоя версия) ===
const SEASON_MIN = 18;
const OFFICIAL_FILTER = `
  AND (
    t.name REGEXP '\\\\([0-9]+ сезон\\\\)'
    AND CAST(REGEXP_SUBSTR(t.name, '[0-9]+') AS UNSIGNED) >= ${SEASON_MIN}
  )
`;

// Безопасное число
function toNum(v: any, d = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
}

// Авто-детект роли по последним 30 ОФИЦИАЛЬНЫМ матчам (исключая LastDance)
async function detectCurrentRoleLast30(userIdNum: number): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      fp.code AS role_code
    FROM tbl_users_match_stats ums
    JOIN tournament_match tm ON tm.id = ums.match_id
    JOIN tournament t        ON t.id = tm.tournament_id
    LEFT JOIN tbl_field_positions fp ON fp.id = ums.position_id
    WHERE ums.user_id = ${userIdNum}
      ${OFFICIAL_FILTER}
      AND t.name NOT LIKE 'LastDance%'
    ORDER BY tm.timestamp DESC
    LIMIT 30
  `);

  const counter = new Map<string, number>();
  for (const r of rows as any[]) {
    const code = String(r.role_code ?? "").trim();
    if (!code) continue;
    counter.set(code, (counter.get(code) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCnt = -1;
  for (const [code, cnt] of counter.entries()) {
    if (cnt > bestCnt) {
      best = code;
      bestCnt = cnt;
    }
  }
  return best; // примеры: "ЛФД", "ПЦП", "ЦЗ", "ЛЗ", "ВР" и т.п.
}

// API
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }
    const userIdNum = toNum(userId, NaN);
    if (!Number.isFinite(userIdNum)) {
      return NextResponse.json(
        { ok: false, error: "userId must be a number" },
        { status: 400 }
      );
    }

    const role = await detectCurrentRoleLast30(userIdNum);

    return NextResponse.json({
      ok: true,
      userId: userIdNum,
      currentRoleLast30: role, // ← это поле дальше используй в радаре
      debug: {
        seasonMin: SEASON_MIN,
        officialFilterApplied: true,
        lastDanceExcluded: true,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Unexpected error",
      },
      { status: 500 }
    );
  }
}
