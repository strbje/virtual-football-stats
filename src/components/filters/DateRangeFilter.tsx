"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function DateRangeFilter({ initialRange }: { initialRange: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialRange) return;
    const [a, b] = initialRange.split(":");
    setFrom(a || "");
    setTo(b || "");
  }, [initialRange]);

  const apply = () => {
    const params = new URLSearchParams(sp?.toString());
    const hasFrom = from.trim().length > 0;
    const hasTo = to.trim().length > 0;
    if (hasFrom || hasTo) {
      params.set("range", `${hasFrom ? from : ""}:${hasTo ? to : ""}`);
    } else {
      params.delete("range");
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  const reset = () => {
    setFrom("");
    setTo("");
    const params = new URLSearchParams(sp?.toString());
    params.delete("range");
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
  <div className="flex items-center gap-2">
    <input
      ref={fromRef}
      type="text"
      placeholder="ДД.ММ.ГГГГ"
      className="w-28 rounded-md bg-zinc-900 border border-zinc-700 px-2 py-1 text-sm
                 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
      value={from}
      onChange={(e) => setFrom(e.target.value)}
    />

    <span className="text-zinc-500">—</span>

    <input
      ref={toRef}
      type="text"
      placeholder="ДД.ММ.ГГГГ"
      className="w-28 rounded-md bg-zinc-900 border border-zinc-700 px-2 py-1 text-sm
                 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
      value={to}
      onChange={(e) => setTo(e.target.value)}
    />

    <button
      onClick={apply}
      className="rounded-md border border-zinc-700 px-3 py-1 text-sm 
                 text-zinc-200 hover:bg-zinc-800"
    >
      OK
    </button>

    <button
      onClick={reset}
      className="rounded-md border border-zinc-700 px-3 py-1 text-sm
                 text-zinc-200 hover:bg-zinc-800"
    >
      Сброс
    </button>
  </div>
);
