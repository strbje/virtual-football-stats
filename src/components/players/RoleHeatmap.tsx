// src/components/players/RoleHeatmap.tsx
import React from 'react';
import clsx from "clsx";
import { ROLE_LABELS, type RolePercent, type RoleCode } from '@/utils/roles';


// позиции на поле остаются твоими — ключи должны совпадать с RoleCode из БД
const SLOT_STYLE: Record<RoleCode, React.CSSProperties> = {
  ВРТ: { position:'absolute', left:'50%', bottom: 16, transform:'translateX(-50%)' },

  ЛЗ:  { position:'absolute', left:'18%',  top:'22%' },
  ПЗ:  { position:'absolute', right:'18%', top:'22%' },

  ЛОП: { position:'absolute', left:'38%', top:'35%' },
  ЦОП: { position:'absolute', left:'50%', top:'38%', transform:'translateX(-50%)' },
  ПОП: { position:'absolute', right:'38%', top:'35%' },

  ЛПЦ: { position:'absolute', left:'42%', top:'48%' },
  ЦП:  { position:'absolute', left:'50%', top:'50%', transform:'translateX(-50%)' },
  ПЦП:{ position:'absolute', right:'42%', top:'48%' },

  ЛАП: { position:'absolute', left:'34%', top:'60%' },
  ЛП:  { position:'absolute', left:'28%', top:'66%' },
  ПП:  { position:'absolute', right:'28%', top:'66%' },
  ПАП: { position:'absolute', right:'34%', top:'60%' },

  ЦАП: { position:'absolute', left:'50%', top:'56%', transform:'translateX(-50%)' },

  ФРВ: { position:'absolute', left:'50%', top:'70%', transform:'translateX(-50%)' },
  ЦФД: { position:'absolute', left:'43%', top:'70%' },
  ЛФД: { position:'absolute', right:'43%', top:'70%' },
  ПФД: { position:'absolute', right:'38%', top:'66%' },  // зеркально ЛФД
  ЛФА: { position:'absolute', left:'20%',  top:'64%' },  // широкие и чуть выше
  ПФА: { position:'absolute', right:'20%', top:'64%' },

  // если используешь ЦЗ/ЛЦЗ/ПЦЗ — расставь их здесь
  ЛЦЗ: { position:'absolute', left:'35%', top:'28%' },
  ПЦЗ: { position:'absolute', right:'35%', top:'28%' },
  ЦЗ:  { position:'absolute', left:'50%', top:'26%', transform:'translateX(-50%)' },
};

type Props = { data: RolePercent[]; showBadges?: boolean };

export default function RoleHeatmap({ data, showBadges = false }: Props) {
  // берём только роли, что реально >0%
  const filled = data.filter(d => d.percent > 0);
  if (!filled.length) return null;

  const map = new Map<string, number>(data.map((d) => [d.role, d.percent]));
  const max = Math.max(1, ...data.map((d) => d.percent));

  return (
    <div className="relative w-full max-w-[520px] aspect-[2/3] rounded-2xl border bg-emerald-50/40">
      {/* фон поля можешь оставить свой */}
      {Object.entries(ROLE_COORDS).map(([role, pos]) => {
       const val = map.get(role) ?? 0;
          if (val <= 0) return null; // скрываем 0%
          // Градиент: чем больше % тем насыщеннее метка
          const intensity = Math.max(0.15, val / max); // 0.15..1
          const bg = `hsla(160, 80%, 35%, ${intensity})`; // изумрудный, регулируем прозрачность
          return (
            <div
              key={role}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-sm font-semibold text-white shadow-sm"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: bg }}
              title={`${role} • ${Math.round(val)}%`}
            >
              {role} • {Math.round(val)}%
            </div>
          );
      })}
    </div>
  );
}
