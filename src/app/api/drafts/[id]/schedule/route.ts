import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await readStore();
  const sess = s.sessions.find(x => x.id === params.id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  const teams = sess.teams.map(t => t.id);
  const n = teams.length;
  if (n < 2) return NextResponse.json({ error: "need >=2 teams" }, { status: 400 });

  const arr = [...teams];
  if (n % 2 === 1) arr.push("BYE");
  const rounds: { round: number; homeId: string; awayId: string }[] = [];
  for (let r = 0; r < arr.length - 1; r++) {
    for (let i = 0; i < arr.length / 2; i++) {
      const a = arr[i], b = arr[arr.length - 1 - i];
      if (a !== "BYE" && b !== "BYE") rounds.push({ round: r + 1, homeId: a, awayId: b });
    }
    const fixed = arr[0];
    const tail = arr.slice(1);
    tail.unshift(tail.pop() as string);
    arr.splice(0, arr.length, fixed, ...tail);
  }
  sess.schedule = rounds;
  await writeStore(s);
  return NextResponse.json({ ok: true, matches: rounds.length });
}
