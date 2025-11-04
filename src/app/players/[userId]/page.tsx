// src/app/players/[userId]/page.tsx
import { notFound } from "next/navigation";
import RoleDistributionSection from "@/components/players/RoleDistributionSection";
import RoleHeatmap from "@/components/players/RoleHeatmap";
import {
  ROLE_LABELS,
  HEATMAP_ROLES_ORDER,
  type RoleCode,
  type RolePercent,
  groupRolePercents,
  rolePercentsFromAppearances,
  currentRoleFromLastN,
  toLeagueBuckets,
} from "@/utils/roles";

export const dynamic = "force-dynamic";

type Player = {
  id: string;               // ВАЖНО: строка, не number
  nickname: string;
  team?: string | null;
  // список фактических ролей по матчам в хронологическом порядке
  rolesByMatch: RoleCode[];
  // для второго барчарта: [{label, percent}]
  leagues?: { label: string; percent: number }[];
  // быстрые агрегаты
  matches: number;
  goals?: number;
  assists?: number;
};

// заглушка под твоё реальное получение данных (привяжи к Prisma/REST)
async function fetchPlayer(userId: string): Promise<Player | null> {
  // TODO: заменить на реальный вызов БД/API
  return null;
}

type PageProps = { params: { userId: string } };

export default async function PlayerPage({ params }: PageProps) {
  // НЕ парсим в число — id строковый
  const userId = params.userId;
  const player = await fetchPlayer(userId);

  if (!player) return notFound();

  // 1) доли по ролям — строго из появлений (исходные роли по матчам)
  const rolePercents: RolePercent[] = rolePercentsFromAppearances(player.rolesByMatch);

  // 2) сгруппированные доли для барчарта "Защ/Полузащ/Атака/Вратарь"
  const grouped = groupRolePercents(rolePercents);

  // 3) «текущее амплуа» по последним 30 матчам
  const currentRole = currentRoleFromLastN(player.rolesByMatch, 30);

  // 4) лиги
  const leagueBuckets = toLeagueBuckets(player.leagues ?? []);

  // 5) данные для тепловой: массив {role, percent} по всем ролям в фиксированном порядке
  const heatmap: { role: RoleCode; percent: number }[] = HEATMAP_ROLES_ORDER.map((r) => {
    const found = rolePercents.find((x) => x.role === r);
    return { role: r, percent: found ? found.percent : 0 };
  });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      {/* Заголовок */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {player.nickname ?? `User #${player.id}`}
        </h1>
        <div className="text-sm text-zinc-500">
          {player.team ? player.team : null}
        </div>
      </div>

      {/* Верхние карточки */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Матчи</div>
          <div className="text-2xl font-semibold tabular-nums">{player.matches}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Голы</div>
          <div className="text-2xl font-semibold tabular-nums">{player.goals ?? 0}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Передачи</div>
          <div className="text-2xl font-semibold tabular-nums">{player.assists ?? 0}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-zinc-500">Актуальное амплуа (30 матчей)</div>
          <div className="text-2xl font-semibold">
            {currentRole ? ROLE_LABELS[currentRole] : "—"}
          </div>
        </div>
      </section>

      {/* Распределение + Лиги */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:max-w-[1100px]">
        <RoleDistributionSection
          roles={grouped}           // бар «группы амплуа»
          leagues={leagueBuckets}   // бар «лиги»
          widthPx={500}
          tooltip
        />
      </section>

      {/* Тепловая по амплуа — все позиции, включая ФРВ */}
      <section className="md:max-w-[1100px]">
        <div className="text-sm font-semibold mb-2">Тепловая карта амплуа</div>
        <RoleHeatmap
          data={heatmap} // [{role, percent}] для всех RoleCode
        />
      </section>
    </div>
  );
}
