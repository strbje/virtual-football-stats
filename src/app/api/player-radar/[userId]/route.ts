// src/app/api/player-radar/[userId]/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma"; // как в проекте
type ClusterKey = 'FW' | 'AM' | 'FM' | 'CM' | 'CB';
type Params = { params: { userId: string } };

// --- кластеры
const CLUSTERS: Record<ClusterKey, readonly string[]> = {
  FW: ['ФРВ', 'ЦФД', 'ЛФД', 'ПФД', 'ЛФА', 'ПФА'],
  AM: ['ЦАП', 'ЦП', 'ЛЦП', 'ПЦП', 'ЛАП', 'ПАП'],
  FM: ['ЛП', 'ПП'],
  CM: ['ЦП', 'ЦОП', 'ЛЦП', 'ПЦП', 'ЛОП', 'ПОП'],
  CB: ['ЦЗ', 'ЛЦЗ', 'ПЦЗ', 'ЛЗ', 'ПЗ'],
} as const;

const RADAR_BY_CLUSTER = {
  FW: ['goal_contrib','xg_delta','shots_on_target_pct','creation','dribble_pct','pressing'],
  AM: ['xa','pxa','goal_contrib','pass_acc','dribble_pct','pressing'],
  CM: ['creation','passes','pass_acc','def_actions','beaten_rate','aerial_pct'],
  FM: ['creation','passes','pass_acc','def_actions','beaten_rate','aerial_pct','crosses','goal_contrib'],
  CB: ['safety_coef','def_actions','tackle_success','clearances','pass_acc','attack_participation','aerial_pct','beaten_rate'],
} as const;

// вспомогательный список русских подписей
const LABELS: Record<string,string> = {
  goal_contrib: 'Гол+пас',
  xg_delta: 'Реализация xG',
  shots_on_target_pct: 'Удары в створ %',
  creation: 'Созидание',
  dribble_pct: 'Дриблинг %',
  pressing: 'Прессинг',
  xa: 'xA',
  pxa: 'pXA (пасы/0.5 xA)',
  passes: 'Пасы',
  pass_acc: 'Точность пасов %',
  def_actions: 'Защитные действия',
  beaten_rate: 'Beaten Rate ↓',
  aerial_pct: 'Верховые %',
  crosses: 'Навесы (успеш.)',
  safety_coef: 'Кэф безопасности',
  tackle_success: '% удачных отборов',
  clearances: 'Выносы',
  attack_participation: 'Участие в атаке',
};

// сопоставление skill/position -> role code
// используем tbl_field_positions (id -> code)
const ROLE_SQL = `
  SELECT id AS position_id, code
  FROM tbl_field_positions
`;

async function getRoleMap(): Promise<Map<number,string>> {
  const rows: Array<{position_id:number, code:string}> = await prisma.$queryRawUnsafe(ROLE_SQL);
  const map = new Map<number,string>();
  rows.forEach(r => map.set(r.position_id, r.code));
  return map;
}

// актуальное амплуа за 30 матчей (как в player-roles)
const CURRENT_ROLE_SQL = (userId: number) => `
  SELECT fp.code AS role_code
  FROM tbl_users_match_stats s
  JOIN tbl_field_positions fp ON fp.id = s.position_id
  WHERE s.user_id = ${userId}
  ORDER BY s.match_id DESC
  LIMIT 30
`;

