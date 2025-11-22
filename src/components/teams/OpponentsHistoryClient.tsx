"use client";

import { useMemo, useState } from "react";

type Result = "W" | "D" | "L" | "-";

// та же структура, что ты пробрасываешь из page.tsx
type OpponentMatchClient = {
  opponentId: number;
  opponentName: string;
  res: Result;
  scored: number;
  missed: number;
  date: string;
  tournament: string;
};

type Props = {
  matches: OpponentMatchClient[];
};

export default function OpponentsHistoryClient({ matches }: Props) {
  // все соперники с агрегированными W/D/L и голами
  const opponents = useMemo(() => {
    const map = new Map<
      number,
      {
        opponentId: number;
        opponentName: string;
        wins: number;
        draws: number;
        losses: number;
        gf: number;
        ga: number;
        games: OpponentMatchClient[];
      }
    >();

    for (const m of matches) {
      const key = m.opponentId;
      if (!map.has(key)) {
        map.set(key, {
          opponentId: m.opponentId,
          opponentName: m.opponentName,
          wins: 0,
          draws: 0,
          losses: 0,
          gf: 0,
          ga: 0,
          games: [],
        });
      }
      const agg = map.get(key)!;

      if (m.res === "W") agg.wins += 1;
      else if (m.res === "D") agg.draws += 1;
      else if (m.res === "L") agg.losses += 1;

      agg.gf += m.scored;
      agg.ga += m.missed;
      agg.games.push(m);
    }

    // отсортируем по количеству матчей (сначала самые частые соперники)
    return Array.from(map.values()).sort(
      (a, b) => b.games.length - a.games.length,
    );
  }, [matches]);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    opponents[0]?.opponentId ?? null,
  );

  // фильтр по поиску
  const filteredOpponents = useMemo(() => {
    if (!query.trim()) return opponents;
    const q = query.toLowerCase();
    return opponents.filter((o) =>
      o.opponentName.toLowerCase().includes(q),
    );
  }, [opponents, query]);

  const selected =
    opponents.find((o) => o.opponentId === selectedId) ??
    filteredOpponents[0] ??
    null;

  const inputValue = query || (selected ? selected.opponentName : "");

  const summary = useMemo(() => {
    if (!selected) {
      return { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, diff: 0 };
    }
    const { wins, draws, losses, gf, ga } = selected;
    return { wins, draws, losses, gf, ga, diff: gf - ga };
  }, [selected]);

  return (
    <div className="space-y-3">
      {/* селектор соперника + сводка W/D/L */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Соперник:</span>
          <div className="relative">
            <input
              className="border border-zinc-300 rounded-md px-2 py-1 text-xs min-w-[220px] outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Начните вводить команду"
              list="team-opponents-list"
              value={inputValue}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);

                const exact = opponents.find(
                  (o) => o.opponentName.toLowerCase() === v.toLowerCase(),
                );
                if (exact) {
                  setSelectedId(exact.opponentId);
                }
              }}
            />
            <datalist id="team-opponents-list">
              {filteredOpponents.map((o) => (
                <option key={o.opponentId} value={o.opponentName} />
              ))}
            </datalist>
          </div>
        </div>

        {selected && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              W {summary.wins}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
              D {summary.draws}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              L {summary.losses}
            </span>
            <span className="ml-2 text-zinc-600">
              Голы: {summary.gf}:{summary.ga}{" "}
              <span className="font-semibold">
                ({summary.diff >= 0 ? "+" : ""}
                {summary.diff})
              </span>
            </span>
          </div>
        )}
      </div>

      {/* список матчей против выбранного соперника с прокруткой */}
      <div className="max-h-44 overflow-y-auto border-t border-zinc-100 pt-2 text-xs text-zinc-600">
        {selected?.games.map((m, idx) => {
          let color = "text-zinc-700";
          if (m.res === "W") color = "text-emerald-700";
          else if (m.res === "L") color = "text-red-700";

          return (
            <div
              key={idx}
              className="flex justify-between gap-3 py-0.5"
            >
              <span className="text-zinc-500">{m.date || "—"}</span>
              <span className="flex-1 truncate text-right">
                <span className={color}>
                  {m.scored}:{m.missed} ({m.res})
                </span>
              </span>
            </div>
          );
        })}

        {selected && selected.games.length === 0 && (
          <div className="text-zinc-400 py-1">
            Матчей против этого соперника пока нет.
          </div>
        )}

        {!selected && opponents.length === 0 && (
          <div className="text-zinc-400 py-1">
            Нет данных по соперникам.
          </div>
        )}
      </div>
    </div>
  );
}
