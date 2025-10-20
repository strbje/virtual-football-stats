'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, FormEvent } from 'react';

type Props = {
  initial: {
    q?: string;
    team?: string;
    tournament?: string;
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
    role?: string;
  };
  roles: string[]; // список амплуа
};

export default function FiltersClient({ initial, roles }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(initial.q ?? '');
  const [team, setTeam] = useState(initial.team ?? '');
  const [tournament, setTournament] = useState(initial.tournament ?? '');
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [role, setRole] = useState(initial.role ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();

    if (q.trim()) sp.set('q', q.trim());
    if (team.trim()) sp.set('team', team.trim());
    if (tournament.trim()) sp.set('tournament', tournament.trim());
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    if (role) sp.set('role', role);

    router.replace(`${pathname}?${sp.toString()}`);
  }

  function onReset() {
    router.replace(pathname);
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-3 flex-wrap mb-4">
      <input
        placeholder="Ник игрока"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="border px-3 py-2 rounded min-w-56"
      />
      <input
        placeholder="Команда"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        className="border px-3 py-2 rounded min-w-48"
      />
      <input
        placeholder="Турнир"
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
        className="border px-3 py-2 rounded min-w-48"
      />

      {/* Единый датапикер периодом можно позже, пока два поля from/to (YYYY-MM-DD) */}
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="border px-3 py-2 rounded"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="border px-3 py-2 rounded"
      />

      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="border px-3 py-2 rounded"
      >
        <option value="">Амплуа (все)</option>
        {roles.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">Фильтр</button>
      <button type="button" onClick={onReset} className="px-4 py-2 rounded border">Сброс</button>
    </form>
  );
}
