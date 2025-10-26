"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";

type Initial = {
  q: string;
  team: string;
  tournament: string;
  role: string;     // амплуа
  range: string;    // формат: YYYY-MM-DD:YYYY-MM-DD  (поддерживается и 'YYYY-MM-DD..YYYY-MM-DD')
};

export default function FiltersClient({
  initial,
  roles,
}: {
  initial: Initial;
  roles: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // поля
  const qRef = useRef<HTMLInputElement>(null);
  const teamRef = useRef<HTMLInputElement>(null);
  const tournRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);

  const [fp, setFp] = useState<Flatpickr.Instance | null>(null);

  // распарсим initial.range в from/to для дефолта календаря
  const { fromDefault, toDefault } = useMemo(() => {
    if (!initial?.range) return { fromDefault: "", toDefault: "" };
    const raw = initial.range.replace("..", ":");
    const [f, t] = raw.split(":");
    return { fromDefault: f || "", toDefault: t || "" };
  }, [initial?.range]);

  // инициализация flatpickr один раз
  useEffect(() => {
    if (!rangeRef.current) return;

    const defaultDates: string[] = [];
    if (fromDefault) defaultDates.push(fromDefault);
    if (toDefault) defaultDates.push(toDefault);

    const inst = Flatpickr(rangeRef.current, {
      mode: "range",
      dateFormat: "Y-m-d",
      defaultDate: defaultDates.length ? defaultDates : undefined,
      allowInput: true,
    });

    setFp(inst);
    return () => inst.destroy();
  }, [rangeRef, fromDefault, toDefault]);

  // форматтер для параметров
  const buildQuery = () => {
    const params = new URLSearchParams(sp?.toString() || "");

    const q = qRef.current?.value?.trim() || "";
    const team = teamRef.current?.value?.trim() || "";
    const tournament = tournRef.current?.value?.trim() || "";
    const role = roleRef.current?.value || "";

    if (q) params.set("q", q); else params.delete("q");
    if (team) params.set("team", team); else params.delete("team");
    if (tournament) params.set("tournament", tournament); else params.delete("tournament");
    if (role) params.set("role", role); else params.delete("role");

    // читаем выбранные даты из flatpickr
    const sel = fp?.selectedDates || [];
    let from = "";
    let to = "";
    if (sel[0]) from = toISO(sel[0]);
    if (sel[1]) to = toISO(sel[1]);
    // если выбран только один день — считаем его и from, и to
    if (from && !to) to = from;

    if (from && to) {
      params.set("range", `${from}:${to}`);
    } else {
      params.delete("range");
    }

    return params;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = buildQuery();
    router.push(`/players?${params.toString()}`);
  };

  const onReset = () => {
    qRef.current && (qRef.current.value = "");
    teamRef.current && (teamRef.current.value = "");
    tournRef.current && (tournRef.current.value = "");
    if (roleRef.current) roleRef.current.value = "";
    fp?.clear();
    router.push("/players");
  };

  return (
    <form onSubmit={onSubmit} className="mb-4 flex flex-wrap gap-3 items-start">
      <input
        ref={qRef}
        defaultValue={initial.q}
        className="border px-3 py-2 rounded w-64"
        placeholder="Игрок"
      />
      <input
        ref={teamRef}
        defaultValue={initial.team}
        className="border px-3 py-2 rounded w-64"
        placeholder="Команда"
      />
      <input
        ref={tournRef}
        defaultValue={initial.tournament}
        className="border px-3 py-2 rounded w-64"
        placeholder="Турнир"
      />

      <select
        ref={roleRef}
        defaultValue={initial.role || ""}
        className="border px-3 py-2 rounded"
      >
        <option value="">Амплуа: любое</option>
        {roles.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* ЕДИНЫЙ date-range с календарём */}
      <input
        ref={rangeRef}
        className="border px-3 py-2 rounded w-64"
        placeholder="Период: выберите в календаре"
        // показываем пользователю человекочитаемую подпись
        defaultValue={
          fromDefault && toDefault ? `${fromDefault} — ${toDefault}` : ""
        }
        readOnly
      />

      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
      >
        Показать
      </button>
      <button
        type="button"
        onClick={onReset}
        className="border px-4 py-2 rounded"
      >
        Сбросить
      </button>
    </form>
  );
}

function toISO(d: Date): string {
  // YYYY-MM-DD в локали UTC, чтобы не ловить сдвиги
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
