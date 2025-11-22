// src/components/teams/TeamsFiltersClient.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";

type Props = {
  initial: {
    team: string;
    tournament: string;
    range: string;
  };
};

export default function TeamsFiltersClient({ initial }: Props) {
  const [team, setTeam] = useState(initial.team ?? "");
  const [tournament, setTournament] = useState(initial.tournament ?? "");
  const [range, setRange] = useState(initial.range ?? "");
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // Инициализация flatpickr (как у игроков)
  useEffect(() => {
    if (!dateInputRef.current) return;

    const fp = flatpickr(dateInputRef.current, {
      mode: "range",
      dateFormat: "Y-m-d",
      defaultDate: range ? range.split(":") : undefined,
      onChange(selectedDates, _str, instance) {
        if (selectedDates.length === 2) {
          const [d1, d2] = selectedDates;
          const fmt = (d: Date) => instance.formatDate(d, "Y-m-d");
          setRange(`${fmt(d1)}:${fmt(d2)}`);
        }
        if (selectedDates.length === 0) {
          setRange("");
        }
      },
    });

    return () => {
      fp.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = () => {
    const params = new URLSearchParams();
    if (team.trim()) params.set("team", team.trim());
    if (tournament.trim()) params.set("tournament", tournament.trim());
    if (range) params.set("range", range);
    const search = params.toString();
    window.location.search = search ? `?${search}` : "";
  };

  const reset = () => {
    setTeam("");
    setTournament("");
    setRange("");
    window.location.search = "";
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <input
        className="border rounded px-2 py-1 text-sm"
        placeholder="Команда"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
      />
      <input
        className="border rounded px-2 py-1 text-sm"
        placeholder="Турнир"
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
      />
      <input
        ref={dateInputRef}
        className="border rounded px-2 py-1 text-sm"
        placeholder="Период: выберите в календаре"
        readOnly
      />
      <button
        type="button"
        onClick={apply}
        className="bg-blue-600 text-white text-sm px-3 py-1 rounded"
      >
        Показать
      </button>
      <button
        type="button"
        onClick={reset}
        className="border border-zinc-300 text-sm px-3 py-1 rounded"
      >
        Сбросить
      </button>
    </div>
  );
}
