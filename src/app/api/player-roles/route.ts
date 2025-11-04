import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import type { RoleCode } from "@/utils/roles";

/** rows -> проценты */
function toPercents(rows: Array<{ role: RoleCode; c: number }>) {
  const total = rows.reduce((s, r) => s + r.c, 0);
  if (total === 0) return { matches: 0, roles: [] as { role: RoleCode; percent: number }[] };
  const roles = rows
    .map((r) => ({ role: r.role, percent: +((r.c * 100) / total).toFixed(2) }))
    .sort((a, b) => b.percent - a.percent);
  return { matches: total, roles };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
  }

  const prisma = new PrismaClient();
  try {
    // 1) Основной путь — JOIN по position_id -> tbl_field_positions.id
    const joined = await prisma.$queryRaw<
      Array<{ role: RoleCode; c: bigint }>
    >`
      SELECT p.code AS role, COUNT(*) AS c
      FROM tbl_users_match_stats AS ms
      JOIN tbl_field_positions AS p ON p.id = ms.position_id
      WHERE ms.user_id = ${userId}
      GROUP BY p.code
    `;

    let rows: Array<{ role: RoleCode; c: number }> = (joined ?? []).map(r => ({
      role: r.role,
      c: Number(r.c),
    }));

    // 2) Фолбэк: если вдруг джойн ничего не вернул, пробуем посчитать по position_id,
    //    а затем подтянуть code для этих id одним IN-запросом. Это спасает случаи,
    //    когда тип user_id/приведение могло «молчаливо» не совпасть.
    if (rows.length === 0) {
      const agg = await prisma.$queryRaw<Array<{ position_id: number; c: bigint }>>`
        SELECT ms.position_id, COUNT(*) AS c
        FROM tbl_users_match_stats AS ms
        WHERE ms.user_id = ${userId}
        GROUP BY ms.position_id
      `;

      if (agg.length > 0) {
        const posIds = agg.map(a => Number(a.position_id)).filter(n => Number.isFinite(n));
        // подтягиваем коды для всех position_id
        const pos = await prisma.$queryRaw<Array<{ id: number; code: RoleCode }>>`
          SELECT id, code
          FROM tbl_field_positions
          WHERE id IN (${prisma.$queryRaw`${posIds}`})
        `;
        const idToCode = new Map<number, RoleCode>(pos.map(p => [Number(p.id), p.code]));
        rows = agg
          .map(a => {
            const code = idToCode.get(Number(a.position_id));
            return code ? { role: code, c: Number(a.c) } : null;
          })
          .filter(Boolean) as Array<{ role: RoleCode; c: number }>;
      }
    }

    const { matches, roles } = toPercents(rows);
    return NextResponse.json({ ok: true, matches, roles });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unexpected error" }, { status: 500 });
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
