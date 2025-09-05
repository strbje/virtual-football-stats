// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Virtual Football Stats",
  description: "Статистика игроков и команд • Virtual Football Stats",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-gray-50">
        {/* ЕДИНСТВЕННАЯ ШАПКА САЙТА */}
        <header className="sticky top-0 z-50 bg-blue-600 text-white">
          <div className="mx-auto max-w-7xl px-4 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold whitespace-nowrap">
              🏆 Virtual Football Stats
            </Link>
            <nav className="flex gap-5 text-sm">
              <Link href="/" className="opacity-90 hover:opacity-100">Главная</Link>
              <Link href="/players" className="opacity-90 hover:opacity-100">Игроки</Link>
              <Link href="/teams" className="opacity-90 hover:opacity-100">Команды</Link>
              <Link href="/drafts" className="opacity-90 hover:opacity-100">Драфт</Link>
              <a
                href="https://datalens.yandex/8yfey6ibqf0ou"
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-90 hover:opacity-100"
              >
                Дашборд
              </a>
            </nav>
          </div>
        </header>

        {/* Контент страниц */}
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
