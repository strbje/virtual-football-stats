import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 25);

    const sql = `
      WITH base AS (
        SELECT
          ums.user_id,
          ums.match_id,
          ums.team_id,
          COALESCE((
            SELECT SUM(u2.goals_expected)
            FROM tbl_users_match_stats u2
            WHERE u2.match_id = ums.match_id
              AND u2.team_id <> ums.team_id
            GROUP BY u2.match_id
          ), 0) AS opp_xg,
          ums.saved, ums.scored, ums.intercepts, ums.allpasses, ums.dry
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE fp.code IN ('ВР')
          AND (
            t.name REGEXP 'сезон' AND
            CAST(REGEXP_SUBSTR(t.name, '[0-9]{1,2}') AS UNSIGNED) >= 18
          )
      ),
      per_user AS (
        SELECT
          user_id,
          CAST(COUNT(DISTINCT match_id) AS UNSIGNED) AS matches,
          SUM(opp_xg)      AS opp_xg,
          SUM(scored)      AS conceded,
          SUM(saved)       AS saved,
          SUM(intercepts)  AS intercepts,
          SUM(allpasses)   AS allpasses,
          SUM(dry)         AS dry_matches
        FROM base
        GROUP BY user_id
      )
      SELECT
        pu.user_id,
        u.gamertag,
        (pu.opp_xg - pu.conceded) / NULLIF(pu.matches, 0) AS prevented_xg,
        pu.matches,
        pu.opp_xg, pu.conceded,
        pu.saved / NULLIF(pu.saved + pu.conceded, 0) AS save_pct,
        pu.saved / NULLIF(pu.matches, 0)             AS saves_avg,
        pu.dry_matches / NULLIF(pu.matches, 0)       AS clean_sheets_pct
      FROM per_user pu
      LEFT JOIN tbl_users u ON u.id = pu.user_id
      WHERE pu.matches >= 30
      ORDER BY prevented_xg DESC
      LIMIT ${limit}
    `;

    const rows = await prisma.$queryRawUnsafe(sql);
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}

//Откройте:
///api/debug-gk — топ-25,
///api/debug-gk?limit=50 — топ-50.
