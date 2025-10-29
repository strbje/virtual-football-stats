// src/app/players/[userId]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

// searchParams могут быть строкой, массивом или undefined
type SearchParams = Record<string, string | string[] | undefined>;
type MaybePromise<T> = T | Promise<T>;

function getParam(sp: SearchParams, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function parseRange(range?: string): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range.split(":").map((s) => s?.trim()).filter(Boolean);
  return {
    from: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined,
    to: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined,
  };
}

// Небольшой helper: разворачивает значение или промис
async function unwrap<T>(v: MaybePromise<T>): Promise<T> {
  // @ts-expect-error — безопасно проверяем наличие then у возможного промиса
  return typeof v === "object" && v !== null && "then" in v ? await (v as Promise<T>) : (v as T);
}

export const dynamic = "force-dynamic";

interface Props {
  params: MaybePromise<{ userId: string }>;
  searchParams?: MaybePromise<SearchParams>;
}

export default async function PlayerPage(props: Props) {
  const { userId } = await unwrap(props.params);
  const sp = props.searchParams ? await unwrap(props.searchParams) : {};
  const range = getParam(sp, "range");
  const { from, to } = parseRange(range);

  const userIdNum = Number(userId);
  if (!Number.isFinite(userIdNum)) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Неверный ID игрока</h1>
        <Link href="/players" className="text-blue-600 hover:underline">
          ← Вернуться к списку игроков
        </Link>
      </div>
    );
  }

  // Игрок
  const userRow =
    (
      await prisma.$queryRawUnsafe<{ id: number; gamertag: string; username: string }[]>(
        `
        SELECT u.id, u.gamertag, u.username
        FROM tbl_users u
        WHERE u.id = ?
        LIMIT 1
      `,
        userIdNum
      )
    )[0] ?? null;

  // Фильтры для ролей
  const rolesWhere: string[] = ["ums.user_id = ?"];
  const rolesParams: any[] = [userIdNum];

  if (from) {
    rolesWhere.push("tm.timestamp >= UNIX_TIMESTAMP(?)");
    rolesParams.push(`${from} 00:00:00`);
  }
  if (to) {
    rolesWhere.push("tm.timestamp <= UNIX_TIMESTAMP(?)");
    rolesParams.push(`${to} 23:59:59`);
  }

  const roles = await prisma.$queryRawUnsafe<{ role: string; appearances: number }[]>(
    `
    SELECT sp.short_name AS role, COUNT(*) AS appearances
    FROM tbl_users_match_stats ums
    INNER JOIN skills_positions sp ON ums.skill_id = sp.id
    INNER JOIN tournament_match tm  ON ums.match_id = tm.id
    WHERE ${rolesWhere.join(" AND ")}
    GROUP BY sp.short_name
    ORDER BY appearances DESC, sp.short_name ASC
  `,
    ...rolesParams
  );

  // Общее число матчей в диапазоне
  const totalPlayedRow =
    (
      await prisma.$queryRawUnsafe<{ total: number }[]>(
        `
        SELECT COUNT(*) AS total
        FROM tbl_users_match_stats ums
        INNER JOIN tournament_match tm ON ums.match_id = tm.id
        WHERE ums.user_id = ?
          ${from ? "AND tm.timestamp >= UNIX_TIMESTAMP(?)" : ""}
          ${to ? "AND tm.timestamp <= UNIX_TIMESTAMP(?)" : ""}
      `,
        from && to
          ? [userIdNum, `${from} 00:00:00`, `${to} 23:59:59`]
          : from
          ? [userIdNum, `${from} 00:00:00`]
          : to
          ? [userIdNum, `${to} 23:59:59`]
          : [userIdNum]
      )
    )[0] ?? { total: 0 };

  const totalPlayed = totalPlayedRow.total ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Link
          href={`/players${range ? `?range=${range}` : ""}`}
          className="text-blue-600 hover:underline"
        >
          ← Назад к игрокам
        </Link>
        {userRow ? (
          <h1 className="text-2xl font-semibold">
            {userRow.gamertag}{" "}
            <span className="text-gray-500 text-base">(@{userRow.username})</span>
          </h1>
        ) : (
          <h1 className="text-2xl font-semibold">Игрок #{userIdNum}</h1>
        )}
      </div>

      <p className="text-sm text-gray-600">
        Диапазон: {from ? from : "—"} — {to ? to : "—"} · Матчей в выборке: {totalPlayed}
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-[560px] border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Роль (как в БД)</th>
              <th className="py-2 pr-4">Матчей</th>
              <th className="py-2 pr-4">% от сыгранных</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, idx) => {
              const pct =
                totalPlayed > 0 ? ((r.appearances / totalPlayed) * 100).toFixed(1) : "0.0";
              return (
                <tr key={`${r.role}-${idx}`} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">{r.role}</td>
                  <td className="py-2 pr-4">{r.appearances}</td>
                  <td className="py-2 pr-4">{pct}%</td>
                </tr>
              );
            })}
            {roles.length === 0 && (
              <tr>
                <td className="py-3 text-gray-500" colSpan={3}>
                  Нет матчей в выбранном диапазоне.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Здесь можно подключить нормализатор ролей (ЦФ/ЛФД/...) */}
    </div>
  );
}
