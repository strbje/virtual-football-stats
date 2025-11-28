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
      <div className="text-xs text-zinc-400">
        Недостаточно данных по матчам.
      </div>
    ) : (
      <div className="space-y-3">
        {/* чипы результатов (W/D/L по последним 10 матчам) остаются выше в компоненте */}

        {/* Соперник + поиск + селект + сводка — В ОДНУ ЛИНИЮ */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400">Соперник:</span>

          {/* поиск по названию */}
          <div className="relative">
            <input
              className="vfs-input text-xs min-w-[200px]"
              placeholder="Введите название команды"
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

          {/* селект соперника */}
          <select
  className="vfs-select text-xs min-w-[220px]"
  value={selectedId ?? undefined}
  onChange={(e) => setSelectedId(Number(e.target.value))}
>
  {filteredOpponents.map((o) => {
    const matchesCount = Array.isArray(o.matches) ? o.matches.length : Number(o.matches ?? 0);

    return (
  <div className="space-y-2">
    {/* строка поиска + селектор + сводка */}
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Соперник:</span>

      <input
        type="text"
        className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 min-w-[160px]"
        placeholder="Введите название команды"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <select
        className="rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-100 min-w-[220px]"
        value={selectedId ?? undefined}
        onChange={(e) => setSelectedId(Number(e.target.value))}
      >
        {filteredOpponents.map((o) => (
          <option key={o.opponentId} value={o.opponentId}>
            {o.opponentName} · {o.wins}-{o.draws}-{o.losses} (
            {Array.isArray(o.matches) ? o.matches.length : Number(o.matches ?? 0)}
            )
          </option>
        ))}
      </select>

      {summary && (
        <div className="text-[11px] text-zinc-400">
          {summary.wins}-{summary.draws}-{summary.loses} · мячи{" "}
          {summary.gf}:{summary.ga} ({summary.diffStr})
        </div>
      )}
    </div>

    {/* список матчей с выбранным соперником — оставляем текущую логику,
        можно только слегка подкрутить цвета под тёмную тему */}
    <div className="border-t border-zinc-800 pt-2 max-h-52 overflow-y-auto text-xs">
      {currentMatches.length === 0 ? (
        <div className="text-zinc-500">Нет матчей с выбранным соперником.</div>
      ) : (
        <ul className="space-y-1">
          {currentMatches.map((m, idx) => {
            const color =
              m.res === "W"
                ? "text-emerald-400"
                : m.res === "L"
                ? "text-red-400"
                : "text-zinc-200";

            return (
              <li
                key={`${m.opponentId}-${idx}`}
                className="flex justify-between gap-2"
              >
                <span className="text-zinc-500">
                  {m.date || "—"} · {m.tournament || "Турнир не указан"}
                </span>
                <span className={clsx("font-medium", color)}>
                  {m.scored}:{m.missed} ({m.res})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);
}
