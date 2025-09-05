import { NextResponse } from "next/server";
import { readStore, writeStore, type DraftSession } from "@/lib/store";
import { randomUUID } from "crypto";

export async function GET() {
  const s = await readStore();
  return NextResponse.json(s.sessions);
}

export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const s = await readStore();
  const session: DraftSession = {
    id: randomUUID(),
    name: name.trim(),
    status: "planned",
    registered: [],
    captains: [],
    teams: [],
    picks: [],
    schedule: [],
  };
  s.sessions.push(session);
  await writeStore(s);
  return NextResponse.json({ id: session.id });
}
