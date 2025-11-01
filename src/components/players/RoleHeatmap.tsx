'use client';
import React from 'react';
import { RolePercent } from '@/utils/roles';

// Координаты (в %) для каждого амплуа. Центр поля = (50, 50)
const POS: Record<string, {x:number; y:number}> = {
  // Защита
  'ЛЗ':{x:22,y:28}, 'ПЗ':{x:78,y:28},
  'ЛЦЗ':{x:42,y:33}, 'ЦЗ':{x:50,y:33}, 'ПЦЗ':{x:58,y:33},
  // Опорная зона
  'ЛОП':{x:43,y:44}, 'ЦОП':{x:50,y:44}, 'ПОП':{x:57,y:44},
  // Центр поля
  'ЛПЦ':{x:46,y:53}, 'ЦП':{x:50,y:53}, 'ПЦП':{x:54,y:53},
  // Фланги/крылья
  'ЛП':{x:30,y:60}, 'ПП':{x:70,y:60},
  'ЛАП':{x:42,y:66}, 'ЦАП':{x:50,y:62}, 'ПАП':{x:58,y:66},
  // Атака
  'ЛФД':{x:46,y:78}, 'ЦФД':{x:50,y:82}, 'ПФД':{x:54,y:78}, 'ФРВ':{x:50,y:86},
  // Вратарь
  'ВРТ':{x:50,y:96},
};

type Props = {
  data: RolePercent[]; // [{ role:'ЦАП', percent: 21 }, ...] — по всем ролям
  showBadges?: boolean; // метки с текстом поверх
};

export default function RoleHeatmap({ data, showBadges = false }: Props) {
  // нормируем под максимум, чтобы получить относительную «жаркость»
  const max = Math.max(1, ...data.map(d => d.percent));
  // соберём набор всех ролей, чтобы даже 0% были видны
  const allRoles = Array.from(new Set([...Object.keys(POS), ...data.map(d=>d.role)]));
  const byRole = Object.fromEntries(data.map(d => [d.role, d.percent]));

  return (
    <div className="w-full">
      <div className="relative mx-auto aspect-[2/3] max-w-md rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-sm overflow-hidden">
        {/* Разметка поля (ворота/штрафные) — просто декор */}
        <PitchLines/>
        {/* Тепловые пятна */}
        {allRoles.map(role => {
          const p = byRole[role] ?? 0;
          const pos = POS[role] ?? {x:50,y:50};
          // размер «пятна» и непрозрачность от процента
          const intensity = Math.max(0.12, Math.min(0.9, p / max)); // 0.12..0.9
          const size = 60 + (p / max) * 80; // px

          return (
            <div key={role}
              className="absolute pointer-events-none"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '9999px',
                background: `radial-gradient(circle, rgba(16,185,129,${0.65*intensity}) 0%, rgba(16,185,129,${0.25*intensity}) 45%, rgba(16,185,129,0) 70%)`,
                filter: 'blur(6px)',
              }}
            />
          );
        })}

        {/* Подписи-«бэйджи» (по желанию) */}
        {showBadges && allRoles.map(role => {
          const p = byRole[role] ?? 0;
          const pos = POS[role] ?? {x:50,y:50};
          return (
            <div key={`${role}-badge`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-600 text-white text-xs px-2 py-1 shadow"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {role} • {Math.round(p)}%
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PitchLines() {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 150" preserveAspectRatio="none">
      <rect x="0.5" y="0.5" width="99" height="149" rx="4" ry="4" fill="none" stroke="#a7f3d0" strokeWidth="1"/>
      <line x1="0" y1="75" x2="100" y2="75" stroke="#a7f3d0" strokeWidth="0.7"/>
      {/* штрафные зоны */}
      <rect x="18" y="0.5" width="64" height="22" fill="none" stroke="#a7f3d0" strokeWidth="0.7"/>
      <rect x="18" y="127.5" width="64" height="22" fill="none" stroke="#a7f3d0" strokeWidth="0.7"/>
      {/* маленькие штрафные */}
      <rect x="32" y="0.5" width="36" height="8" fill="none" stroke="#a7f3d0" strokeWidth="0.7"/>
      <rect x="32" y="141.5" width="36" height="8" fill="none" stroke="#a7f3d0" strokeWidth="0.7"/>
      {/* центровой круг */}
      <circle cx="50" cy="75" r="7.5" fill="none" stroke="#a7f3d0" strokeWidth="0.7"/>
      {/* точки вратарей (декор) */}
      <circle cx="50" cy="6" r="0.7" fill="#a7f3d0"/>
      <circle cx="50" cy="144" r="0.7" fill="#a7f3d0"/>
    </svg>
  );
}
