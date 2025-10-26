"use client";

import React, { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Initial = {
  q: string;
  team: string;
  tournament: string;
  role: string;
  range: string; // "YYYY-MM-DD:YYYY-MM-DD" или ""
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
  const [role, setRole] = useState(initial.role);
  const [range, setRange] = useState(initial.range); // единый контрол

  const qsString = useMemo(() => {
    const p = new URLSearchParams(sp?.toString());
    function setOrDel(k: string, v?: string) {
      if (v && v.trim()) p.set(k, v.trim());
      else p.delete(k);
    }
    setOrDel("q", q);
    setOrDel("team", team);
    setOrDel("tournament", tournament);
    setOrDel("role", role);
    setOrDel("range", range);
    return p.toString();
  }, [q, team, tournament, role, range, sp]);

  function submit() {
    const url = qsString ? `${pathname}?${qsString}` : pathname;
    router.push(url);
  }

  function reset() {
    setQ("");
    setTeam("");
    setTournament("");
    setRole("");
    setRange("");
    router.push(pathname);
  }

  // Удобный ввод диапазона одной строкой: вводишь "2025-09-01:2025-09-30".
  // Если хочется визуально — можно два date-инпута, но мы оставляем единый контрол.
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <input
        className="border rounded px-3 py-2 min-w-[180px]"
        placeholder="Игрок"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <input
        className="border rounded px-3 py-2 min-w-[180px]"
        placeholder="Команда"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
      />
      <input
        className="border rounded px-3 py-2 min-w-[180px]"
        placeholder="Турнир"
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
      />

      <select
        className="border rounded px-3 py-2 min-w-[180px]"
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

      {/* Один контрол «Период» */}
      <input
        className="border rounded px-3 py-2 min-w-[220px]"
        placeholder="Период: 2025-09-01:2025-09-30"
        value={range}
        onChange={(e) => setRange(e.target.value)}
      />

      <button
        className="bg-blue-600 text-white px-4 py-2 rounded"
        onClick={submit}
      >
        Показать
      </button>
      <button
        className="border px-4 py-2 rounded"
        onClick={reset}
      >
        Сбросить
      </button>
    </div>
  );
}
