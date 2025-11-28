"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TournamentOption } from "@/app/teams/[teamId]/loadTeamRoster";

type Props = {
  teamId: number;
  tournaments: TournamentOption[];
  selectedIds: number[];
};

export default function TeamRosterTournamentSelector({
  teamId,
  tournaments,
  selectedIds,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // отсортируем по сезону (по убыванию), затем по названию
  const sorted = useMemo(() => {
    return [...tournaments].sort((a, b) => {
      const sa = a.seasonNumber ?? -9999;
      const sb = b.seasonNumber ?? -9999;
      if (sa !== sb) return sb - sa;
      return a.name.localeCompare(b.name);
    });
  }, [tournaments]);

  const selectedSet = new Set(selectedIds);

  const updateSelection = (id: number, checked: boolean) => {
    const next = new Set(selectedSet);
    if (checked) next.add(id);
    else next.delete(id);

    const nextIds = Array.from(next).sort((a, b) => a - b);

    const qs = new URLSearchParams(searchParams.toString());
    qs.set("tab", "roster");

    if (nextIds.length) {
      qs.set("seasons", nextIds.join(","));
    } else {
      qs.delete("seasons");
    }

    router.push(`/teams/${teamId}?${qs.toString()}`);
  };

  const selectedCount =
    selectedIds.length === tournaments.length ? "все" : selectedIds.length;

  return (
  <div className="relative inline-block w-full">
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="
        flex w-full items-center justify-between 
        rounded-xl border border-zinc-700/40 
        bg-background 
        px-3 py-2 text-xs 
        text-foreground
        hover:bg-zinc-800/30
      "
    >
      <span>Турниры (можно выбрать несколько, статистика суммируется)</span>
      <span className="ml-2 shrink-0 text-[11px] text-zinc-400">
        выбрано: {selectedCount}
      </span>
    </button>

    {open && (
      <div
        className="
          absolute z-30 mt-1 w-full
          rounded-xl border border-zinc-800 
          bg-background
          p-2 shadow-xl
        "
      >
        <div className="max-h-64 overflow-y-auto space-y-1 text-xs">
          {sorted.map((t) => {
            const checked = selectedSet.has(t.id);

            const seasonLabel =
              t.seasonNumber != null ? `${t.seasonNumber} сезон` : "";
            const leagueLabel = t.leagueLabel;

            return (
              <label
                key={t.id}
                className="
                  flex cursor-pointer items-start gap-2 rounded-lg 
                  px-2 py-1 
                  hover:bg-zinc-800/30
                "
                title={t.name}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3 w-3 accent-blue-500"
                  checked={checked}
                  onChange={(e) => updateSelection(t.id, e.target.checked)}
                />

                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-foreground">
                    {t.name}
                  </span>

                  {(seasonLabel || leagueLabel) && (
                    <span className="text-[10px] text-muted-foreground">
                      {seasonLabel}
                      {seasonLabel && leagueLabel ? " · " : ""}
                      {leagueLabel}
                    </span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    )}
  </div>
);
}
