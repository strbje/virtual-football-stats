// src/app/api/player-roles/[userId]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

// локальный клиент, чтобы не зависеть от твоего обёрточного файла
const prisma = new PrismaClient();

type Row = { role: string | null };

// GET /api/player-roles/:userId
export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const userIdNum = Number(params.userId);
  if (!Number.isFinite(userIdNum)) {
    return NextResponse.json({ error: 'Bad userId' }, { status: 400 });
  }

  // Универсальный raw-SQL (типизация any, поэтому сборка не падает).
  // Если у тебя иные имена таблиц/полей, роут всё равно СКОМПИЛИРУЕТСЯ.
  // В рантайме просто вернёт 500 — тогда скажешь, подложу точный SELECT под твою схему.
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT position_short_name AS role
       FROM match_participants
      WHERE user_id = 50734`,
    userIdNum
  );

  // Подсчёт «сырых» ролей (без группировок)
  const counts = new Map<string, number>();
  for (const r of rows) {
    const code = (r.role ?? '').trim().toUpperCase();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const rawByRole = [...counts.entries()]
    .map(([role, count]) => ({ role, count, pct: total ? (count * 100) / total : 0 }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(
    { userId: userIdNum, totalMatches: total, rawByRole },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
