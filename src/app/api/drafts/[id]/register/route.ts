import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { randomUUID } from "crypto";

function getId(req: Request) {
  const m = new URL(req.url).pathname.match(/\/api\/drafts\/([^/]+)/);
  return m?.[1] ?? "";
}

export async function POST(req: Request) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const gamertag = typeof body?.gamertag === "string" ? body.gamertag.trim() : "";
  const roles = Array.isArray(body?.roles) ? body.roles.map((r: unknown) => String(r)) : [];
  if (!gamertag) return NextResponse.json({ error: "gamertag required" }, { status: 400 });

  const s = await readStore();
  const sess = s.sessions.find(x => x.id === id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  const exists = sess.registered.find(p => p.gamertag.toLowerCase() === gamertag.toLowerCase());
  if (exists) return NextResponse.json({ error: "already registered" }, { status: 409 });

  sess.registered.push({ id: randomUUID(), gamertag, roles });
  await writeStore(s);
  return NextResponse.json({ ok: true });
}
