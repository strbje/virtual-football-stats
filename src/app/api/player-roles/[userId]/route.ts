// src/app/api/player-roles/[userId]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ROLE_TO_GROUP } from '@/lib/roles';

// ← если ROLE_TO_GROUP экспортируется по умолчанию другим именем,
//   поправь импорт. В твоём /src/lib/roles.ts он у нас уже есть.

// -------------------------------------------------------------
// 1) Настройка имени реальной таблицы с участниками матчей
//    Если у тебя иное имя — просто замени эту константу.
// -------------------------------------------------------------
const TABLE = 'match_participants'; // например: 'match_participants' / 'participants' / 'player_matches'

// -------------------------------------------------------------
// 2) SQL-выгрузка «сырой правды» по коротким ролям игрока
// -------------------------------------------------------------
async function fetchRawRoles(userId: number) {
  // position_short_name — поле, которое мы хотим получить (как в Excel).
  // user_id — фильтруем по игроку.
  // Если у тебя иные названия колонок — поправь их в SELECT и WHERE.
  const rows = await prisma.$queryRaw<
    { position_short_name: string | null; cnt: bigint }[]
  >`
    SELECT position_short_name, COUNT(*)::bigint AS cnt
    FROM ${prisma.sql.identifier([TABLE])}
    WHERE user_id = ${userId}
    GROUP BY position_short_name
  `;

  // Приводим к удобному формату
  return rows
    .map((r) => ({
      role: (r.position_short_name ?? '').toUpperCase(),
      count: Number(r.cnt),
    }))
    .filter((r) => r.role); // отсекаем пустые
}

// -------------------------------------------------------------
// 3) Группировка по нашим «укрупнённым» группам (фрв/цап/кп/цп/цоп/цз/кз/врт)
// -------------------------------------------------------------
function groupByRoleGroup(raw: { role: string; count: number }[]) {
  const groupCount: Record<string, number> = {};

  for (const { role, count } of raw) {
    const group = ROLE_TO_GROUP[role]; // маппинг «короткая роль → группа»
    if (!group) continue;
    groupCount[group] = (groupCount[group] ?? 0) + count;
  }

  const total = Object.values(groupCount).reduce((s, v) => s + v, 0);
  const grouped = Object.entries(groupCount)
    .map(([group, count]) => ({
      group,
      count,
      percent: total > 0 ? Math.round((count * 10000) / total) / 100 : 0,
    }))
    .sort((a, b) => b.percent - a.percent);

  return { grouped, total };
}

// -------------------------------------------------------------
// 4) API-обработчик
//    GET /api/player-roles/:userId
// -------------------------------------------------------------
export async function GET(
  _req: Request,
  ctx: { params: { userId: string } }
) {
  const userId = Number(ctx.params.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Bad userId' }, { status: 400 });
  }

  try {
    const raw = await fetchRawRoles(userId);

    // Дополнительно: развернутый «вклад» по каждой группе (какие короткие роли туда попали)
    const byGroup: Record<
      string,
      { role: string; count: number; percent: number }[]
    > = {};
    const totalRaw = raw.reduce((s, r) => s + r.count, 0) || 1;

    for (const r of raw) {
      const g = ROLE_TO_GROUP[r.role];
      if (!g) continue;
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push({
        role: r.role,
        count: r.count,
        percent: Math.round((r.count * 10000) / totalRaw) / 100,
      });
    }
    for (const g of Object.keys(byGroup)) {
      byGroup[g].sort((a, b) => b.count - a.count);
    }

    const { grouped, total } = groupByRoleGroup(raw);

    return NextResponse.json(
      {
        userId,
        table: TABLE,
        raw,          // «как есть» из БД: [{role:'ЦФД', count:275}, ...]
        grouped,      // укрупнённые группы с %: [{group:'фрв', percent:48}, ...]
        byGroup,      // состав каждой группы по коротким ролям
        totals: { totalRaw, totalGrouped: total },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'internal error' },
      { status: 500 }
    );
  }
}
