// GET /api/debug/player-roles/:userId
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // путь как у тебя в проекте

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  const userId = Number(params.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Bad userId' }, { status: 400 });
  }

  // Важно: берём именно short_name позиции (как в твоей Excel-выгрузке),
  // считаем количество матчей по каждой роли.
  const rows = await prisma.match_participants.groupBy({
    by: ['position_short_name'], // или твое точное поле: short_name / pos_short / etc.
    where: { user_id: 50734 },
    _count: { _all: true },
  });

  const data = rows.map(r => ({
    role: (r.position_short_name ?? '').toUpperCase(),
    count: r._count._all,
  }));

  return NextResponse.json({ userId, data }, { headers: { 'Cache-Control': 'no-store' }});
}
