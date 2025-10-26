import { PrismaClient } from "@prisma/client";

declare global {
  // чтобы не плодить клиентов в dev/hot-reload
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: ["error"], // можно добавить "query" если нужно дебажить
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;

export default prisma;
