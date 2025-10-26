"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type Initial = {
  q: string;
  team: string;
  tournament: string;
  range: string; // единое поле периода, например "01.09.2025 — 30.09.2025"
  role: string;
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
  const sp = useSearchParams();

  const [q, setQ] = useState(initial.q);
  const [team, setTeam] = useState(initial.team);
  const [tournament, setTournament] = useState(initial.tournament);
  const [range, setRange] = useState(initial.range);
  const [role, setRole] = useState(initial.role);

  // Парсер "ДД.ММ.ГГГГ — ДД.ММ.ГГГГ" (пробелы/дефисы терпим)
  function parseRange(input: string): { from?: string; to?: string } {
    const normalized = input.replace(/\s+/g, " ").trim();
    if (!normalized) return {};
    // допустим: "01.09.2025 — 30.09.2025" или "01.09.2025-30.09.2025"
    const parts = normalized.split(/[-—–]+/).map(s => s.trim()).filter(Boolean);
    const isDate = (d: string) => /^\d{2}\.\d{2}\.\d{4}$/.test(d);

    if (parts.length === 1) {
      // пользователь ввёл одну дату — трактуем как "с этой даты"
      return isDate(parts[0]) ? { from: parts[0] } : {};
    }
    if (parts.length >= 2) {
      const from = isDate(parts[0]) ? parts[0] : undefined;
      const to   = isDate(parts[1]) ? parts[1] : undefined;
      return { from, to };
    }
    return {};
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const url = new URL(window.location.href);
    const p = url.searchParams;

    function setParam(key: string, v: string) {
      if (v && v.trim()) p.set(key, v.trim());
      else p.delete(key);
    }

    setParam("q", q);
    setParam("team", team);
    setParam("tournament", tournament);

    // разложим range на from/to
    const { from, to } = parseRange(range);
    if (from) p.set("from", from); else p.delete("from");
    if (to)   p.set("to", to);     else p.delete("to");

    setParam("role", role);

    router.replace(`${pathname}?${p.toString()}`);
  }

  function onReset() {
    const url = new URL(window.location.href);
    url.search = "";
    router.replace(url.toString());
  }

  const roleOptions = useMemo(
    () => ["", ...roles],
    [roles]
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-3 items-end"
      style={{
        gridTemplateColumns:
          "repeat(auto-fit, minmax(180px, 1fr))",
      }}
    >
      <div className="flex flex-col">
        <input
          className="border rounded px-3 py-2"
          placeholder="Игрок"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-col">
        <input
          className="border rounded px-3 py-2"
          placeholder="Команда"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        />
      </div>

      <div className="flex flex-col">
        <input
          className="border rounded px-3 py-2"
          placeholder="Турнир"
          value={tournament}
          onChange={(e) => setTournament(e.target.value)}
        />
      </div>

      <div className="flex flex-col">
        <select
          className="border rounded px-3 py-2"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">Амплуа: любое</option>
          {roleOptions.map((r, idx) =>
            r ? (
              <option key={r + idx} value={r}>
                {r}
              </option>
            ) : null
          )}
        </select>
      </div>

      {/* ЕДИНЫЙ ФИЛЬТР ПЕРИОДА */}
      <div className="flex flex-col col-span-2">
        <input
          className="border rounded px-3 py-2"
          placeholder="ДД.ММ.ГГГГ — ДД.ММ.ГГГГ"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        />
        <span className="text-xs text-gray-500 mt-1">
          Можно ввести одну дату (будет «с даты») или диапазон через дефис/тире.
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Показать
        </button>
        <button
          type="button"
          onClick={onReset}
          className="border px-4 py-2 rounded"
        >
          Сбросить
        </button>
      </div>
    </form>
  );
}
