// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-blue-600 text-white">
          <div className="container mx-auto px-4 py-4">
            <nav className="hidden md:flex items-center space-x-6">
              <Link href="/" className="hover:text-blue-200">Главная</Link>
              <Link href="/players" className="hover:text-blue-200">Игроки</Link>
              <Link href="/teams" className="hover:text-blue-200">Команды</Link>
              <a
                href="https://datalens.yandex/8yfey6ibqf0ou"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-200"
              >
                Дашборд
              </a>
              {/* ↓ новый пункт меню */}
              <Link href="/drafts" className="hover:text-blue-200">Драфт</Link>
            </nav>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
