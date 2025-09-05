// src/app/drafts/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";

type Params = { params: { id: string } };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// ------- Клиентские мини-формы -------
function RegisterForm({ id }: { id: string }) {
  "use client";
  async function onSubmit(formData: FormData) {
    const gamertag = String(formData.get("gamertag") || "").trim();
    const roles = String(formData.get("roles") || "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const res = await fetch(`/api/drafts/${id}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gamertag, roles }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Ошибка");
      return;
    }
    location.reload();
  }
  return (
    <form action={onSubmit} className="flex gap-2">
      <input name="gamertag" placeholder="Игрок (ник)" className="border rounded px-3 py-2 w-64" />
      <input name="roles" placeholder="Роли (через запятую)" className="border rounded px-3 py-2 w-64" />
      <button className="bg-blue-600 text-white rounded px-3">Добавить</button>
    </form>
  );
}

function CaptainsForm({ id, players }: { id: string; players: any[] }) {
  "use client";
  async function onSubmit(formData: FormData) {
    const selected = formData.getAll("captains").map(String);
    if (selected.length < 2) return alert("Выберите минимум двух капитанов");
    const res = await fetch(`/api/drafts/${id}/captains`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captainIds: selected }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Ошибка");
      return;
    }
    location.reload();
  }
  return (
    <form action={onSubmit} className="space-y-2">
      <select name="captains" multiple className="border rounded p-2 w-full h-40">
        {players.map((p) => (
          <option key={p.id} value={p.id}>{p.gamertag}</option>
        ))}
      </select>
      <button className="bg-blue-600 text-white rounded px-3">Назначить капитанов</button>
    </form>
  );
}

function PickForm({ id, teams, players, pickedIds }: { id: string; teams: any[]; players: any[]; pickedIds: string[] }) {
  "use client";
  async function onSubmit(formData: FormData) {
    const teamId = String(formData.get("teamId") || "");
    const playerId = String(formData.get("playerId") || "");
    const res = await fetch(`/api/drafts/${id}/pick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId, playerId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || "Ошибка");
    location.reload();
  }

  const freePlayers = players.filter((p) => !pickedIds.includes(p.id));

  return (
    <form action={onSubmit} className="flex gap-2 items-center">
      <select name="teamId" className="border rounded p-2">
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select name="playerId" className="border rounded p-2 min-w-52">
        {freePlayers.map((p) => <option key={p.id} value={p.id}>{p.gamertag}</option>)}
      </select>
      <button className="bg-blue-600 text-white rounded px-3">Сделать пик</button>
    </form>
  );
}

function ScheduleBtn({ id }: { id: string }) {
  "use client";
  async function click() {
    const res = await fetch(`/api/drafts/${id}/schedule`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || "Ошибка");
    location.reload();
  }
  return <button onClick={click} className="bg-emerald-600 text-white rounded px-3 py-2">Сгенерировать расписание</button>;
}
// --------------------------------------

export default async function DraftPage({ params }: Params) {
  const { id } = params;
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/drafts/${id}`, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="p-6">
        <div className="text-red-600">Драфт не найден</div>
        <Link href="/drafts" className="text-blue-600 underline">← ко всем драфтам</Link>
      </div>
    );
  }
  const s = await res.json();

  const pickedIds = s?.teams?.flatMap((t: any) => t.players) ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Link href="/drafts" className="text-blue-600 underline">← ко всем драфтам</Link>
      <h1 className="text-2xl font-bold">{s.name}</h1>
      <div className="text-sm text-gray-500">Статус: {s.status}</div>

      <Section title="Регистрация игроков">
        <RegisterForm id={id} />
        <ul className="list-disc pl-5 text-sm">
          {s.registered?.map((p: any) => <li key={p.id}>{p.gamertag} {p.roles?.length ? `(${p.roles.join(", ")})` : ""}</li>)}
        </ul>
      </Section>

      <Section title="Капитаны / Команды">
        <CaptainsForm id={id} players={s.registered || []} />
        <div className="grid md:grid-cols-2 gap-3">
          {s.teams?.map((t: any) => (
            <div key={t.id} className="border rounded p-3">
              <div className="font-semibold mb-2">{t.name}</div>
              <ul className="text-sm list-disc pl-5">
                {t.players.map((pid: string) => {
                  const p = s.registered.find((x: any) => x.id === pid);
                  return <li key={pid}>{p?.gamertag ?? pid}</li>;
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {s.teams?.length > 0 && (
        <Section title="Пики (змейка)">
          <PickForm id={id} teams={s.teams} players={s.registered || []} pickedIds={pickedIds} />
          <ol className="list-decimal pl-5 text-sm">
            {s.picks?.map((pk: any, i: number) => {
              const t = s.teams.find((x: any) => x.id === pk.teamId);
              const p = s.registered.find((x: any) => x.id === pk.playerId);
              return <li key={i}>{t?.name}: {p?.gamertag}</li>;
            })}
          </ol>
        </Section>
      )}

      <Section title="Расписание (каждый с каждым)">
        <ScheduleBtn id={id} />
        <ol className="list-decimal pl-5 text-sm">
          {s.schedule?.map((m: any, i: number) => {
            const h = s.teams.find((x: any) => x.id === m.homeId);
            const a = s.teams.find((x: any) => x.id === m.awayId);
            return <li key={i}>Тур {m.round}: {h?.name} — {a?.name}</li>;
          })}
        </ol>
      </Section>
    </div>
  );
}
