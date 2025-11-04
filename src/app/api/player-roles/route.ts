import { NextResponse, NextRequest } from "next/server";
import type { RoleCode } from "@/utils/roles";
import { rolePercentsFromAppearances } from "@/utils/roles";

/**
 * GET /api/player-roles?userId=50734
 * Возвращает:
 * {
 *   ok: true,
 *   matches: number,                               // всего матчей (учтённых)
 *   roles: Array<{ role: RoleCode; percent: number }> // доли по амплуа, %
 * }
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

    // 1) Пытаемся вызвать старую готовую логику, если она у тебя есть
    //    (оставляет поведение "как было").
    try {
      const mod: any = await import("@/lib/players");
      if (mod && typeof mod.getPlayerRoles === "function") {
        const data = await mod.getPlayerRoles(userId);
        // ожидается структура { matches, roles }
        return NextResponse.json({ ok: true, ...data });
      }
    } catch {
      // нет модуля/функции — идём к Prisma
    }

    // 2) Пытаемся достать появления по ролям через Prisma (универсальный путь).
    //    Предполагаем таблицу match с полями userId (string|number) и role (RoleCode).
    //    Если у тебя другая схема — твоя старая getPlayerRoles перекроет этот блок.
    try {
      const prismaMod: any = await import("@/lib/prisma");
      const prisma = prismaMod?.prisma ?? prismaMod?.default ?? prismaMod;

      // Если prisma не экспортирован как объект — пробуем prisma.default
      if (!prisma || typeof prisma.match?.findMany !== "function") {
        throw new Error("Prisma client not available");
      }

      // Загружаем все появления игрока по ролям.
      // Если нужно исключать сборные — добавь соответствующий фильтр в where.
      const rows: Array<{ role: string | null }> = await prisma.match.findMany({
        where: {
          // userId может быть строкой в БД — приводим аккуратно
          userId: isNaN(Number(userId)) ? (userId as any) : Number(userId),
          // пример фильтра, если в схеме есть признак матчей сборных:
          // isNational: false
        },
        select: { role: true },
      });

      const rolesByMatch: RoleCode[] = rows
        .map((r) => (r.role ?? "").trim())
        .filter((r) => r.length > 0) as RoleCode[];

      const matches = rolesByMatch.length;
      const roles = rolePercentsFromAppearances(rolesByMatch);

      return NextResponse.json({ ok: true, matches, roles });
    } catch {
      // Prisma недоступен — не валим страницу, отдаём пустой результат
      return NextResponse.json({ ok: true, matches: 0, roles: [] });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
