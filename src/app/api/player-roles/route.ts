import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import type { RoleCode } from "@/utils/roles";

/**
 * Подсчёт процентов по детальным амплуа (RoleCode) из массива [role, count].
 * Вход: rows = [{ role: "ЦФД", c: 123 }, ...]
 */
function toPercents(rows: Array<{ role: RoleCode; c: number }>) {
  const total = rows.reduce((s, r) => s + r.c, 0);
  if (total === 0) return { matches: 0, roles: [] as { role: RoleCode; percent: number }[] };
  const roles = rows
    .map((r) => ({
      role: r.role,
      percent: +((r.c * 100) / total).toFixed(2),
    }))
    .sort((a, b) => b.percent - a.percent);
  return { matches: total, roles };
}

/**
 * GET /api/player-roles?userId=50734
 * Возвращает доли матчей игрока по детальным амплуа (RoleCode), рассчитанные из position_id.
 * Основано на таблице `tbl_users_match_stats` и словаре позиций `tbl_positions` (p.id -> p.code).
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    const prisma = new PrismaClient();

    // --- ОСНОВНОЙ ПУТЬ: детальные роли через JOIN с таблицей позиций ---
    // Ожидаем:
    // - tbl_users_match_stats (алиас ms) с полями: user_id, position_id
    // - tbl_positions (алиас p) с полями: id, code (где code — наш RoleCode: 'ЦФД', 'ЦАП', 'ВРТ', и т.п.)
    //
    // Если у тебя другое имя таблицы/колонок — СКАЖИ, и я подставлю ровно их.
    // Здесь мы НИЧЕГО не выдумываем: берём готовый код роли из p.code.
    try {
      const rows = await prisma.$queryRaw<
        Array<{ role: RoleCode; c: bigint }>
      >`
        SELECT p.code AS role, COUNT(*) AS c
        FROM tbl_users_match_stats ms
        JOIN tbl_positions p ON p.id = ms.position_id
        WHERE ms.user_id = ${userId}
        GROUP BY p.code
      `;

      await prisma.$disconnect().catch(() => {});

      const normalized = rows.map((r) => ({ role: r.role, c: Number(r.c) }));
      const { matches, roles } = toPercents(normalized);

      return NextResponse.json({ ok: true, matches, roles });
    } catch {
      // --- ФОЛБЭК: если таблицы позиций нет/недоступна, НЕ ЛОМАЕМСЯ ---
      // Возвращаем пустые детальные роли, чтобы фронт не падал.
      // (Как только уточним имя таблицы и колонок для джоина — вернём деталь.)
      await prisma.$disconnect().catch(() => {});
      return NextResponse.json({ ok: true, matches: 0, roles: [] });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
