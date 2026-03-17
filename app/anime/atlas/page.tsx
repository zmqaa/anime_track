"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  SparklesIcon,
  StarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { useAnimeData } from '@/hooks/useAnimeData';
import { useHistoryData } from '@/hooks/useHistoryData';

function formatPremiere(value?: string) {
  if (!value) return '未补充';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short' }).format(date);
}

export default function AnimeAtlasPage() {
  const { parsedHistory, isLoading: historyLoading } = useHistoryData();
  const { animeList, animeTagStats, recentTagStats, isLoading: animeLoading } = useAnimeData(parsedHistory);

  const data = useMemo(() => {
    const originalWorkCounts: Record<string, number> = {};
    const castCounts: Record<string, number> = {};

    animeList.forEach((anime) => {
      if (anime.originalWork?.trim()) originalWorkCounts[anime.originalWork.trim()] = (originalWorkCounts[anime.originalWork.trim()] || 0) + 1;
      if (Array.isArray(anime.cast)) {
        anime.cast.forEach((name) => {
          const normalized = String(name || '').trim();
          if (!normalized) return;
          castCounts[normalized] = (castCounts[normalized] || 0) + 1;
        });
      }
    });

    const scored = animeList
      .filter((anime) => typeof anime.score === 'number')
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, 6);

    const premiered = animeList
      .filter((anime) => anime.premiereDate)
      .sort((left, right) => new Date(right.premiereDate ?? 0).getTime() - new Date(left.premiereDate ?? 0).getTime())
      .slice(0, 6);

    const metadataRichness = animeList.length
      ? Math.round(
          (animeList.filter((anime) => [anime.originalTitle, anime.score, anime.originalWork, Array.isArray(anime.cast) && anime.cast.length > 0 ? 'cast' : '', anime.premiereDate, anime.summary].filter(Boolean).length >= 3).length /
            animeList.length) *
            100
        )
      : 0;

    return {
      scored,
      premiered,
      topVoiceActors: Object.entries(castCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6),
      topOriginalWorks: Object.entries(originalWorkCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6),
      metadataRichness,
    };
  }, [animeList]);

  const loading = animeLoading || historyLoading;
  const tagRows = (recentTagStats.length ? recentTagStats : animeTagStats).slice(0, 10);
  const tagMax = tagRows.reduce((max, item) => Math.max(max, item.count), 1);

  return (
    <main className="p-4 lg:p-8 pb-24 space-y-6 lg:space-y-8 animate-fade-in relative">
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(86,211,156,0.08),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(93,214,242,0.08),transparent_26%)]" />

      <section className="glass-panel-strong rounded-[36px] p-8 lg:p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_35%),linear-gradient(135deg,rgba(86,211,156,0.1),transparent_42%,rgba(93,214,242,0.08))]" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4 max-w-3xl">
            <Link href="/" className="inline-flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors">
              <ChevronLeftIcon className="w-4 h-4" /> 返回总览
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-emerald-200/80">
              Metadata Atlas
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight text-zinc-50">作品元数据图谱</h1>
            <p className="text-sm md:text-base text-zinc-400 leading-7">
              这里专门展示你的片库由哪些原作类型、声优分布、标签和高分作品构成。比起首页，它更偏向“片库剖面图”。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-full lg:min-w-[320px] lg:max-w-[360px]">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Library</div>
              <div className="mt-2 text-2xl font-mono text-zinc-100">{animeList.length}</div>
              <div className="text-xs text-zinc-500 mt-1">当前入库作品</div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Richness</div>
              <div className="mt-2 text-2xl font-mono text-emerald-300">{data.metadataRichness}%</div>
              <div className="text-xs text-zinc-500 mt-1">档案完整度</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 relative z-10">
        <div className="xl:col-span-5 glass-panel rounded-[32px] p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6">
            <SparklesIcon className="w-5 h-5 text-emerald-300" />
            <h2 className="text-xl font-display font-semibold text-zinc-100">原作与声优分布</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Original Works</div>
              <div className="space-y-3">
                {data.topOriginalWorks.map(([name, count]) => (
                  <div key={name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm text-zinc-300">
                      <span>{name}</span>
                      <span className="text-zinc-500">{count} 部</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300" style={{ width: `${(count / Math.max(data.topOriginalWorks[0]?.[1] ?? 1, 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {!data.topOriginalWorks.length && <div className="text-sm text-zinc-500">原作类型还比较稀疏。</div>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Top Voice Actors</div>
                <div className="mt-3 space-y-2">
                  {data.topVoiceActors.map(([name, count]) => (
                    <div key={name} className="rounded-[20px] border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 flex items-center justify-between gap-3">
                      <span className="truncate">{name}</span>
                      <span className="text-zinc-500 shrink-0">{count} 部</span>
                    </div>
                  ))}
                  {!data.topVoiceActors.length && <div className="text-sm text-zinc-500">声优字段还比较稀疏。</div>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-7 glass-panel rounded-[32px] p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6">
            <TagIcon className="w-5 h-5 text-cyan-300" />
            <h2 className="text-xl font-display font-semibold text-zinc-100">标签热区</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6">
            <div className="space-y-3">
              {tagRows.map((tag) => (
                <div key={tag.tag} className="rounded-[22px] border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-zinc-300">
                    <span>{tag.tag}</span>
                    <span className="text-zinc-500">{tag.count} 部</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${(tag.count / tagMax) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!tagRows.length && <div className="text-sm text-zinc-500">标签数据还不够多，后续可以多用 AI 补全。</div>}
            </div>
            <div className="rounded-[28px] border border-white/8 bg-white/[0.02] p-5 flex flex-col justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Recent Mood</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tagRows.slice(0, 6).map((tag) => (
                    <span key={tag.tag} className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                      {tag.tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-[24px] border border-cyan-300/15 bg-cyan-300/8 p-4">
                <div className="flex items-center gap-2 text-cyan-100">
                  <SparklesIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">AI 补全建议</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300 leading-6">
                  如果这里字段还偏空，可以继续走详情页 AI 补充，originalWork、cast、summary 这些会让图谱更完整。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 relative z-10">
        <div className="xl:col-span-7 glass-panel rounded-[32px] p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6">
            <StarIcon className="w-5 h-5 text-amber-300" />
            <h2 className="text-xl font-display font-semibold text-zinc-100">高分作品陈列</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.scored.map((anime) => (
              <Link key={anime.id} href={`/anime/${anime.id}`} className="group rounded-[28px] border border-white/5 bg-white/[0.03] overflow-hidden hover:border-amber-300/20 transition-all duration-300">
                <div className="h-40 bg-zinc-900/70 bg-cover bg-center" style={anime.coverUrl ? { backgroundImage: `linear-gradient(180deg, rgba(7,17,15,0.05), rgba(7,17,15,0.9)), url(${anime.coverUrl})` } : undefined} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Score Highlight</div>
                      <div className="mt-1 text-lg text-zinc-100 truncate">{anime.title}</div>
                      <div className="text-xs text-zinc-500 truncate">{anime.originalTitle ?? anime.originalWork ?? '未补充原名/原作信息'}</div>
                    </div>
                    <div className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-sm text-amber-100">
                      {anime.score?.toFixed(1)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {!data.scored.length && <div className="text-sm text-zinc-500">评分字段还不够丰富，之后可以继续补齐。</div>}
          </div>
        </div>

        <div className="xl:col-span-5 space-y-6">
          <div className="glass-panel rounded-[32px] p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <TagIcon className="w-5 h-5 text-violet-300" />
              <h2 className="text-xl font-display font-semibold text-zinc-100">热门声优</h2>
            </div>
            <div className="space-y-3">
              {data.topVoiceActors.map(([name, count]) => (
                <div key={name} className="rounded-[20px] border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 flex items-center justify-between gap-3">
                  <span className="truncate">{name}</span>
                  <span className="text-zinc-500 shrink-0">{count} 部</span>
                </div>
              ))}
              {!data.topVoiceActors.length && <div className="text-sm text-zinc-500">声优信息还没有形成分布。</div>}
            </div>
          </div>

          <div className="glass-panel rounded-[32px] p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <CalendarDaysIcon className="w-5 h-5 text-sky-300" />
              <h2 className="text-xl font-display font-semibold text-zinc-100">最近首播作品</h2>
            </div>
            <div className="space-y-3">
              {data.premiered.map((anime) => (
                <Link key={anime.id} href={`/anime/${anime.id}`} className="group flex items-center justify-between gap-3 rounded-[20px] border border-white/5 bg-white/[0.03] px-4 py-3 hover:border-sky-300/20 transition-all">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{anime.title}</div>
                    <div className="text-xs text-zinc-500 truncate">{formatPremiere(anime.premiereDate)} · {anime.originalWork ?? '未补充原作'}</div>
                  </div>
                  <ArrowUpRightIcon className="w-4 h-4 text-zinc-600 group-hover:text-sky-300 transition-colors" />
                </Link>
              ))}
              {!data.premiered.length && <div className="text-sm text-zinc-500">首播日期字段暂时较少。</div>}
            </div>
          </div>
        </div>
      </section>

      {loading && (
        <div className="text-sm text-zinc-500 font-mono px-2">ATLAS_LOADING...</div>
      )}
    </main>
  );
}