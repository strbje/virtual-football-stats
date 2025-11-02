// @ts-nocheck
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

/**
 * Ищем по INFORMATION_SCHEMA кандидатов:
 *  - таблицы текущей БД
 *  - где есть колонка, похожая на user_id (user_id, userid, player_id)
 *  - и колонка, похожая на position_short_name (position_short_name, pos_short, position, role, position_code)
 */
export async function GET() {
  try {
    const [{ db }] = await prisma.$queryRawUnsafe(`SELECT DATABASE() as db`);
    const like = (arr: string[]) => arr.map(s => `'${s}'`).join(',');

    // все колонки по текущей БД
    const cols = await prisma.$queryRawUnsafe(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${db}'
    `);

    const USER_CAND = ['user_id','userid','player_id','uid'];
    const POS_CAND  = ['position_short_name','pos_short','position','role','position_code','pos'];

    const byTable = new Map<string, Set<string>>();
    for (const r of cols as any[]) {
      const t = String(r.TABLE_NAME);
      const c = String(r.COLUMN_NAME).toLowerCase();
      if (!byTable.has(t)) byTable.set(t, new Set());
      byTable.get(t)!.add(c);
    }

    const candidates: any[] = [];
    for (const [table, set] of byTable) {
      const hasUser = USER_CAND.some(u => set.has(u));
      const hasPos  = POS_CAND.some(p => set.has(p));
      if (hasUser && hasPos) {
        candidates.push({
          table,
          hasUserFrom: USER_CAND.filter(u => set.has(u)),
          hasPosFrom:  POS_CAND.filter(p => set.has(p))
        });
      }
    }

    candidates.sort((a,b) => a.table.localeCompare(b.table));
    return NextResponse.json({ db, candidates });
  } catch (e:any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
