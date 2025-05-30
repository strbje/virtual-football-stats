"use client";

import { Search, Users, Trophy } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Trophy className="h-8 w-8" />
              <h1 className="text-2xl font-bold">Virtual Football Stats</h1>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <Link href="/" className="hover:text-blue-200 transition-colors">
                Главная
              </Link>
              <Link href="/players" className="hover:text-blue-200 transition-colors">
                Игроки
              </Link>
              <Link href="/teams" className="hover:text-blue-200 transition-colors">
                Команды
              </Link>
              <a
                href="https://datalens.yandex/8yfey6ibqf0ou"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-200 transition-colors"
              >
                Дашборд
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
            Поиск игроков и команд
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Введите имя игрока или команды..."
              className="w-full pl-10 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Quick Navigation */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Players Card */}
          <Link href="/players" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">Профили игроков</h3>
                <p className="text-gray-600">Детальная статистика и рейтинги</p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Просмотрите статистику игроков, их рейтинги, сильные и слабые стороны
            </div>
          </Link>

          {/* Teams Card */}
          <Link href="/teams" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-green-100 p-3 rounded-full">
                <Trophy className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">Профили команд</h3>
                <p className="text-gray-600">Составы и информация о командах</p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Изучите составы команд, основную информацию и статистику
            </div>
          </Link>
        </div>

        {/* Sample Players Preview */}
        <div className="mt-12">
          <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">Популярные игроки</h3>
          <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { id: 1, name: "Александр Петров", team: "Динамо Москва", rating: 8.5 },
              { id: 2, name: "Иван Сидоров", team: "Спартак Москва", rating: 8.2 },
              { id: 3, name: "Михаил Козлов", team: "ЦСКА Москва", rating: 8.0 },
            ].map((player) => (
              <Link key={player.id} href={`/player/${player.id}`}>
                <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-semibold">
                        {player.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">{player.name}</h4>
                      <p className="text-sm text-gray-600">{player.team}</p>
                    </div>
                    <div className="text-lg font-bold text-blue-600">
                      {player.rating}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
