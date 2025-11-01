// src/app/players/[userId]/PeriodPickerClient.tsx
"use client";
import Flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function PlayerPeriodPicker({ initialRange }: { initialRange: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (!inputRef.current) return;
    const fp = Flatpickr(inputRef.current, {
      mode: "range",
      dateFormat: "Y-m-d",
      defaultDate: initialRange ? initialRange.split("_to_") : undefined,
      onClose: (dates) => {
        if (dates.length === 2) {
          const [from, to] = dates;
          const qs = new URLSearchParams(sp.toString());
          qs.set("range", `${fmt(from)}_to_${fmt(to)}`);
          router.push(`${pathname}?${qs.toString()}`);
        }
      },
    });
    return () => fp.destroy();
  }, [initialRange, pathname, router, sp]);

  return (
    <input
      ref={inputRef}
      className="h-9 w-[280px] rounded-md border px-3 text-sm"
      placeholder="Период: выберите в календаре"
      defaultValue={initialRange ? initialRange.replace("_to_", " — ") : ""}
      readOnly
    />
  );
}

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
