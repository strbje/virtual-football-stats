// src/lib/db.ts
import type { PrismaClient } from "@prisma/client";

// Единственная точка входа к БД.
// Возвращает PrismaClient или null, если БД отключена/не сгенерена.
let _db: PrismaClient | null | undefined;

export async function getDb(): Promise<PrismaClient | null> {
  // Жёсткий флаг, чтобы полностью игнорировать БД
  if (process.env.SKIP_DB === "1") return null;

  if (_db !== undefined) return _db;

  try {
    // ВАЖНО: динамический импорт, чтобы билд не падал, если клиента нет
    const { PrismaClient } = await import("@prisma/client");
    _db = new PrismaClient();
    return _db;
  } catch {
    // Клиент не сгенерён или переменные БД не заданы — работаем без БД
    _db = null;
    return null;
  }
}
