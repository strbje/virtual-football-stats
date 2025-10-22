// src/components/players/FiltersClient.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type Initial = {
  q?: string;
  team?: string;
  tournament?: string;
  role?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
};

export default function FiltersClient({
  initial,
  roles,
}: {
  initial: Initial;
  roles: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();

  // локальные значения инпутов
  const [q, setQ] = useState(initial.q ?? "");
  const [team, setTeam] = useState(initial.team ?? "");
  const [tournament, setTournament] = useState(initial.tournament ?? "");
  const [role, setRole] = useState(initial.role ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");

  // собираем query без пустых значений
  const buildParams = useMemo(() => {
    return (next?: Partial<Initial>) => {
      const p = new URLSearchParams(current?.toString() ?? "");

      const entries: [keyof Initial, string][] = [
        ["q", next?.q ?? q],
        ["team", next?.team ?? team],
        ["tournament", next?.tournament ?? tournament],
        ["role", next?.role ?? role],
        ["from", next?.from ?? from],
        ["to", next?.to ?? to],
      ];

      for (const [k, v] of entries) {
        const val = (v ?? "").trim();
        if (val) p.set(k, val);
        else p.delete(k);
      }

      // если даты перепутаны — поменяем местами
      const f = p.get("from");
      const t = p.get("to");
      if (f && t && f > t) {
        p.set("from", t);
        p.set("to", f);
      }

      return p;
    };
  }, [current, q, team, tournament, role, from, to]);

  function apply(params?: URLSearchParams) {
    const p = params ?? buildParams();
    const url = p.toString() ? `${pathname}?${p}` : pathname;
    // без перезагрузки и без прыжка страницы
    router.push(url, { scroll: false });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    apply();
  }

  function onReset() {
    setQ("");
    setTeam("");
    setTournament("");
    setRole("");
    setFrom("");
    setTo("");
    router.push(pathname, { scroll: false });
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-6">
      <input
        className="border rounded px-3 py-2"
        placeholder="Игрок"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <input
        className="border rounded px-3 py-2"
        placeholder="Команда"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
      />
      <input
        className="border rounded px-3 py-2"
        placeholder="Турнир"
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
      />

      {/* Амплуа (выпадающий список) */}
      <select
        className="border rounded px-3 py-2"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        <option value="">Амплуа: любое</option>
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {/* Единый фильтр периода: два date-поля как «с» и «до» */}
      <div className="flex gap-2">
        <input
          type="date"
          className="border rounded px-3 py-2 w-full"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Период с"
        />
        <input
          type="date"
          className="border rounded px-3 py-2 w-full"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Период до"
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2">
          Показать
        </button>
        <button type="button" className="border rounded px-4 py-2" onClick={onReset}>
          Сбросить
        </button>
      </div>
    </form>
  );
}
