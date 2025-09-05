import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export async function GET(_req: Request, context: any) {
  const { id } = context.params as { id: string };
  const sess = s.sessions.find(x => x.id === params.id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(sess);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await readStore();
  const sess = s.sessions.find(x => x.id === params.id);
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (body?.status && ["planned","live","finished"].includes(body.status)) {
    sess.status = body.status;
    await writeStore(s);
  }
  return NextResponse.json(sess);
}
