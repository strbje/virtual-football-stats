// src/app/api/drafts/[id]/captains/route.ts
import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { randomUUID } from "crypto";

export async function POST(req: Request, context: any) {
  const { id } = context.params as { id: string };

  const body = await req.json().catch(() => ({}));
  const captainIds: string[] = Array.isArray(body.captainIds)
    ? body.captainIds.map(String)
    : [];

  if (captainIds.length < 2) {
    return NextResponse.json({ error: "captainIds array (>=2) required" }, { status: 400 });
  }

  const s = await readStore();
  const sess = s.sessions.find(x => x.id === id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  sess.captains = captainIds;
  sess.teams = captainIds.map((cid, i) => ({
    id: randomUUID(),
    name: `Team ${i + 1}`,
    captainId: cid,
    draftOrder: i + 1,
    players: [cid],
  }));
  sess.picks = [];
  await writeStore(s);
  return NextResponse.json({ ok: true, teams: sess.teams });
}
