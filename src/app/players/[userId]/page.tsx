// src/app/players/[userId]/page.tsx
import type { PageProps } from 'next';
import Link from 'next/link';

// Если у вас есть server-only код (Prisma и т.п.), можно подключить здесь:
// import { prisma } from '@/lib/prisma'; // пример

type Params = { userId: string };
type Search = Record<string, string | string[] | undefined>;

/**
 * Next 15: params — это Promise. Поэтому достаём userId через await.
 */
export default async function PlayerPage(
  { params, searchParams }: PageProps<Params, Search>
) {
  const { userId } = await params;

  // ----- ВАША ЛОГИКА (пример) -----
  // Пример: если будете тянуть данные — делайте это тут.
  // const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  // if (!user) notFound();

  // Любые query из URL при желании:
  // const tab = Array.isArray(searchParams?.tab) ? searchParams?.tab[0] : searchParams?.tab;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Player profile</h1>
        <Link href="/players" className="text-sm text-blue-600 hover:underline">
          ← Back to players
        </Link>
      </div>

      <section className="rounded-2xl border p-6">
        <p className="text-sm text-gray-500 mb-2">User ID</p>
        <div className="text-lg font-mono">{userId}</div>

        {/* Пример места под ваши данные:
        <div className="mt-6 space-y-2">
          <div><b>Name:</b> {user.name}</div>
          <div><b>Games:</b> {user._count.games}</div>
          ...
        </div>
        */}
      </section>
    </main>
  );
}
