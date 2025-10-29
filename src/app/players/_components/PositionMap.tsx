"use client";
import React from "react";

type Cell = {
  role: string; // например "ЦАП"
  pct: number;  // 0..100 (может быть нецелым)
  cnt?: number; // абсолютное кол-во матчей (необязательно)
};

export function PositionMap({
  data,
  caption = "Карта амплуа (доля матчей за период)",
}: {
  data: Cell[];
  caption?: string;
}) {
  // Сетка 3x4 (как рисовали раньше)
  const GRID: string[][] = [
    ["НАП", "ЦАП", "ПФ"],
    ["ЛФ",  "ПП",  "ЦП"],
    ["ЦОП", "ЛП",  "ЛЗ"],
    ["ЦЗ",  "ПЗ",  "ВРТ"],
  ];

  const byRole = new Map<string, Cell>();
  data.forEach((c) => byRole.set(c.role, c));

  // Функция цвета: 0% = красный, 100% = зелёный (HSL: 0..120)
  const colorFor = (pct: number) => {
    const hue = Math.max(0, Math.min(120, (pct / 100) * 120));
    // насытка/светлость подобраны, можно поиграться при желании
    return `hsl(${hue} 75% 25%)`;
  };

  // Пригодится, чтобы выделить «топ» роль
  const maxPct = data.reduce((m, c) => Math.max(m, c.pct), 0);

  return (
    <section className="rounded-2xl border p-4">
      <div className="text-sm text-gray-500 mb-3">{caption}</div>

      <div className="inline-block rounded-2xl border p-3">
        <div className="grid grid-cols-3 gap-2">
          {GRID.flatMap((row, ri) =>
            row.map((role, ci) => {
              const cell = byRole.get(role);
              const pct = cell?.pct ?? 0;
              const pctText =
                pct >= 10 ? Math.round(pct).toString() : pct > 0 ? pct.toFixed(1) : "";
              const isPeak = Math.abs(pct - maxPct) < 1e-6;

              return (
                <div
                  key={`${ri}-${ci}-${role}`}
                  className="rounded-lg text-center select-none"
                  style={{
                    width: 110,
                    height: 72,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    // фон + «тепло»
                    background: colorFor(pct),
                    // тонкая «подсветка» для ячейки с максимумом
                    boxShadow: isPeak ? "0 0 0 2px rgba(59,130,246,0.9) inset" : "0 0 0 1px rgba(255,255,255,0.08) inset",
                  }}
                  title={`${role}: ${pct.toFixed(1)}%${cell?.cnt != null ? ` (${cell.cnt})` : ""}`}
                >
                  <div className="text-white font-semibold drop-shadow-sm">{role}</div>
                  <div className="text-white/80 text-xs">{pctText && `${pctText}%`}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* (опционально) легенда градиента */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-gray-500">Меньше</span>
        <div
          className="h-2 flex-1 rounded"
          style={{
            background:
              "linear-gradient(90deg, hsl(0 75% 25%) 0%, hsl(60 75% 25%) 50%, hsl(120 75% 25%) 100%)",
          }}
        />
        <span className="text-xs text-gray-500">Больше</span>
      </div>
    </section>
  );
}

export default PositionMap;
