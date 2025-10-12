// src/app/drafts/[id]/page.tsx
export const dynamic = 'force-dynamic';
// @ts-nocheck

export default async function DraftPage({
  params,
}: {
  // В Next 15 params — Promise
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="container mx-auto p-6 space-y-3">
      <h1 className="text-2xl font-bold">Драфт {id}</h1>
      <p className="text-gray-600">Раздел «Драфты» временно отключён. Сосредотачиваемся на вкладке «Игроки».</p>
    </div>
  );
}
