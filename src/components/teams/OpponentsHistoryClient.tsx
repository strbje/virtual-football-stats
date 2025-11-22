// src/components/teams/OpponentsHistoryClient.tsx
"use client";

import { useMemo, useState } from "react";
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

export default function OpponentsHistoryClient({ matches }: Props) {
  const opponents = useMemo(() => {
    const map = new Map<
      number,
      { id: number; name: string; wins: number; draws: number; loses: number; matches: number }
    >();

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
        });
      }
      const agg = map.get(key)!;
      agg.matches += 1;
      if (m.res === "W") agg.wins += 1;
      else if (m.res === "D") agg.draws += 1;
      else if (m.res === "L") agg.loses += 1;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.matches - a.matches || a.name.localeCompare(b.name),
    );
  }, [matches]);

  const [selectedId, setSelectedId] = useState<number | null>(
    opponents.length > 0 ? opponents[0].id : null,
  );

  const currentMatches = useMemo(
    () =>
      selectedId == null
        ? []
        : matches.filter((m) => m.opponentId === selectedId),
    [matches, selectedId],
  );

  if (opponents.length === 0) {
    return (
      <div className="text-xs text-zinc-500">
        Нет официальных матчей против других команд.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Соперник:</span>
        <select
          className="border border-zinc-200 rounded-md px-2 py-1 text-xs"
          value={selectedId ?? undefined}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.wins}-{o.draws}-{o.loses} ({o.matches})
            </option>
          ))}
        </select>
      </div>

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
