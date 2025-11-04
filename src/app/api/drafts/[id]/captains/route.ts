import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

// Аккуратный парсер id из URL (может пригодиться дальше)
function getId(req: Request) {
  const m = new URL(req.url).pathname.match(/\/api\/drafts\/([^/]+)/);
  return m?.[1] ?? "";
}

// Кросс-платформенный UUID: работает и в Node 18+, и на Edge
function makeUUID(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Если твой store не принимает аргументы — читаем "как есть"
export async function GET(req: Request) {
  // id парсим, но не пробрасываем в store (у него сигнатура без аргументов)
  // оставляем на будущее, если знадобится фильтрация по draftId
  // const draftId = getId(req);

  const data = await readStore(); // <— БЕЗ аргументов
  return NextResponse.json(data ?? {});
}

export async function POST(req: Request) {
  // const draftId = getId(req);
  const body = await req.json();

  // добавляем ID капитана; остальное — как в твоей логике
  const captainId = makeUUID();
  const updated = { ...body, captainId };

  // store по текущей сигнатуре — тоже БЕЗ аргументов
  const result = await writeStore(updated);

  return NextResponse.json(result ?? updated);
}
