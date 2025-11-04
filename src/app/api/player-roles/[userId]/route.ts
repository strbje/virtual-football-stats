// src/app/api/player-roles/[userId]/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// отдельная функция, чтобы не конфликтовать по именам
function parseTs(input?: string | null): number | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  const d = new Date(s);             // допускаем "ДД.ММ.ГГГГ", ISO и т.п.
  const t = isNaN(d.getTime()) ? Number(s) : d.getTime();
  return Number.isFinite(t) ? Number(t) : null;
}

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const url = new URL(_req.url);
    const range = url.searchParams.get("range") || "";  // формат "from:to"
    const [a, b] = range.split(":");

    const fromTs = parseTs(a) ?? 0;
    // если правая граница не задана — до “далёкого будущего”
    const toTs = parseTs(b ? `${b} 23:59:59` : "") ?? 32503680000000;

    const userId = Number(params.userId);

    // здесь тот же SQL/Prisma, что и раньше (без $queryRawUnsafe, если можно)
    // пример заглушки:
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT sp.short_name AS role, 
             COUNT(*)     AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm ON ums.match_id = tm.id
      JOIN skills_positions sp ON ums.skill_id = sp.id
      WHERE ums.user_id = ?
        AND tm.timestamp BETWEEN ? AND ?
      GROUP BY sp.short_name
      `,
      userId, Math.floor(fromTs / 1000), Math.floor(toTs / 1000)
    );

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
