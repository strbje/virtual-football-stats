import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toTs(s?: string | null) {
  if (!s) return null;
  const d = s.includes(":") ? s : `${s} 00:00:00`;
  const n = Math.floor(new Date(d).getTime() / 1000);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "";
    const [a, b] = range.split(":");
    const fromTs = toTs(a) ?? 0;
    const toTs = toTs(b ? `${b} 23:59:59` : "") ?? 32503680000;

    const userId = Number(params.userId);

    // Базовые проценты по амплуа в диапазоне:
    const rows = await prisma.$queryRaw<{ role: string; cnt: bigint }[]>`
      SELECT COALESCE(fp.code, sp.short_name) AS role,
             COUNT(DISTINCT ums.match_id)     AS cnt
      FROM tbl_users_match_stats ums
      JOIN tournament_match tm         ON tm.id = ums.match_id
      JOIN skills_positions  sp        ON sp.id = ums.skill_id
      LEFT JOIN tbl_field_positions fp ON fp.skill_id = sp.id
      WHERE ums.user_id = ${userId}
        AND tm.timestamp BETWEEN ${fromTs} AND ${toTs}
      GROUP BY COALESCE(fp.code, sp.short_name)
    `;
    const total = rows.reduce((s, r) => s + Number(r.cnt), 0) || 1;
    const byRole: Record<string, number> = {};
    for (const r of rows) byRole[r.role] = Math.round((Number(r.cnt) * 100) / total);

    // Возвращаем структуру, которую уже ждёт фронт (с координатами)
    return NextResponse.json({
      ok: true,
      byRole, // фронт подставит проценты в баблы
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `${e}` }, { status: 500 });
  }
}
