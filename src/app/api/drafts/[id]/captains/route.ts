import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

// безопасный парсер id из URL
function getId(req: Request) {
  const m = new URL(req.url).pathname.match(/\/api\/drafts\/([^/]+)/);
  return m?.[1] ?? "";
}

// универсальный генератор UUID (Node 18+/Edge/браузер)
function makeUUID(): string {
  // Web Crypto API доступен и в Node >=18.17, и в Edge
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // редкий fallback — чтобы не падать при типизации/тестах
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// пример хендлеров — оставь как у тебя, меняем только генерацию UUID
export async function GET(req: Request) {
  const id = getId(req);
  const data = await readStore(id);
  return NextResponse.json(data ?? {});
}

export async function POST(req: Request) {
  const id = getId(req);
  const body = await req.json();
  // если нужен новый идентификатор капитана — используем makeUUID()
  const captainId = makeUUID();
  const updated = await writeStore(id, { ...body, captainId });
  return NextResponse.json(updated);
}
