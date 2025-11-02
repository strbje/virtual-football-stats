// src/app/api/debug/locate-roles-table/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  // Ищем все таблицы/колонки, которые выглядят как user_id/player_id и позиции
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      TABLE_NAME   AS tableName,
      COLUMN_NAME  AS columnName,
      DATA_TYPE    AS dataType
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
        COLUMN_NAME IN ('user_id','player_id','userId','playerId')
        OR COLUMN_NAME LIKE '%position%'
        OR COLUMN_NAME LIKE '%pos%'
        OR COLUMN_NAME LIKE '%role%'
      )
    ORDER BY TABLE_NAME, COLUMN_NAME
  `)

  return NextResponse.json({
    ok: true,
    count: rows.length,
    sample: rows.slice(0, 50), // чтобы не заспамить
  })
}
