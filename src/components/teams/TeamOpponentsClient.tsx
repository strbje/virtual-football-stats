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
  <section className="vfs-card p-4">
    <h3 className="text-sm font-semibold text-foreground mb-3">
      Форма (10 последних официальных матчей)
    </h3>

    {opponents.length === 0 ? (
      <div className="text-xs text-muted-foreground">
        Недостаточно данных по матчам.
      </div>
    ) : (
      <div className="space-y-3">
        {/* Чипы результатов остаются сверху как в твоём коде — этот блок выше по файлу */}

        {/* Соперник + поиск + сводка W/D/L и разница мячей — В ОДНУ СТРОКУ, как было */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Соперник:</span>
            <div className="relative">
              <input
                className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs min-w-[220px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Начните вводить команду"
                list="team-opponents-list"
                value={inputValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);

                  // Если ввели точное имя — сразу выбираем соперника
                  const exact = opponents.find(
                    (o) =>
                      o.opponentName.toLowerCase() === v.toLowerCase(),
                  );
                  if (exact) {
                    setSelectedId(exact.opponentId);
                  }
                }}
              />

              <datalist id="team-opponents-list">
                {filteredOpponents.map((o) => (
                  <option
                    key={o.opponentId}
                    value={o.opponentName}
                  />
                ))}
              </datalist>
            </div>
          </div>

          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300">
                W {summary.wins}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200">
                D {summary.draws}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">
                L {summary.losses}
              </span>
              <span className="ml-2 text-zinc-300">
                Голы: {summary.gf}:{summary.ga}{" "}
                <span className="font-semibold">
                  ({summary.diff >= 0 ? "+" : ""}
                  {summary.diff})
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Список матчей против выбранного соперника с прокруткой */}
        <div className="max-h-44 overflow-y-auto mt-2 border-t border-zinc-800 pt-2 text-xs text-zinc-300">
          {selected?.matches.map((m, idx) => {
            let color = "text-zinc-200";
            if (m.res === "W") color = "text-emerald-400";
            else if (m.res === "L") color = "text-red-400";

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
