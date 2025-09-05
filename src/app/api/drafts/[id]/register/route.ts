import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { randomUUID } from "crypto";

export async function POST(req: Request, context: any) {
  const { id } = context.params as { id: string };
  if (!gamertag) return NextResponse.json({ error: "gamertag required" }, { status: 400 });

  const s = await readStore();
  const sess = s.sessions.find(x => x.id === params.id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  const exists = sess.registered.find(p => p.gamertag.toLowerCase() === String(gamertag).toLowerCase());
  if (exists) return NextResponse.json({ error: "already registered" }, { status: 409 });

  sess.registered.push({ id: randomUUID(), gamertag: String(gamertag), roles: Array.isArray(roles) ? roles.map(String) : [] });
  await writeStore(s);
  return NextResponse.json({ ok: true });
}
