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
      <div className="text-xs text-zinc-500">
        Недостаточно данных по матчам.
      </div>
    ) : (
      <div className="space-y-3">
        {/* строка фильтра по сопернику — всё в один ряд */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] text-zinc-500">Соперник:</span>

          {/* поиск по названию команды */}
          <input
            className="vfs-input h-8 text-xs min-w-[180px]"
            placeholder="Введите название команды"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);

              // если ввели точное имя — выбираем соперника сразу
              const exact = opponents.find(
                (o) => o.opponentName.toLowerCase() === v.toLowerCase(),
              );
              if (exact) {
                setSelectedId(exact.opponentId);
              }
            }}
          />

          {/* селект соперников, как на старом скрине */}
          <select
  className="vfs-select h-8 text-xs min-w-[220px]"
  value={selectedId ?? ""}
  onChange={(e) => {
    const id = Number(e.target.value);
    setSelectedId(Number.isNaN(id) ? null : id);
  }}
>
  {filteredOpponents.map((o) => (
    <option key={o.opponentId} value={o.opponentId}>
      {o.opponentName} — {o.wins}-{o.draws}-{o.losses} ({o.matches.length})
    </option>
  ))}
</select>

          {/* сводка W-D-L и мячи — в той же строке */}
          {selected && (
            <span className="ml-2 text-[11px] text-zinc-400 whitespace-nowrap">
              {summary.wins}-{summary.draws}-{summary.losses} · мячи{" "}
              {summary.gf}:{summary.ga} (
              {summary.diff >= 0 ? "+" : ""}
              {summary.diff})
            </span>
          )}
        </div>

        {/* список матчей против выбранного соперника */}
        <div className="max-h-44 overflow-y-auto mt-1 border-t border-zinc-800/70 pt-2 text-xs">
          {selected?.matches.length ? (
            selected.matches.map((m, idx) => {
              let color = "text-zinc-300";
              if (m.res === "W") color = "text-emerald-400";
              else if (m.res === "L") color = "text-red-400";

              return (
                <div
                  key={idx}
                  className="flex justify-between gap-3 py-0.5"
                  title={m.opponentName}
                >
                  <span className="text-zinc-500">
                    {m.date || "—"} · {m.tournament || "Турнир не указан"}
                  </span>
                  <span className={color}>
                    {m.scored}:{m.missed} ({m.res})
                  </span>
                </div>
              );
            })
          ) : (
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
