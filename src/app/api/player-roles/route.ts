import { NextResponse, NextRequest } from "next/server";
import type { RoleCode } from "@/utils/roles";
import { rolePercentsFromAppearances } from "@/utils/roles";

/**
 * GET /api/player-roles?userId=50734
 * Ответ:
 * { ok: true, matches: number, roles: Array<{ role: RoleCode; percent: number }> }
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    // --- Пытаемся прочитать роли из БД через Prisma (если доступен) ---
    try {
      // Подключаем PrismaClient напрямую, чтобы не зависеть от "@/lib/..."
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();

      // Ниже предполагается, что есть таблица матчей с полями userId и role.
      // Если у тебя другое имя таблицы/полей — поменяй только этот кусок.
      const rows: Array<{ role: string | null }> = await prisma.match.findMany({
        where: {
          // userId в БД может быть числом или строкой — пробуем оба варианта
          OR: [
            { userId: Number.isNaN(Number(userId)) ? undefined as any : Number(userId) },
            { userId: userId as any },
          ].filter(Boolean) as any,
        },
        select: { role: true },
      });

      await prisma.$disconnect().catch(() => {});

      const rolesByMatch: RoleCode[] = rows
        .map((r) => (r.role ?? "").trim())
        .filter(Boolean) as RoleCode[];

      const matches = rolesByMatch.length;
      const roles = rolePercentsFromAppearances(rolesByMatch);

      return NextResponse.json({ ok: true, matches, roles });
    } catch {
      // Prisma недоступен или схема отличается — отдаём пустой, но валидный ответ
      return NextResponse.json({ ok: true, matches: 0, roles: [] });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
