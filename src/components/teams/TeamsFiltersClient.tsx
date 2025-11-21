"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_blue.css";

type Props = {
  initial: {
    team: string;
    tournament: string;
    range: string;
  };
};

export default function TeamsFiltersClient({ initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [team, setTeam] = useState(initial.team ?? "");
  const [tournament, setTournament] = useState(initial.tournament ?? "");
  const [range, setRange] = useState<Date[]>(() => {
    if (!initial.range) return [];
    const [start, end] = initial.range.split(":").map((s) => s.trim());
    const dates: Date[] = [];
    if (start) dates.push(new Date(start));
    if (end) dates.push(new Date(end));
    return dates;
  });

  const rangeLabel = useMemo(() => {
    if (!range || range.length === 0) return "";
    const toISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;

    if (range.length === 1) return toISO(range[0]);
    return `${toISO(range[0])}:${toISO(range[1])}`;
  }, [range]);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    if (team) params.set("team", team);
    else params.delete("team");

    if (tournament) params.set("tournament", tournament);
    else params.delete("tournament");

    if (range && range.length > 0) {
      const toISO = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      const from = toISO(range[0]);
      const to = range.length > 1 ? toISO(range[1]) : from;
      params.set("range", `${from}:${to}`);
    } else {
      params.delete("range");
    }

    router.push(`/teams?${params.toString()}`);
  }, [router, searchParams, team, tournament, range]);

  const resetFilters = useCallback(() => {
    setTeam("");
    setTournament("");
    setRange([]);
    const params = new URLSearchParams();
    router.push(`/teams`);
  }, [router]);

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <input
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Команда"
        className="border rounded-md px-2 py-1 text-sm min-w-[180px]"
      />
      <input
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
        placeholder="Турнир"
        className="border rounded-md px-2 py-1 text-sm min-w-[180px]"
      />

      {/* Календарь как у игроков */}
      <div className="border rounded-md px-2 py-1 text-sm min-w-[220px]">
        <Flatpickr
          value={range}
          options={{
            mode: "range",
            dateFormat: "Y-m-d",
          }}
          onChange={(dates: Date[]) => setRange(dates)}
          placeholder="Период: выберите в календаре"
          className="w-full text-sm focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={applyFilters}
        className="bg-blue-600 text-white text-sm px-3 py-1 rounded-md"
      >
        Показать
      </button>
      <button
        type="button"
        onClick={resetFilters}
        className="border border-zinc-300 text-sm px-3 py-1 rounded-md"
      >
        Сбросить
      </button>
    </div>
  );
}
