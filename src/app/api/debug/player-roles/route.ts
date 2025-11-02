import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Row = { code: string; cnt: number }

async function getColumns(table: string) {
  // информация о колонках таблицы из information_schema
  const cols = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT COLUMN_NAME as name, DATA_TYPE as type
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
    `,
    table
  )
  return cols as { name: string; type: string }[]
}

function pickUserCol(cols: { name: string }[]) {
  // ищем кандидат на "колонку пользователя"
  const priority = [
    /^user_id$/i,
    /^userid$/i,
    /^player_id$/i,
    /^member_id$/i,
    /^user$/i,
    /^uid$/i,
  ]
  for (const rx of priority) {
    const hit = cols.find(c => rx.test(c.name))
    if (hit) return hit.name
  }
  // если точных совпадений нет — берём первый, где встречается "user" или "player" и "id"
  const fuzzy = cols.find(c => /(user|player|member).*(id)/i.test(c.name))
  return fuzzy?.name || null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userIdStr = searchParams.get('userId')
    const userId = Number(userIdStr)
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: 'Bad userId' }, { status: 400 })
    }

    // 1) читаем колонки целевых таблиц
    const gsCols = await getColumns('games_stats')
    const fpCols = await getColumns('tbl_field_positions')
    const userCol = pickUserCol(gsCols)

    if (!userCol) {
      return NextResponse.json({
        ok: false,
        error: 'Не нашёл колонку пользователя в games_stats',
        games_stats_columns: gsCols,
      }, { status: 500 })
    }

    // 2) три гипотезы джоина по позиции
    const queries = {
      A: `
        SELECT fp.code AS code, COUNT(*) AS cnt
        FROM games_stats gs
        JOIN tbl_field_positions fp ON fp.id = gs.skill_position_id
        WHERE gs.${userCol} = ?
        GROUP BY fp.code
        ORDER BY cnt DESC
      `,
      B: `
        SELECT fp.code AS code, COUNT(*) AS cnt
        FROM games_stats gs
        JOIN tbl_field_positions fp ON fp.id = gs.pos
        WHERE gs.${userCol} = ?
        GROUP BY fp.code
        ORDER BY cnt DESC
      `,
      C: `
        SELECT fp.code AS code, COUNT(*) AS cnt
        FROM games_stats gs
        JOIN tbl_field_positions fp ON fp.skill_id = gs.pos
        WHERE gs.${userCol} = ?
        GROUP BY fp.code
        ORDER BY cnt DESC
      `,
    } as const

    // 3) выполняем все, ошибки не валят весь ответ — просто пометим
    async function safeRun(sql: string): Promise<{ ok: true; rows: Row[] } | { ok: false; error: string }> {
      try {
        const rows = await prisma.$queryRawUnsafe<Row[]>(sql, userId)
        return { ok: true, rows }
      } catch (e: any) {
        return { ok: false, error: String(e?.message || e) }
      }
    }

    const [A, B, C] = await Promise.all([safeRun(queries.A), safeRun(queries.B), safeRun(queries.C)])

    function sum(x: typeof A) {
      return x.ok ? x.rows.reduce((s, r) => s + Number(r.cnt || 0), 0) : 0
    }

    const totals = { A: sum(A), B: sum(B), C: sum(C) }
    const best = (Object.entries(totals).sort(([,a],[,b]) => b - a)[0] || [null])[0]

    return NextResponse.json({
      ok: true,
      userId,
      used_user_column: userCol,
      tables: {
        games_stats_columns: gsCols,
        tbl_field_positions_columns: fpCols,
      },
      totals,
      best,
      A, B, C,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
