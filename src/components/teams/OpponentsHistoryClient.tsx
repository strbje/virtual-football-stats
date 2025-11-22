// src/components/teams/OpponentsHistoryClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

type Match = {
  opponentId: number;
  opponentName: string;
  res: "W" | "D" | "L" | "-";
  scored: number;
  missed: number;
  date: string;
  tournament: string;
};

type Props = {
  matches: Match[];
};

type OpponentAgg = {
  id: number;
  name: string;
  wins: number;
  draws: number;
  loses: number;
  matches: number;
  goalsFor: number;
  goalsAgainst: number;
};

export default function OpponentsHistoryClient({ matches }: Props) {
  // агрегируем соперников
  const opponents: OpponentAgg[] = useMemo(() => {
    const map = new Map<number, OpponentAgg>();

    for (const m of matches) {
      const key = m.opponentId;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: m.opponentName,
          wins: 0,
          draws: 0,
          loses: 0,
          matches: 0,
          goalsFor: 0,
          goalsAgainst: 0,
        });
      }
      const agg = map.get(key)!;
      agg.matches += 1;
      agg.goalsFor += m.scored;
      agg.goalsAgainst += m.missed;

      if (m.res === "W") agg.wins += 1;
      else if (m.res === "D") agg.draws += 1;
      else if (m.res === "L") agg.loses += 1;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.matches - a.matches || a.name.localeCompare(b.name),
    );
  }, [matches]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // дебаунс ввода (300 мс)
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(h);
  }, [search]);

  // фильтр соперников по debouncedSearch
  const filteredOpponents = useMemo(() => {
    if (!debouncedSearch.trim()) return opponents;
    const q = debouncedSearch.trim().toLowerCase();
    return opponents.filter((o) => o.name.toLowerCase().includes(q));
  }, [opponents, debouncedSearch]);

  const [selectedId, setSelectedId] = useState<number | null>(
    opponents.length > 0 ? opponents[0].id : null,
  );

  // автоселект: всегда держим выбранным соперника из текущего списка
  useEffect(() => {
    if (filteredOpponents.length === 0) {
      setSelectedId(null);
      return;
    }
    if (
      selectedId == null ||
      !filteredOpponents.some((o) => o.id === selectedId)
    ) {
      setSelectedId(filteredOpponents[0].id);
    }
  }, [filteredOpponents, selectedId]);

  const currentMatches = useMemo(
    () =>
      selectedId == null
        ? []
        : matches.filter((m) => m.opponentId === selectedId),
    [matches, selectedId],
  );

  // сводка W-D-L и мячи для выбранного соперника
  const summary = useMemo(() => {
    if (selectedId == null) return null;
    const agg =
      filteredOpponents.find((o) => o.id === selectedId) ??
      opponents.find((o) => o.id === selectedId);
    if (!agg) return null;

    const diff = agg.goalsFor - agg.goalsAgainst;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

    return {
      name: agg.name,
      wins: agg.wins,
      draws: agg.draws,
      loses: agg.loses,
      matches: agg.matches,
      gf: agg.goalsFor,
      ga: agg.goalsAgainst,
      diffStr,
    };
  }, [selectedId, filteredOpponents, opponents]);

  if (opponents.length === 0) {
    return (
      <div className="text-xs text-zinc-500">
        Нет официальных матчей против других команд.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* строка поиска + селектор + сводка */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Соперник:</span>

        <input
          type="text"
          className="border border-zinc-200 rounded-md px-2 py-1 text-xs min-w-[160px]"
          placeholder="Введите название команды"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border border-zinc-200 rounded-md px-2 py-1 text-xs min-w-[220px]"
          value={selectedId ?? undefined}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {filteredOpponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.wins}-{o.draws}-{o.loses} ({o.matches})
            </option>
          ))}
        </select>

        {summary && (
          <div className="text-[11px] text-zinc-600">
            {summary.wins}-{summary.draws}-{summary.loses} · мячи{" "}
            {summary.gf}:{summary.ga} ({summary.diffStr})
          </div>
        )}
      </div>

      {/* список матчей с выбранным соперником */}
      <div className="border-t border-zinc-100 pt-2 max-h-52 overflow-y-auto text-xs">
        {currentMatches.length === 0 ? (
          <div className="text-zinc-500">Нет матчей с выбранным соперником.</div>
        ) : (
          <ul className="space-y-1">
            {currentMatches.map((m, idx) => (
              <li
                key={`${m.opponentId}-${idx}`}
                className="flex justify-between gap-2"
              >
                <span className="text-zinc-500">
                  {m.date || "—"} · {m.tournament || "Турнир не указан"}
                </span>
                <span
                  className={clsx("font-medium", {
                    "text-emerald-700": m.res === "W",
                    "text-zinc-700": m.res === "D",
                    "text-red-700": m.res === "L",
                  })}
                >
                  {m.scored}:{m.missed} ({m.res})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
