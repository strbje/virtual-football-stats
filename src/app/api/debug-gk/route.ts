import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** Безопасная JSON-сериализация: BigInt -> Number */
function jsonSafe(data: unknown) {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 25);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? limitRaw : 25;

    // Топ вратарей по предотвращённому xG за матч
    const sql = `
      WITH base AS (
        SELECT
          /* идентификаторы сразу приводим к UNSIGNED, чтобы не возвращать BigInt */
          CAST(ums.user_id AS UNSIGNED)  AS user_id,
          CAST(ums.match_id AS UNSIGNED) AS match_id,
          CAST(ums.team_id AS UNSIGNED)  AS team_id,

          /* xG соперника в этом матче */
          COALESCE((
            SELECT SUM(u2.goals_expected)
            FROM tbl_users_match_stats u2
            WHERE u2.match_id = ums.match_id
              AND u2.team_id <> ums.team_id
            GROUP BY u2.match_id
          ), 0) AS opp_xg,

          /* события GK */
          ums.saved,
          ums.scored,
          ums.intercepts,
          ums.allpasses,
          ums.dry
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        INNER JOIN tournament t        ON tm.tournament_id = t.id
        LEFT  JOIN tbl_field_positions fp ON ums.position_id = fp.id
        WHERE fp.code IN ('ВР') /* короткий код GK в вашей БД */
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
        /* всё, что делим, принудительно в DOUBLE через *1.0 */
        ((pu.opp_xg - pu.conceded) / NULLIF(pu.matches, 0)) * 1.0 AS prevented_xg,
        pu.matches * 1.0               AS matches,
        pu.opp_xg * 1.0                AS opp_xg,
        pu.conceded * 1.0              AS conceded,
        (pu.saved / NULLIF(pu.saved + pu.conceded, 0)) * 1.0 AS save_pct,
        (pu.saved / NULLIF(pu.matches, 0)) * 1.0             AS saves_avg,
        (pu.dry_matches / NULLIF(pu.matches, 0)) * 1.0       AS clean_sheets_pct
      FROM per_user pu
      LEFT JOIN tbl_users u ON u.id = pu.user_id
      WHERE pu.matches >= 30
      ORDER BY prevented_xg DESC
      LIMIT ${limit}
    `;

    const rows = await prisma.$queryRawUnsafe(sql);
    return NextResponse.json({ ok: true, rows: jsonSafe(rows) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

//Откройте:
///api/debug-gk — топ-25,
///api/debug-gk?limit=50 — топ-50.
