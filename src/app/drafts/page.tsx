// src/app/drafts/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";

import type { FormEvent } from "react";

import type { DraftSession } from "@/lib/store";
import { RouterPush } from "@/components/drafts/RouterClient";
import { RouterRefresh } from "@/components/drafts/RouterClient";

// Абсолютный базовый URL для серверных fetch
async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`;
}

// Клиентская форма создания драфта
function NewDraftForm() {
  "use client";
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    if (!name) {
      alert("Введите название драфта");
      return;
    }
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const responseBody = (await res.json().catch(() => null)) as ({ id: string } | { error: string }) | null;
    if (!res.ok || !responseBody || "error" in responseBody) {
      alert(responseBody?.error || "Ошибка");
      return;
    }
    event.currentTarget.reset();
    router.push(`/drafts/${responseBody.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2 mb-6">
      <input
        name="name"
        placeholder="Название драфта (на 1 день)"
        className="border rounded px-3 py-2 w-80"
      />
      <button className="bg-blue-600 text-white rounded px-4">Создать</button>
    </form>
  );
}

export default async function DraftsPage() {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/drafts`, { cache: "no-store" });
  const sessions: DraftSession[] = res.ok ? ((await res.json()) as DraftSession[]) : [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Драфты</h1>

      <NewDraftForm />

      <div className="grid md:grid-cols-2 gap-3">
        {sessions.length === 0 && (
          <div className="text-gray-500">Пока нет сессий. Создайте первую.</div>
        )}
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/drafts/${session.id}`}
            className="block p-4 rounded border hover:shadow"
          >
            <div className="font-semibold">{session.name}</div>
            <div className="text-sm text-gray-500">Статус: {session.status}</div>
            <div className="text-sm text-gray-500">
              Зарегистрировано: {session.registered.length}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
