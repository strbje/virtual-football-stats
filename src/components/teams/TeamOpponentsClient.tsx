"use client";

import { useMemo, useState } from "react";

type Result = "W" | "D" | "L" | "-";

export type TeamOpponentMatch = {
  date: string;          // "2025-11-21"
  opponentName: string;  // "Darkside eSports"
  scored: number;
  missed: number;
  res: Result;
};

export type TeamOpponentSummary = {
  opponentId: number;
  opponentName: string;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  matches: TeamOpponentMatch[];
};

export function TeamOpponentsClient({
  opponents,
}: {
  opponents: TeamOpponentSummary[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    opponents[0]?.opponentId ?? null,
  );

  // Отфильтрованный список по поиску
  const filteredOpponents = useMemo(() => {
    if (!query.trim()) return opponents;
    const q = query.toLowerCase();
    return opponents.filter(o => o.opponentName.toLowerCase().includes(q));
  }, [opponents, query]);

  // Текущий выбранный соперник
  const selected =
    opponents.find(o => o.opponentId === selectedId) ??
    filteredOpponents[0] ??
    null;

  // Обновляем поле ввода при смене selected
  const inputValue =
    query || (selected ? selected.opponentName : "");

  const summary = useMemo(() => {
    if (!selected) {
      return {
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        diff: 0,
      };
    }
    const gf = selected.goalsFor;
    const ga = selected.goalsAgainst;
    return {
      wins: selected.wins,
      draws: selected.draws,
      losses: selected.losses,
      gf,
      ga,
      diff: gf - ga,
    };
  }, [selected]);

  return (
  <section className="vfs-card p-4 space-y-4">
    <h3 className="text-sm font-semibold text-foreground mb-2">
      Форма (10 последних официальных матчей)
    </h3>

    {opponents.length === 0 ? (
      <div className="text-xs text-zinc-400">
        Недостаточно данных по матчам.
      </div>
    ) : (
      <div className="space-y-3">

        {/* Соперник + поиск + сводка */}
        <div className="flex flex-wrap items-center gap-3">

          <span className="text-xs text-zinc-500">Соперник:</span>

          <div className="relative">
            <input
              className="vfs-input w-56"
              placeholder="Введите команду"
              list="team-opponents-list"
              value={inputValue}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);

                const exact = opponents.find(
                  (o) => o.opponentName.toLowerCase() === v.toLowerCase(),
                );
                if (exact) setSelectedId(exact.opponentId);
              }}
            />
            <datalist id="team-opponents-list">
              {filteredOpponents.map((o) => (
                <option key={o.opponentId} value={o.opponentName} />
              ))}
            </datalist>
          </div>

          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-xs">

              <span className="vfs-pill bg-emerald-500/20 text-emerald-300">
                W {summary.wins}
              </span>

              <span className="vfs-pill bg-zinc-500/20 text-zinc-300">
                D {summary.draws}
              </span>

              <span className="vfs-pill bg-red-500/20 text-red-300">
                L {summary.losses}
              </span>

              <span className="ml-2 text-zinc-400">
                Голы: {summary.gf}:{summary.ga}{" "}
                <span className="font-semibold text-foreground">
                  ({summary.diff >= 0 ? "+" : ""}
                  {summary.diff})
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Список матчей с выбранным соперником */}
        <div className="max-h-44 overflow-y-auto mt-2 border-t border-zinc-700/40 pt-2 text-xs text-zinc-400">
          {selected?.matches.map((m, idx) => {
            let color = "text-zinc-300";
            if (m.res === "W") color = "text-emerald-300";
            else if (m.res === "L") color = "text-red-300";

            return (
              <div
                key={idx}
                className="flex justify-between gap-3 py-0.5"
                title={m.opponentName}
              >
                <span className="text-zinc-500">
                  {m.date || "—"}
                </span>

                <span className="flex-1 truncate text-right">
                  <span className={color}>
                    {m.scored}:{m.missed} ({m.res})
                  </span>
                </span>
              </div>
            );
          })}

          {selected && selected.matches.length === 0 && (
            <div className="text-zinc-500 py-1">
              Матчей против этого соперника пока нет.
            </div>
          )}
        </div>
      </div>
    )}
  </section>
);
}
