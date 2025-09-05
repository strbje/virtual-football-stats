import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

function getId(req: Request) {
  const m = new URL(req.url).pathname.match(/\/api\/drafts\/([^/]+)/);
  return m?.[1] ?? "";
}

export async function GET(req: Request) {
  const id = getId(req);
  const s = await readStore();
  const sess = s.sessions.find(x => x.id === id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(sess);
}

export async function PATCH(req: Request) {
  const id = getId(req);
  const s = await readStore();
  const sess = s.sessions.find(x => x.id === id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (body?.status && ["planned", "live", "finished"].includes(body.status)) {
    sess.status = body.status;
    await writeStore(s);
  }
  return NextResponse.json(sess);
}