function clusterOf(roleCode: string): ClusterKey | null {
  for (const key of Object.keys(CLUSTERS) as ClusterKey[]) {
    const arr = CLUSTERS[key] as readonly string[];
    if (arr.includes(roleCode)) return key;
  }
  return null;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = Number(params.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok:false, error:"bad userId" }, { status:400 });
    }

    // 1) актуальное амплуа => кластер
    const last30: Array<{role_code: string}> = await prisma.$queryRawUnsafe(CURRENT_ROLE_SQL(userId));
    const currentRole = (last30[0]?.role_code ?? null) as string | null;
    const cluster = currentRole ? clusterOf(currentRole) : null;
    if (!cluster) {
      return NextResponse.json({ ok:true, ready:false, reason:"Не удалось определить кластер по актуальному амплуа", currentRole }, { status:200 });
    }

    // 2) агрегируем по кластеру
    //   отбираем строки по позициям, чей role_code ∈ cluster
    //   считаем суммы и derived-метрики; затем превращаем в средние/доли.
    const placeHolders = CLUSTERS[cluster].map(c => `'${c}'`).join(",");
    const AGG_SQL = `
      WITH base AS (
        SELECT
          s.user_id,
          s.match_id,
          -- сырьё
          s.goals, s.assists, s.goals_expected,
          s.kicked, s.kickedin,
          s.passes        AS xa_part,             -- xA
          s.allpasses, s.completedpasses, s.passes_rate,
          s.ipasses, s.pregoal_passes,
          s.allstockes, s.completedstockes,
          s.intercepts,
          s.allselection, s.selection,
          s.completedtackles,
          s.blocks,
          s.outs,
          s.outplayed, s.penalised_fails,
          s.duels_air, s.duels_air_win,
          s.crosses, s.uncrosses
        FROM tbl_users_match_stats s
        JOIN tbl_field_positions fp ON fp.id = s.position_id
        WHERE s.user_id = ${userId} AND fp.code IN (${placeHolders})
      ),
      agg AS (
        SELECT
          COUNT(DISTINCT match_id) AS matches,
          SUM(goals) AS goals, SUM(assists) AS assists,
          SUM(goals_expected) AS xg,
          SUM(kicked) AS kicked, SUM(kickedin) AS kickedin,
          SUM(xa_part) AS xa,
          SUM(allpasses) AS allpasses, SUM(completedpasses) AS completedpasses,
          AVG(passes_rate) AS pass_rate, -- запасной вариант
          SUM(ipasses) AS ipasses, SUM(pregoal_passes) AS pregoals,
          SUM(allstockes) AS allstockes, SUM(completedstockes) AS completedstockes,
          SUM(intercepts) AS intercepts,
          SUM(allselection) AS allselection, SUM(selection) AS selection,
          SUM(completedtackles) AS completedtackles,
          SUM(blocks) AS blocks,
          SUM(outs) AS outs,
          SUM(outplayed) + SUM(penalised_fails) AS beaten,
          SUM(duels_air) AS duels_air, SUM(duels_air_win) AS duels_air_win,
          SUM(crosses) AS crosses
        FROM base
      )
      SELECT
        matches,

        -- FW/AM/FM/CM базовые
        (goals + assists) / NULLIF(matches,0)                        AS goal_contrib,
        (goals - xg) / NULLIF(matches,0)                             AS xg_delta,
        kickedin / NULLIF(kicked,0)                                  AS shots_on_target_pct,
        (pregoals + ipasses + 2*xa) / NULLIF(matches,0)              AS creation,
        completedstockes / NULLIF(allstockes,0)                      AS dribble_pct,
        (intercepts + selection) / NULLIF(matches,0)                 AS pressing,

        xa / NULLIF(matches,0)                                       AS xa_avg,
        0.5 * allpasses / NULLIF(xa,0)                               AS pxa,

        allpasses / NULLIF(matches,0)                                AS passes,
        completedpasses / NULLIF(allpasses,0)                        AS pass_acc,

        (intercepts + selection + completedtackles + blocks) / NULLIF(matches,0) AS def_actions,
        (beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)  AS beaten_rate,
        duels_air_win / NULLIF(duels_air,0)                          AS aerial_pct,

        crosses / NULLIF(matches,0)                                  AS crosses_avg,

        0.5*(completedpasses/NULLIF(allpasses,0))
        +0.3*(completedstockes/NULLIF(allstockes,0))
        +0.15*(duels_air_win/NULLIF(duels_air,0))
        +0.05*(selection/NULLIF(allselection,0))                     AS safety_coef,

        selection / NULLIF(allselection,0)                           AS tackle_success,
        outs / NULLIF(matches,0)                                     AS clearances,
        (ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0) AS attack_participation
      FROM agg
    `;

    const agg: any[] = await prisma.$queryRawUnsafe(AGG_SQL);
    const A = agg[0];
    const matchesCluster = Number(A?.matches ?? 0);
    if (!matchesCluster || matchesCluster < 30) {
      return NextResponse.json({
        ok: true, ready: false, currentRole, cluster, matchesCluster,
        reason: "Недостаточно матчей в кластере (< 30)"
      }, { status:200 });
    }

    // 3) перцентили по кластеру: считаем такие же метрики для всех игроков этого кластера
    //    и используем PERCENT_RANK() по каждой колонке.
    const PCT_SQL = `
      WITH base AS (
        SELECT
          s.user_id,
          s.match_id,
          fp.code AS role_code,
          s.goals, s.assists, s.goals_expected,
          s.kicked, s.kickedin,
          s.passes AS xa_part,
          s.allpasses, s.completedpasses, s.passes_rate,
          s.ipasses, s.pregoal_passes,
          s.allstockes, s.completedstockes,
          s.intercepts,
          s.allselection, s.selection,
          s.completedtackles,
          s.blocks,
          s.outs,
          s.outplayed, s.penalised_fails,
          s.duels_air, s.duels_air_win,
          s.crosses
        FROM tbl_users_match_stats s
        JOIN tbl_field_positions fp ON fp.id = s.position_id
        WHERE fp.code IN (${placeHolders})
      ),
      per_user AS (
        SELECT
          user_id,
          COUNT(DISTINCT match_id) AS matches,
          SUM(goals) AS goals, SUM(assists) AS assists,
          SUM(goals_expected) AS xg,
          SUM(kicked) AS kicked, SUM(kickedin) AS kickedin,
          SUM(xa_part) AS xa,
          SUM(allpasses) AS allpasses, SUM(completedpasses) AS completedpasses,
          SUM(ipasses) AS ipasses, SUM(pregoal_passes) AS pregoals,
          SUM(allstockes) AS allstockes, SUM(completedstockes) AS completedstockes,
          SUM(intercepts) AS intercepts,
          SUM(allselection) AS allselection, SUM(selection) AS selection,
          SUM(completedtackles) AS completedtackles,
          SUM(blocks) AS blocks,
          SUM(outs) AS outs,
          SUM(outplayed) + SUM(penalised_fails) AS beaten,
          SUM(duels_air) AS duels_air, SUM(duels_air_win) AS duels_air_win,
          SUM(crosses) AS crosses
        FROM base
        GROUP BY user_id
        HAVING COUNT(DISTINCT match_id) >= 5 -- чуть-чуть фильтр мусора
      ),
      metrics AS (
        SELECT
          user_id,
          (goals + assists) / NULLIF(matches,0)                         AS goal_contrib,
          (goals - xg) / NULLIF(matches,0)                              AS xg_delta,
          kickedin / NULLIF(kicked,0)                                   AS shots_on_target_pct,
          (pregoals + ipasses + 2*xa) / NULLIF(matches,0)               AS creation,
          completedstockes / NULLIF(allstockes,0)                       AS dribble_pct,
          (intercepts + selection) / NULLIF(matches,0)                  AS pressing,

          xa / NULLIF(matches,0)                                        AS xa_avg,
          0.5 * allpasses / NULLIF(xa,0)                                AS pxa,

          allpasses / NULLIF(matches,0)                                 AS passes,
          completedpasses / NULLIF(allpasses,0)                         AS pass_acc,

          (intercepts + selection + completedtackles + blocks) / NULLIF(matches,0) AS def_actions,
          (beaten) / NULLIF(intercepts + selection + completedtackles + blocks,0)  AS beaten_rate,
          duels_air_win / NULLIF(duels_air,0)                           AS aerial_pct,

          crosses / NULLIF(matches,0)                                   AS crosses_avg,

          0.5*(completedpasses/NULLIF(allpasses,0))
          +0.3*(completedstockes/NULLIF(allstockes,0))
          +0.15*(duels_air_win/NULLIF(duels_air,0))
          +0.05*(selection/NULLIF(allselection,0))                      AS safety_coef,

          selection / NULLIF(allselection,0)                            AS tackle_success,
          outs / NULLIF(matches,0)                                      AS clearances,
          (ipasses + pregoals + 2*(goals + assists)) / NULLIF(matches,0) AS attack_participation
        FROM per_user
      )
      SELECT
        /* percent_rank даёт 0..1 (где 1 — лучший) */
        (SELECT PERCENT_RANK() OVER (ORDER BY goal_contrib) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)      AS p_goal_contrib,
        (SELECT PERCENT_RANK() OVER (ORDER BY xg_delta) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)           AS p_xg_delta,
        (SELECT PERCENT_RANK() OVER (ORDER BY shots_on_target_pct) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1) AS p_shots_on_target_pct,
        (SELECT PERCENT_RANK() OVER (ORDER BY creation) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)           AS p_creation,
        (SELECT PERCENT_RANK() OVER (ORDER BY dribble_pct) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)        AS p_dribble_pct,
        (SELECT PERCENT_RANK() OVER (ORDER BY pressing) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)           AS p_pressing,

        (SELECT PERCENT_RANK() OVER (ORDER BY xa_avg) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)             AS p_xa,
        (SELECT PERCENT_RANK() OVER (ORDER BY pxa) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)                AS p_pxa,

        (SELECT PERCENT_RANK() OVER (ORDER BY passes) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)             AS p_passes,
        (SELECT PERCENT_RANK() OVER (ORDER BY pass_acc) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)           AS p_pass_acc,

        (SELECT PERCENT_RANK() OVER (ORDER BY def_actions) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)        AS p_def_actions,
        (SELECT 1 - PERCENT_RANK() OVER (ORDER BY beaten_rate) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)    AS p_beaten_rate, -- инверсия
        (SELECT PERCENT_RANK() OVER (ORDER BY aerial_pct) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)         AS p_aerial_pct,

        (SELECT PERCENT_RANK() OVER (ORDER BY crosses_avg) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)        AS p_crosses,

        (SELECT PERCENT_RANK() OVER (ORDER BY safety_coef) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)        AS p_safety_coef,
        (SELECT PERCENT_RANK() OVER (ORDER BY tackle_success) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)     AS p_tackle_success,
        (SELECT PERCENT_RANK() OVER (ORDER BY clearances) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1)         AS p_clearances,
        (SELECT PERCENT_RANK() OVER (ORDER BY attack_participation) FROM metrics ORDER BY user_id = ${userId} DESC LIMIT 1) AS p_attack_participation
    `;
    const pct: any[] = await prisma.$queryRawUnsafe(PCT_SQL);
    const P = pct[0] ?? {};

    // 4) собираем ответ под конкретный набор метрик кластера
    const keys = RADAR_BY_CLUSTER[cluster];
    const radar = keys.map(k => {
      const rawKey = (
        k === 'xa' ? 'xa_avg' :
        k === 'crosses' ? 'crosses_avg' : k
      );
      const rawValue = A[rawKey] ?? A[k];
      const pctKey = 'p_' + (k === 'xa' ? 'xa' : k);
      const percentile = P[pctKey] ?? null;
      return { key: k, label: LABELS[k], raw: Number(rawValue ?? 0), pct: percentile !== null ? Math.round(Number(percentile)*100) : null };
    });

    return NextResponse.json({
      ok: true,
      ready: true,
      currentRole,
      cluster,
      matchesCluster,
      radar
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message ?? String(e) }, { status:500 });
  }
}
