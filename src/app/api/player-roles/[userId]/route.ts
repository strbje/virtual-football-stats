// GET /api/player-roles/:userId
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// NB: используем "ctx: any", чтобы не падать на строгой проверке сигнатуры Next 15
export async function GET(_req: Request, ctx: any) {
  const userIdParam = ctx?.params?.userId;
  const userId = Number(userIdParam);

  if (!Number.isFinite(userId)) {
    return NextResponse.json(
      { error: 'Bad userId', userIdParam },
      { status: 400 }
    );
  }

  // Тянем сырые роли по матчам игрока: группировка по короткому коду позиции
  // Поля подставлены по твоему примеру (match_participants.position_short_name, user_id).
  const rows = await prisma.match_participants.groupBy({
    by: ['position_short_name'],
    where: { user_id: 50734 },
    _count: { _all: true },
  });

  const data = rows.map((r) => ({
    role: (r.position_short_name ?? '').toUpperCase(),
    count: r._count._all,
  }));

  // никакого кэша, чтобы видеть актуал
  return NextResponse.json(
    { userId, data },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
