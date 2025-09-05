import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

function getId(req: Request) {
  const m = new URL(req.url).pathname.match(/\/api\/drafts\/([^/]+)/);
  return m?.[1] ?? "";
}

export async function POST(req: Request) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const teamId: string | undefined = body?.teamId;
  const playerId: string | undefined = body?.playerId;
  if (!teamId || !playerId) {
    return NextResponse.json({ error: "teamId and playerId required" }, { status: 400 });
  }

  const s = await readStore();
  const sess = s.sessions.find(x => x.id === id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  const reg = sess.registered.find(p => p.id === playerId);
  if (!reg) return NextResponse.json({ error: "player not registered" }, { status: 400 });

  const already = sess.teams.some(t => t.players.includes(playerId));
  if (already) return NextResponse.json({ error: "already picked" }, { status: 409 });

  // snake-порядок по индексу массива (массив создан в порядке драфта)
  const teamCount = sess.teams.length;
  const picksDone = sess.picks.length;
  const round = Math.floor(picksDone / teamCount);
  const idxInRound = picksDone % teamCount;
  const forward = round % 2 === 0;
  const expectedOrder = forward ? idxInRound : (teamCount - 1 - idxInRound);
  const expectedTeam = sess.teams[expectedOrder];

  if (!expectedTeam || expectedTeam.id !== teamId) {
    return NextResponse.json(
      { error: "not your turn", expectedTeamId: expectedTeam?.id },
      { status: 409 }
    );
  }

  expectedTeam.players.push(playerId);
  sess.picks.push({ teamId, playerId, ts: Date.now() });

  await writeStore(s);
  return NextResponse.json({ ok: true, pickNo: picksDone + 1 });
}
