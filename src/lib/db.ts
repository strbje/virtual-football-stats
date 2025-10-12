// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

// Глобальный синглтон Prisma (чтобы не плодить подключения в dev)
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "production" ? [] : ["error"] });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;

// (Опционально) совместимость со старым кодом — просто вернём синглтон
export async function getDb(): Promise<PrismaClient> {
  return prisma;
}
