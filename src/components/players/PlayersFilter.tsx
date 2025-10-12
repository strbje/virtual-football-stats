"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo } from "react";

export default function PlayersFilter() {
  const router = useRouter();
  const sp = useSearchParams();

  const defaultValues = useMemo(() => ({
    q: sp.get("q") || "",
    team: sp.get("team") || "",
    tournament: sp.get("tournament") || "",
    from: sp.get("from") || "",
    to: sp.get("to") || ""
  }), [sp]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = String(fd.get("q") || "").trim();
    const team = String(fd.get("team") || "").trim();
    const tournament = String(fd.get("tournament") || "").trim();
    const from = String(fd.get("from") || "").trim();
    const to = String(fd.get("to") || "").trim();

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (team) params.set("team", team);
    if (tournament) params.set("tournament", tournament);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    // сбрасываем страницу на 1 при изменении фильтров
    params.set("page", "1");

    router.push(`/players?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-5 gap-2 mb-4">
      <input name="q" defaultValue={defaultValues.q} placeholder="Ник игрока"
             className="border rounded px-3 py-2" />
      <input name="team" defaultValue={defaultValues.team} placeholder="Команда"
             className="border rounded px-3 py-2" />
      <input name="tournament" defaultValue={defaultValues.tournament} placeholder="Турнир"
             className="border rounded px-3 py-2" />
      <input type="date" name="from" defaultValue={defaultValues.from}
             className="border rounded px-3 py-2" />
      <input type="date" name="to" defaultValue={defaultValues.to}
             className="border rounded px-3 py-2" />
      <div className="md:col-span-5 flex gap-2">
        <button className="bg-blue-600 text-white rounded px-4 py-2">Фильтр</button>
        <button type="button" className="border rounded px-4 py-2"
                onClick={() => router.push("/players")}>Сброс</button>
      </div>
    </form>
  );
}
