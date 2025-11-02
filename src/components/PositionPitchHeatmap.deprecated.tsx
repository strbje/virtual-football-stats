"use client";

import * as React from "react";
import clsx from "clsx";

type RawRoleDatum = { role: string; count: number };

export type HeatmapProps = {
  /** Сырые данные из БД: short_name амплуа + количество матчей */
  data: RawRoleDatum[];
  /** Ширина полотна в px (высота считается автоматически как 1.5*width) */
  width?: number;
  className?: string;
};

/** Координаты позиций (в процентах по полю 0..100).
 *  Ось X: 0 — левый фланг, 100 — правый; Ось Y: 0 — свои ворота, 100 — чужие.
 *  Добавил самые частые short_name (рус) + несколько алиасов.
 */
const POS: Record<string, { x: number; y: number; label?: string }> = {
  // Вратарь (на всякий)
  "ВРТ": { x: 50, y: 5 },

  // Центральные защитники
  "КЗ": { x: 50, y: 18, label: "ЦЗ" },
  "ЛЦЗ": { x: 38, y: 18 },
  "ПЦЗ": { x: 62, y: 18 },

  // Фуллбеки
  "ЛЗ": { x: 20, y: 22 },
  "ПЗ": { x: 80, y: 22 },

  // Опорники / центр
  "ЦОП": { x: 50, y: 35 },
  "ЛОП": { x: 40, y: 35 },
  "ПОП": { x: 60, y: 35 },

  "ЦП": { x: 50, y: 50 },
  "ЛЦП": { x: 40, y: 50 },
  "ПЦП": { x: 60, y: 50 },

  "ЦАП": { x: 50, y: 62 },
  "ЛАП": { x: 38, y: 62 },
  "ПАП": { x: 62, y: 62 },

  // Крайние полузащитники (LM/RM)
  "ЛП": { x: 25, y: 56 },
  "ПП": { x: 75, y: 56 },

  // Нападающий(е)
  "НАП": { x: 50, y: 78 },
  "ЛН": { x: 40, y: 78 },
  "ПН": { x: 60, y: 78 },
};

/** Нормализация «синонимов».
 *  Если в твоей БД встречается «ФП», а не разделение по флангам,
 *  мы оставим его в центре на высоте вингеров, чтобы не потерять.
 */
function normalizeRole(short: string): string {
  const s = short.trim().toUpperCase();
  if (s === "ФП") return "ЦАП";       // без деления на фланги — ближе к атак. полузащите
  if (s === "ЦД") return "КЗ";        // если где-то сокращают «центральный защитник»
  return s;
}

export default function PositionPitchHeatmap({
  data,
  width = 360, // ~в 6 раз меньше твоего текущего размера
  className,
}: HeatmapProps) {
  const height = Math.round(width * 1.5); // соотношение ~2:3

  const summed = React.useMemo(() => {
    const byRole = new Map<string, number>();
    for (const row of data) {
      const key = normalizeRole(row.role);
      byRole.set(key, (byRole.get(key) ?? 0) + Number(row.count || 0));
    }
    const total = Array.from(byRole.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(byRole.entries())
      .map(([role, count]) => ({
        role,
        count,
        pct: Math.round((count * 100) / total),
      }))
      // показываем роли, у которых есть координаты — остальное игнорируем
      .filter((r) => POS[r.role])
      // крупные проценты вверх списка (чтобы не перекрывались мелочами)
      .sort((a, b) => b.pct - a.pct);
  }, [data]);

  return (
    <div
      className={clsx("relative rounded-xl border bg-zinc-50", className)}
      style={{ width, height }}
    >
      {/* Поле — простое SVG, чтобы красиво и масштабируемо */}
      <svg width={width} height={height} viewBox="0 0 100 150" className="absolute inset-0">
        {/* фон */}
        <rect x="0" y="0" width="100" height="150" rx="3" fill="#E9FFF2" stroke="#C7EED6" />
        {/* центральная линия и круг */}
        <line x1="0" y1="75" x2="100" y2="75" stroke="#C7EED6" strokeWidth="0.6" />
        <circle cx="50" cy="75" r="9" fill="none" stroke="#C7EED6" strokeWidth="0.6" />

        {/* штрафные */}
        <rect x="18" y="0.8" width="64" height="24" fill="none" stroke="#C7EED6" strokeWidth="0.6" />
        <rect x="18" y="125.2" width="64" height="24" fill="none" stroke="#C7EED6" strokeWidth="0.6" />
      </svg>

      {/* бейджи ролей */}
      {summed.map(({ role, pct }) => {
        const { x, y, label } = POS[role];
        // размер бейджа делаем адаптивным к ширине
        const badgeW = Math.max(80, Math.min(140, Math.round(width * 0.38)));
        const badgeH = Math.max(28, Math.min(40, Math.round(width * 0.11)));
        // перевод процентов координат в пиксели
        const left = Math.round((x / 100) * width - badgeW / 2);
        const top = Math.round((y / 100) * height - badgeH / 2);

        return (
          <div
            key={role}
            className="absolute flex items-center justify-center rounded-xl shadow-sm border"
            style={{
              left,
              top,
              width: badgeW,
              height: badgeH,
              background: "linear-gradient(0deg, rgba(16,185,129,0.92), rgba(16,185,129,0.92))",
              color: "white",
              borderColor: "rgba(0,0,0,0.12)",
              fontSize: Math.max(12, Math.min(16, Math.round(width * 0.038))),
              lineHeight: 1,
              padding: "0 10px",
              whiteSpace: "nowrap",
            }}
            title={role}
          >
            {(label ?? role) + " • " + pct + "%"}
          </div>
        );
      })}
    </div>
  );
}
