// src/app/drafts/[id]/page.tsx
export const dynamic = "force-dynamic";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { useRouter } from "next/navigation";

import type { DraftPlayer, DraftSession, DraftTeam } from "@/lib/store";

// Абсолютный URL для серверных fetch
async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/* ---------- Клиентские мини-компоненты ---------- */
function RegisterForm({ id }: { id: string }) {
  "use client";
  const router = useRouter();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
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
      const errorResponse = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(errorResponse?.error || "Ошибка");
      return;
    }
    event.currentTarget.reset();
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input name="gamertag" placeholder="Игрок (ник)" className="border rounded px-3 py-2 w-64" />
      <input name="roles" placeholder="Роли (через запятую)" className="border rounded px-3 py-2 w-64" />
      <button className="bg-blue-600 text-white rounded px-3">Добавить</button>
    </form>
  );
}

function CaptainsForm({ id, players }: { id: string; players: DraftPlayer[] }) {
  "use client";
  const router = useRouter();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const selected = formData.getAll("captains").map(String);
    if (selected.length < 2) return alert("Выберите минимум двух капитанов");

    const res = await fetch(`/api/drafts/${id}/captains`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captainIds: selected }),
    });
    if (!res.ok) {
      const errorResponse = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(errorResponse?.error || "Ошибка");
      return;
    }
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <select name="captains" multiple className="border rounded p-2 w-full h-40">
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.gamertag}
          </option>
        ))}
      </select>
      <button className="bg-blue-600 text-white rounded px-3">Назначить капитанов</button>
    </form>
  );
}

function PickForm({
  id,
  teams,
  players,
  pickedIds,
}: {
  id: string;
  teams: DraftTeam[];
  players: DraftPlayer[];
  pickedIds: string[];
}) {
  "use client";
  const router = useRouter();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const teamId = String(formData.get("teamId") || "");
    const playerId = String(formData.get("playerId") || "");
    const res = await fetch(`/api/drafts/${id}/pick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId, playerId }),
    });
    const errorResponse = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return alert(errorResponse?.error || "Ошибка");
    router.refresh();
  }

  const freePlayers = players.filter((p) => !pickedIds.includes(p.id));

  return (
    <form onSubmit={onSubmit} className="flex gap-2 items-center">
      <select name="teamId" className="border rounded p-2">
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select name="playerId" className="border rounded p-2 min-w-52">
        {freePlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.gamertag}
          </option>
        ))}
      </select>
      <button className="bg-blue-600 text-white rounded px-3">Сделать пик</button>
    </form>
  );
}

function ScheduleBtn({ id }: { id: string }) {
  "use client";
  const router = useRouter();
  async function click() {
    const res = await fetch(`/api/drafts/${id}/schedule`, { method: "POST" });
    const errorResponse = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return alert(errorResponse?.error || "Ошибка");
    router.refresh();
  }
  return (
    <button onClick={click} className="bg-emerald-600 text-white rounded px-3 py-2">
      Сгенерировать расписание
    </button>
  );
}
/* ------------------------------------------------ */

type DraftPageParams = { id: string };
type DraftPageProps = { params: DraftPageParams | Promise<DraftPageParams> };

export default async function DraftPage({ params }: DraftPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id ?? "";

  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/drafts/${id}`, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="p-6">
        <div className="text-red-600">Драфт не найден</div>
        <Link href="/drafts" className="text-blue-600 underline">
          ← ко всем драфтам
        </Link>
      </div>
    );
  }
  const session = (await res.json()) as DraftSession;

  const pickedIds = session.teams.flatMap((team) => team.players);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Link href="/drafts" className="text-blue-600 underline">
        ← ко всем драфтам
      </Link>
      <h1 className="text-2xl font-bold">{session.name}</h1>
      <div className="text-sm text-gray-500">Статус: {session.status}</div>

      <Section title="Регистрация игроков">
        <RegisterForm id={id} />
        <ul className="list-disc pl-5 text-sm">
          {session.registered.map((player) => (
            <li key={player.id}>
              {player.gamertag} {player.roles.length ? `(${player.roles.join(", ")})` : ""}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Капитаны / Команды">
        <CaptainsForm id={id} players={session.registered} />
        <div className="grid md:grid-cols-2 gap-3">
          {session.teams.map((team) => (
            <div key={team.id} className="border rounded p-3">
              <div className="font-semibold mb-2">{team.name}</div>
              {(team.draftOrder !== undefined || team.captainId) && (
                <div className="text-sm text-gray-500 mb-2 flex flex-col gap-1">
                  {team.draftOrder !== undefined && (
                    <span>
                      Порядок пика: <strong>#{team.draftOrder}</strong>
                    </span>
                  )}
                  {team.captainId && (
                    <span>
                      Капитан: {session.registered.find((player) => player.id === team.captainId)?.gamertag ?? team.captainId}
                    </span>
                  )}
                </div>
              )}
              <ul className="text-sm list-disc pl-5">
                {team.players.map((playerId) => {
                  const player = session.registered.find((registered) => registered.id === playerId);
                  return <li key={playerId}>{player?.gamertag ?? playerId}</li>;
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {session.teams.length > 0 && (
        <Section title="Пики (змейка)">
          <PickForm id={id} teams={session.teams} players={session.registered} pickedIds={pickedIds} />
          <ol className="list-decimal pl-5 text-sm">
            {session.picks.map((pick, index) => {
              const team = session.teams.find((existingTeam) => existingTeam.id === pick.teamId);
              const player = session.registered.find((registered) => registered.id === pick.playerId);
              return (
                <li key={`${pick.teamId}-${pick.playerId}-${pick.ts}-${index}`}>
                  {team?.name}: {player?.gamertag}
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      <Section title="Расписание (каждый с каждым)">
        <ScheduleBtn id={id} />
        <ol className="list-decimal pl-5 text-sm">
          {session.schedule.map((match, index) => {
            const home = session.teams.find((existingTeam) => existingTeam.id === match.homeId);
            const away = session.teams.find((existingTeam) => existingTeam.id === match.awayId);
            return (
              <li key={`${match.homeId}-${match.awayId}-${match.round}-${index}`}>
                Тур {match.round}: {home?.name} — {away?.name}
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}
