"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import {
  CalendarDaysIcon,
  CheckBadgeIcon,
  ChevronLeftIcon,
  ClockIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useAnimeData } from '@/hooks/useAnimeData';
import { useHistoryData } from '@/hooks/useHistoryData';
import { AnimeRecord, statusLabels } from '@/lib/dashboard-types';

type SeasonName = '冬' | '春' | '夏' | '秋';

interface SeasonBucket {
  key: string;
  year: number;
  season: SeasonName;
  seasonOrder: number;
  count: number;
  finished: number;
  scoreAvg: number | null;
  examples: AnimeRecord[];
}

function parsePremiere(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function seasonFromMonth(month: number): { season: SeasonName; seasonOrder: number } {
  if (month <= 2) return { season: '冬', seasonOrder: 0 };
  if (month <= 5) return { season: '春', seasonOrder: 1 };
  if (month <= 8) return { season: '夏', seasonOrder: 2 };
  return { season: '秋', seasonOrder: 3 };
}

function formatMonthKey(key: string) {
  const [year, month] = key.split('-');
  return `${year}年${Number(month)}月`;
}

export default function AnimeSeasonsPage() {
  const { parsedHistory, isLoading: historyLoading } = useHistoryData();
  const { animeList, isLoading: animeLoading } = useAnimeData(parsedHistory);

  const seasonBuckets = useMemo<SeasonBucket[]>(() => {
    const map = new Map<string, {
      year: number;
      season: SeasonName;
      seasonOrder: number;
      count: number;
      finished: number;
      scoreTotal: number;
      scoreCount: number;
      examples: AnimeRecord[];
    }>();

    animeList.forEach((anime) => {
      const premiere = parsePremiere(anime.premiereDate);
      if (!premiere) return;

      const year = premiere.getFullYear();
      const { season, seasonOrder } = seasonFromMonth(premiere.getMonth());
      const key = `${year}-${seasonOrder}`;
      const bucket = map.get(key) ?? {
        year,
        season,
        seasonOrder,
        count: 0,
        finished: 0,
        scoreTotal: 0,
        scoreCount: 0,
        examples: [],
      };

      bucket.count += 1;
      if (anime.isFinished || anime.status === 'completed') {
        bucket.finished += 1;
      }
      if (typeof anime.score === 'number') {
        bucket.scoreTotal += anime.score;
        bucket.scoreCount += 1;
      }
      if (bucket.examples.length < 5) {
        bucket.examples.push(anime);
      }

      map.set(key, bucket);
    });

    return Array.from(map.entries())
      .map(([key, bucket]) => ({
        key,
        year: bucket.year,
        season: bucket.season,
        seasonOrder: bucket.seasonOrder,
        count: bucket.count,
        finished: bucket.finished,
        scoreAvg: bucket.scoreCount ? Number((bucket.scoreTotal / bucket.scoreCount).toFixed(1)) : null,
        examples: bucket.examples,
      }))
      .sort((left, right) => right.year - left.year || right.seasonOrder - left.seasonOrder);
  }, [animeList]);

  const withPremiereCount = useMemo(
    () => animeList.filter((anime) => parsePremiere(anime.premiereDate)).length,
    [animeList]
  );

  const finishedCount = useMemo(
    () => animeList.filter((anime) => anime.isFinished || anime.status === 'completed').length,
    [animeList]
  );

  const missingPremiere = useMemo(
    () => animeList.filter((anime) => !parsePremiere(anime.premiereDate)).slice(0, 10),
    [animeList]
  );

  const activeMonths = useMemo(() => {
    const counts: Record<string, number> = {};

    parsedHistory.forEach((item) => {
      const key = `${item.year}-${String(item.month + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([key, value]) => ({ key, value }));
  }, [parsedHistory]);

  const activeMonthMax = activeMonths.reduce((max, item) => Math.max(max, item.value), 1);
  const loading = historyLoading || animeLoading;

  return (
    <main className="p-4 lg:p-8 pb-24 space-y-6 lg:space-y-8 animate-fade-in relative">
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(93,214,242,0.1),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(244,191,98,0.08),transparent_30%)]" />

      <section className="glass-panel-strong rounded-[36px] p-8 lg:p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_35%),linear-gradient(135deg,rgba(93,214,242,0.12),transparent_42%,rgba(244,191,98,0.1))]" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4 max-w-3xl">
            <Link href="/" className="inline-flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
              <ChevronLeftIcon className="w-4 h-4" /> 返回总览
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-sky-100/80">
              Seasonal Notebook
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight text-zinc-50">番剧档期簿</h1>
            <p className="text-sm md:text-base text-zinc-400 leading-7">
              专门展示首播档期、完结状态与季节结构。这个页面更偏“编目视角”，能快速看到片库集中在哪些年份和季度。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-full lg:min-w-[360px] lg:max-w-[380px]">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Premiere</div>
              <div className="mt-2 text-2xl font-mono text-zinc-100">{withPremiereCount}</div>
              <div className="text-xs text-zinc-500 mt-1">有首播日期的作品</div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Finished</div>
              <div className="mt-2 text-2xl font-mono text-emerald-300">{finishedCount}</div>
              <div className="text-xs text-zinc-500 mt-1">已完结或已看完</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 relative z-10">
        <div className="xl:col-span-8 space-y-4">
          {seasonBuckets.slice(0, 16).map((bucket) => {
            const completion = Math.round((bucket.finished / Math.max(bucket.count, 1)) * 100);
            return (
              <article key={bucket.key} className="glass-panel rounded-[30px] p-6 lg:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Season Block</div>
                    <h2 className="mt-1 text-2xl font-display text-zinc-100">{bucket.year} · {bucket.season}季</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">{bucket.count} 部作品</span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-100">完结率 {completion}%</span>
                    <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
                      评分 {bucket.scoreAvg ?? '未补充'}
                    </span>
                  </div>
                </div>

                <div className="mt-5 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-sky-300" style={{ width: `${completion}%` }} />
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {bucket.examples.map((anime) => (
                    <Link
                      key={anime.id}
                      href={`/anime/${anime.id}`}
                      className="group rounded-[20px] border border-white/6 bg-white/[0.03] px-4 py-3 hover:border-sky-300/20 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{anime.title}</div>
                          <div className="text-xs text-zinc-500 truncate">
                            {anime.originalTitle ?? anime.originalWork ?? '未补充原名/原作信息'}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {typeof anime.score === 'number' && (
                            <span className="text-xs rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-100">
                              {anime.score.toFixed(1)}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500">{statusLabels[anime.status]}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}

          {!seasonBuckets.length && (
            <div className="glass-panel rounded-[30px] p-8 text-sm text-zinc-500">
              暂时还没有可用的首播日期数据。你可以在详情页使用 AI 补充，档期簿会自动变丰富。
            </div>
          )}
        </div>

        <aside className="xl:col-span-4 space-y-6">
          <div className="glass-panel rounded-[30px] p-6">
            <div className="flex items-center gap-2 mb-5">
              <ClockIcon className="w-5 h-5 text-sky-300" />
              <h3 className="text-lg font-display text-zinc-100">观看活跃月份</h3>
            </div>
            <div className="space-y-3">
              {activeMonths.map((item) => (
                <div key={item.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{formatMonthKey(item.key)}</span>
                    <span className="text-zinc-500">{item.value} 条</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-300" style={{ width: `${(item.value / activeMonthMax) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!activeMonths.length && <div className="text-sm text-zinc-500">暂无足够观看记录。</div>}
            </div>
          </div>

          <div className="glass-panel rounded-[30px] p-6">
            <div className="flex items-center gap-2 mb-5">
              <CalendarDaysIcon className="w-5 h-5 text-amber-300" />
              <h3 className="text-lg font-display text-zinc-100">待补档期字段</h3>
            </div>
            <div className="space-y-2.5">
              {missingPremiere.map((anime) => (
                <Link
                  key={anime.id}
                  href={`/anime/${anime.id}`}
                  className="group flex items-center justify-between gap-2 rounded-[18px] border border-white/6 bg-white/[0.03] px-3.5 py-2.5 hover:border-amber-300/20 transition-all"
                >
                  <span className="text-sm text-zinc-300 truncate">{anime.title}</span>
                  <CheckBadgeIcon className="w-4 h-4 text-zinc-600 group-hover:text-amber-300 transition-colors shrink-0" />
                </Link>
              ))}
              {!missingPremiere.length && <div className="text-sm text-zinc-500">档期字段已经很完整了。</div>}
            </div>
            <div className="mt-5 rounded-[20px] border border-sky-300/15 bg-sky-300/10 p-4">
              <div className="flex items-center gap-2 text-sky-100">
                <SparklesIcon className="w-4 h-4" />
                <span className="text-sm font-medium">补充建议</span>
              </div>
              <p className="mt-2 text-sm text-zinc-300 leading-6">
                首播时间、完结状态、评分和制作信息越完整，这个页面给出的档期脉络就越准确。
              </p>
            </div>
          </div>
        </aside>
      </section>

      {loading && (
        <div className="text-sm text-zinc-500 font-mono px-2">SEASON_NOTEBOOK_LOADING...</div>
      )}
    </main>
  );
}
