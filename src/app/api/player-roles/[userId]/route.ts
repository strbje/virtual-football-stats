// @ts-nocheck
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

// очень простая проверка идентификаторов (таблица/колонки)
function safeIdent(s?: string) {
  if (!s) return null;
  if (!/^[A-Za-z0-9_]+$/.test(s)) return null;
  return s;
}

export async function GET(req, ctx) {
  const userId = Number(ctx?.params?.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Bad userId' }, { status: 400 });
  }

  const url = new URL(req.url);
  // можно передавать свои названия через query string:
  // /api/player-roles/50734?table=participants&userCol=user_id&posCol=position_short_name
  const table  = safeIdent(url.searchParams.get('table'));
  const userCol = safeIdent(url.searchParams.get('userCol'));
  const posCol  = safeIdent(url.searchParams.get('posCol'));

  if (!table || !userCol || !posCol) {
    return NextResponse.json({
      error: 'Provide ?table=...&userCol=...&posCol=...',
      example: '/api/player-roles/50734?table=match_players&userCol=user_id&posCol=position_short_name'
    }, { status: 400 });
  }

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT ${posCol} AS role, COUNT(*) AS cnt
      FROM ${table}
      WHERE ${userCol} = ${userId}
      GROUP BY ${posCol}
    `);

    const raw = (rows ?? []).map((r:any) => ({
      role: String(r.role ?? '').toUpperCase(),
      count: Number(r.cnt ?? 0),
    })).filter(r => r.role);

    const total = raw.reduce((s,r)=>s+r.count,0);
    return NextResponse.json({ userId, table, userCol, posCol, totalMatches: total, raw });
  } catch (e:any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
