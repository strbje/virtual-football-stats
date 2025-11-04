"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function DateRangeFilter({ initialRange }: { initialRange: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [from, setFrom] = useState<string>("");
  const [to, setTo]   = useState<string>("");

  useEffect(() => {
    if (!initialRange) return;
    const [a, b] = initialRange.split(":");
    setFrom(a || "");
    setTo(b || "");
  }, [initialRange]);

  function apply() {
    const r = [from || "", to || ""].join(":");
    const q = new URLSearchParams(sp?.toString() || "");
    if (from || to) q.set("range", r); else q.delete("range");
    router.replace(`?${q.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1"/>
      <span>—</span>
      <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1"/>
      <button onClick={apply} className="border rounded px-3 py-1 hover:bg-gray-50">OK</button>
    </div>
  );
}
