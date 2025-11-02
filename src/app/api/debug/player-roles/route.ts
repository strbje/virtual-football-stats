// src/app/api/debug/player-roles/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userIdStr = searchParams.get('userId')
    const userId = Number(userIdStr)
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: 'Bad userId' }, { status: 400 })
    }

    // A) join по games_stats.skill_position_id -> tbl_field_positions.id
    const A = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT fp.code AS code, COUNT(*) AS cnt
      FROM games_stats gs
      JOIN tbl_field_positions fp ON fp.id = gs.skill_position_id
      WHERE gs.user_id = ?
      GROUP BY fp.code
      ORDER BY cnt DESC
      `,
      userId
    )

    // B) join по games_stats.pos -> tbl_field_positions.id
    const B = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT fp.code AS code, COUNT(*) AS cnt
      FROM games_stats gs
      JOIN tbl_field_positions fp ON fp.id = gs.pos
      WHERE gs.user_id = ?
      GROUP BY fp.code
      ORDER BY cnt DESC
      `,
      userId
    )

    // C) join по games_stats.pos -> tbl_field_positions.skill_id (на случай если pos хранит skill_id)
    const C = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT fp.code AS code, COUNT(*) AS cnt
      FROM games_stats gs
      JOIN tbl_field_positions fp ON fp.skill_id = gs.pos
      WHERE gs.user_id = ?
      GROUP BY fp.code
      ORDER BY cnt DESC
      `,
      userId
    )

    // Выберем “лучший” вариант: где суммарный count максимальный
    function sum(rows: any[]) { return rows.reduce((s, r) => s + Number(r.cnt || 0), 0) }
    const totals = { A: sum(A), B: sum(B), C: sum(C) }
    const bestKey = (Object.entries(totals).sort((x, y) => y[1] - x[1])[0] || [null])[0]

    return NextResponse.json({
      ok: true,
      userId,
      totals,                  // сколько записей дал каждый подход
      best: bestKey,           // какой подход “победил”
      A, B, C                  // сами распределения (посмотри глазами)
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
