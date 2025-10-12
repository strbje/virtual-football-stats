"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

type DraftResp = { id: string } | { error: string };

export default function NewDraftForm() {
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

    const body = (await res.json().catch(() => null)) as DraftResp | null;

    if (!res.ok || !body || ("error" in body)) {
      alert(body && "error" in body ? body.error : "Ошибка");
      return;
    }

    event.currentTarget.reset();
    router.push(`/drafts/${body.id}`);
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
