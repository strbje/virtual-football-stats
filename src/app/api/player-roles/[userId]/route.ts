// @ts-nocheck
// src/app/api/player-roles/[userId]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic'; // без статического кеша
const prisma = new PrismaClient();

// единственное место, что может потребовать подстановки названия таблицы
const TABLE = 'match_participants'; // если не зайдёт — см. шаг 3 ниже

export async function GET(_req, ctx) {
  const userId = Number(ctx?.params?.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Bad userId' }, { status: 400 });
  }

  try {
    // максимально универсальный SQL: без кастов (::int), работает и в PG, и в MySQL
    const rows = await prisma.$queryRawUnsafe(`
      SELECT position_short_name AS role, COUNT(*) AS cnt
      FROM ${TABLE}
      WHERE user_id = ${userId}
      GROUP BY position_short_name
    `);

    const raw = (rows ?? []).map((r: any) => ({
      role: String(r.role ?? '').toUpperCase(),
      count: Number(r.cnt ?? 0),
    })).filter(r => r.role);

    const total = raw.reduce((s, r) => s + r.count, 0);

    return NextResponse.json(
      { userId, totalMatches: total, raw },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
