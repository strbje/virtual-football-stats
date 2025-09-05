import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { randomUUID } from "crypto";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { captainIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(captainIds) || captainIds.length < 2) {
    return NextResponse.json({ error: "captainIds array (>=2) required" }, { status: 400 });
  }

  const s = await readStore();
  const sess = s.sessions.find(x => x.id === params.id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  sess.captains = captainIds.map(String);
  sess.teams = captainIds.map((cid, i) => ({
    id: randomUUID(),
    name: `Team ${i + 1}`,
    captainId: String(cid),
    draftOrder: i + 1,
    players: [String(cid)],
  }));
  sess.picks = [];
  await writeStore(s);
  return NextResponse.json({ ok: true, teams: sess.teams });
}
