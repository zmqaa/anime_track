'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowTrendingUpIcon,
    CalendarDaysIcon,
    ClockIcon,
    FireIcon,
    SparklesIcon,
    StarIcon,
    TvIcon,
} from '@heroicons/react/24/outline';
import { useAnimeData } from '@/hooks/useAnimeData';
import { useHistoryData } from '@/hooks/useHistoryData';
import { AnimeRecord, AnimeStatus, statusLabels, statusColors } from '@/lib/dashboard-types';
import DashboardHeader from './dashboard/DashboardHeader';

// 动态导入组件，减少初始包体积
const DonutChart = dynamic(() => import('./dashboard/DonutChart').then(mod => mod.DonutChart), { ssr: false });
const ActivityFeed = dynamic(() => import('./dashboard/ActivityFeed'), { ssr: false });
const AdvancedActivityStats = dynamic(() => import('./dashboard/AdvancedActivityStats'), { ssr: false });

function LazyRender({
    children,
    fallback,
    rootMargin = '200px',
}: {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    rootMargin?: string;
}) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (isVisible) return;
        const node = ref.current;
        if (!node) return;

        if (!('IntersectionObserver' in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [isVisible, rootMargin]);

    return (
        <div ref={ref}>
            {isVisible ? children : fallback ?? <div className="glass-panel rounded-[24px] h-48 animate-pulse" />}
        </div>
    );
}

function formatPremiere(value?: string) {
    if (!value) return '未补充';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short' }).format(date);
}

function formatUpdateDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export default function Dashboard() {
    const { parsedHistory, isLoading: hLoading, isRefreshing: hRefreshing } = useHistoryData();
    const {
        animeList,
        animeStats,
        animeTagStats,
        recentTagStats,
        animeCompletionRate,
        isLoading: aLoading,
        isRefreshing: aRefreshing,
    } = useAnimeData(parsedHistory);

    // 聚合加载状态
    const isLoading = aLoading || hLoading;
    const isRefreshing = aRefreshing || hRefreshing;

    const { currentStreak, longestStreak, weeklyEpisodes } = useMemo(() => {
        const daySet = new Set(parsedHistory.map((h) => h.dateStr));
        const sortedDays = Array.from(daySet).sort();

        let longest = 0;
        let streak = 0;
        for (let i = 0; i < sortedDays.length; i++) {
            if (i === 0) {
                streak = 1;
            } else {
                const prev = new Date(sortedDays[i - 1]);
                const curr = new Date(sortedDays[i]);
                const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
                streak = diff === 1 ? streak + 1 : 1;
            }
            longest = Math.max(longest, streak);
        }

        let current = 0;
        const cursor = new Date();
        while (current < 400) {
            const iso = cursor.toISOString().split('T')[0];
            if (!daySet.has(iso)) break;
            current += 1;
            cursor.setDate(cursor.getDate() - 1);
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setHours(0, 0, 0, 0);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const recentEpisodes = parsedHistory.filter((h) => h.dateObj >= sevenDaysAgo).length;

        return {
            currentStreak: current,
            longestStreak: longest,
            weeklyEpisodes: recentEpisodes,
        };
    }, [parsedHistory]);

    const stats = [
        {
            label: '追番总数',
            value: animeStats.count.toString(),
            unit: '部',
            change: 'Total Library',
            icon: TvIcon,
            color: 'text-emerald-300',
        },
        {
            label: '当前连载',
            value: (animeStats.byStatus.watching || 0).toString(),
            unit: '部',
            change: 'Watching',
            icon: FireIcon,
            color: 'text-amber-300',
        },
        {
            label: '本周观看',
            value: weeklyEpisodes.toString(),
            unit: '集',
            change: 'Weekly Activity',
            icon: ClockIcon,
            color: 'text-sky-300',
        },
        {
            label: '看番总时长',
            value: Math.round(animeStats.minutesWatched / 60).toString(),
            unit: '小时',
            change: 'Total Time',
            icon: ArrowTrendingUpIcon,
            color: 'text-cyan-300',
        },
    ];

    const topRated = useMemo(() => {
        return [...animeList]
            .filter((anime) => typeof anime.score === 'number')
            .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
            .slice(0, 6);
    }, [animeList]);

    const recentPremiered = useMemo(() => {
        return [...animeList]
            .filter((anime) => anime.premiereDate)
            .sort((left, right) => new Date(right.premiereDate ?? 0).getTime() - new Date(left.premiereDate ?? 0).getTime())
            .slice(0, 6);
    }, [animeList]);

    const heroAnime = useMemo(() => {
        if (topRated.length > 0) return topRated[0];
        return animeList[0] ?? null;
    }, [animeList, topRated]);

    const heroStyle = heroAnime?.coverUrl
        ? {
            backgroundImage: `linear-gradient(120deg, rgba(6,13,12,0.88), rgba(6,13,12,0.4) 44%, rgba(6,13,12,0.88)), url(${heroAnime.coverUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        }
        : undefined;

    const metadataCoverage = useMemo(() => {
        const total = animeList.length || 1;
        const fields = [
            { label: '原名', count: animeList.filter((anime) => Boolean(anime.originalTitle)).length },
            { label: '评分', count: animeList.filter((anime) => typeof anime.score === 'number').length },
            { label: '原作', count: animeList.filter((anime) => Boolean(anime.originalWork)).length },
            { label: '声优', count: animeList.filter((anime) => Array.isArray(anime.cast) && anime.cast.length > 0).length },
            { label: '首播', count: animeList.filter((anime) => Boolean(anime.premiereDate)).length },
            { label: '简介', count: animeList.filter((anime) => Boolean(anime.summary)).length },
        ];

        return fields.map((field) => ({
            ...field,
            percent: Math.round((field.count / total) * 100),
        }));
    }, [animeList]);

    const metadataRichness = useMemo(() => {
        if (!animeList.length) return 0;
        const count = animeList.filter((anime) => {
            const filled = [
                anime.originalTitle,
                anime.score,
                anime.originalWork,
                Array.isArray(anime.cast) && anime.cast.length > 0 ? anime.cast.join(',') : undefined,
                anime.premiereDate,
                anime.summary,
            ].filter((value) => value !== undefined && value !== null && value !== '');
            return filled.length >= 4;
        }).length;

        return Math.round((count / animeList.length) * 100);
    }, [animeList]);

    const premiereByYear = useMemo(() => {
        const yearCount = new Map<number, number>();

        animeList.forEach((anime) => {
            if (!anime.premiereDate) return;
            const date = new Date(anime.premiereDate);
            if (Number.isNaN(date.getTime())) return;
            const year = date.getFullYear();
            yearCount.set(year, (yearCount.get(year) || 0) + 1);
        });

        return Array.from(yearCount.entries())
            .sort((left, right) => left[0] - right[0])
            .slice(-7)
            .map(([year, count]) => ({ year, count }));
    }, [animeList]);

    const premiereMax = premiereByYear.reduce((max, item) => Math.max(max, item.count), 1);

    const recentTagDisplay = (recentTagStats.length ? recentTagStats : animeTagStats).slice(0, 5);
    const recentTagMax = recentTagDisplay.reduce((max, item) => Math.max(max, item.count), 1);

    const donutChartData = (Object.keys(animeStats.byStatus) as AnimeStatus[]).map((status) => ({
        label: statusLabels[status],
        value: animeStats.byStatus[status],
        color: statusColors[status],
    }));

    const statusCards = (Object.keys(animeStats.byStatus) as AnimeStatus[]).map((status) => ({
        status,
        label: statusLabels[status],
        value: animeStats.byStatus[status],
        color: statusColors[status],
    }));

    return (
        <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in pb-24 relative">
            <div className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
            <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_5%_5%,rgba(86,211,156,0.12),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(93,214,242,0.12),transparent_34%),radial-gradient(circle_at_80%_100%,rgba(244,191,98,0.08),transparent_30%)]" />

            <DashboardHeader isLoading={isLoading} isRefreshing={isRefreshing} />

            <LazyRender fallback={<div className="glass-panel-strong rounded-[34px] h-[330px] animate-pulse" />}>
                <section className="glass-panel-strong rounded-[36px] p-7 lg:p-10 relative overflow-hidden">
                    {heroStyle && <div className="absolute inset-0 opacity-60" style={heroStyle} />}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_42%)]" />

                    <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
                        <div className="xl:col-span-8 space-y-5">
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/12 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-emerald-100/90">
                                Archive Main Hall
                            </div>
                            <h2 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-zinc-50 leading-tight">
                                私藏番剧馆
                                <span className="block text-zinc-300 text-lg md:text-2xl mt-3 font-normal">
                                    把观影节律、片库画像和元数据风格收纳进同一个场景。
                                </span>
                            </h2>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                                <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">馆藏总量</div>
                                    <div className="mt-1 text-2xl font-mono text-zinc-100">{animeStats.count}</div>
                                </div>
                                <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">档案完整度</div>
                                    <div className="mt-1 text-2xl font-mono text-emerald-300">{metadataRichness}%</div>
                                </div>
                                <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">完结率</div>
                                    <div className="mt-1 text-2xl font-mono text-cyan-300">{animeCompletionRate}%</div>
                                </div>
                                <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">本周节律</div>
                                    <div className="mt-1 text-2xl font-mono text-amber-300">{weeklyEpisodes} EP</div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-1">
                                <Link href="/anime" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-zinc-100 hover:border-emerald-300/30 hover:bg-emerald-300/10 transition-all">
                                    进入片库
                                </Link>
                                <Link href="/anime/atlas" className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/15 transition-all">
                                    打开图谱馆
                                </Link>
                                <Link href="/anime/seasons" className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-300/15 transition-all">
                                    查看档期簿
                                </Link>
                            </div>
                        </div>

                        <div className="xl:col-span-4 rounded-[30px] border border-white/12 bg-black/35 p-5 lg:p-6 backdrop-blur-md">
                            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Focus Work</div>
                            {heroAnime ? (
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <h3 className="text-2xl font-display text-zinc-100 leading-snug">{heroAnime.title}</h3>
                                        <p className="text-sm text-zinc-400 mt-1 truncate">{heroAnime.originalTitle ?? heroAnime.originalWork ?? '尚未补充原名与原作信息'}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                            <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">评分</div>
                                            <div className="mt-1 text-xl text-amber-200 font-mono">
                                                {typeof heroAnime.score === 'number' ? heroAnime.score.toFixed(1) : '未补充'}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                            <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">首播</div>
                                            <div className="mt-1 text-xl text-sky-200 font-mono">{formatPremiere(heroAnime.premiereDate)}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-zinc-400 leading-6 line-clamp-3">
                                        {heroAnime.summary ?? '这部作品还没有补充摘要。可以在详情页使用 AI 补充，首页会自动展示更丰富信息。'}
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-zinc-500">
                                        <span>最后更新</span>
                                        <span>{formatUpdateDate(heroAnime.updatedAt)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 text-sm text-zinc-500">暂无作品数据，先去片库添加第一部番剧吧。</div>
                            )}
                        </div>
                    </div>
                </section>
            </LazyRender>

            <LazyRender
                fallback={
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="glass-panel rounded-[24px] h-28 animate-pulse" />
                        ))}
                    </div>
                }
            >
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-10 cv-auto">
                    {stats.map((stat, i) => (
                        <div
                            key={i}
                            className="glass-panel p-6 rounded-[28px] transition-all duration-500 hover:-translate-y-1 group relative overflow-hidden flex flex-col justify-between h-32 border-white/10"
                            style={{ background: 'rgba(14, 21, 19, 0.88)' }}
                        >
                            <div className="absolute -bottom-4 -right-4 opacity-10 group-hover:opacity-20 transition-all duration-500 scale-150 group-hover:rotate-12">
                                <stat.icon className={`w-24 h-24 ${stat.color}`} />
                            </div>

                            <div className="flex justify-between items-start relative z-10">
                                <div className="flex items-center gap-2">
                                    <stat.icon className={`w-5 h-5 ${stat.color} opacity-90`} />
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest group-hover:text-zinc-200 transition-colors">
                                        {stat.label}
                                    </span>
                                </div>
                                <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border ${stat.color} bg-current/10 border-current/30 shadow-sm`}>
                                    {stat.change}
                                </span>
                            </div>

                            <div className="flex items-baseline justify-between relative z-10 mt-2">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
                                        {stat.value}
                                    </span>
                                    <span className="text-xs text-zinc-500 font-bold uppercase tracking-tighter">{stat.unit}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </LazyRender>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
                <div className="lg:col-span-8 flex flex-col">
                    <LazyRender fallback={<div className="glass-panel rounded-[32px] h-96 animate-pulse" />}>
                        <div className="glass-panel p-8 rounded-[32px] flex-1 bg-gradient-to-br from-zinc-900/40 via-transparent to-transparent min-h-[420px]">
                            <AdvancedActivityStats history={parsedHistory} animeList={animeList} />
                        </div>
                    </LazyRender>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <LazyRender fallback={<div className="glass-panel rounded-[32px] h-64 animate-pulse" />}>
                        <div className="glass-panel p-7 rounded-[32px] space-y-5">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-emerald-300" />
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">元数据完整度</h2>
                            </div>
                            <div className="space-y-3">
                                {metadataCoverage.map((item) => (
                                    <div key={item.label} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-zinc-400 uppercase tracking-[0.22em]">{item.label}</span>
                                            <span className="text-zinc-500">{item.percent}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300"
                                                style={{ width: `${item.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-300/10 p-4">
                                <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/80">Metadata Index</div>
                                <div className="mt-2 text-2xl font-mono text-emerald-100">{metadataRichness}%</div>
                                <p className="mt-1 text-xs text-zinc-300 leading-5">具备 4 项以上核心字段的作品占比。这个值越高，图谱页和首页就越有质感。</p>
                            </div>
                        </div>
                    </LazyRender>

                    <LazyRender fallback={<div className="glass-panel rounded-[32px] h-52 animate-pulse" />}>
                        <div className="glass-panel p-7 rounded-[32px]">
                            <div className="flex items-center gap-2 mb-5">
                                <CalendarDaysIcon className="w-5 h-5 text-sky-300" />
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">首播年份分布</h2>
                            </div>
                            <div className="space-y-3">
                                {premiereByYear.map((item) => (
                                    <div key={item.year} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs text-zinc-400">
                                            <span>{item.year}</span>
                                            <span>{item.count} 部</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-300" style={{ width: `${(item.count / premiereMax) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {!premiereByYear.length && (
                                    <div className="text-sm text-zinc-500">首播日期字段还不够多，先在详情页补全几部作品即可生成分布。</div>
                                )}
                            </div>
                        </div>
                    </LazyRender>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
                <div className="lg:col-span-8 space-y-6">
                    <div className="glass-panel p-8 rounded-[32px]">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 mb-6">
                            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
                            观看统计与偏好
                        </h2>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">总进度</div>
                                <div className="text-2xl font-bold text-white mt-1 tracking-tight">{animeStats.episodesWatched}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">已看集数</div>
                            </div>
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">完结率</div>
                                <div className="text-2xl font-bold text-emerald-400 mt-1 tracking-tight">{animeCompletionRate}%</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">已看 {animeStats.byStatus.completed}</div>
                            </div>
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">当前连续</div>
                                <div className="text-2xl font-bold text-amber-300 mt-1 tracking-tight">{currentStreak}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">最长 {longestStreak} d</div>
                            </div>
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">本周效率</div>
                                <div className="text-2xl font-bold text-sky-300 mt-1 tracking-tight">{weeklyEpisodes}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">集/周</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6">
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    {statusCards.map((status) => (
                                        <div key={status.status} className="p-4 rounded-2xl bg-white/[0.03] border border-white/6 flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                                                <span className="text-sm font-medium text-zinc-300 truncate">{status.label}</span>
                                            </div>
                                            <span className="text-xl font-bold text-zinc-100">{status.value}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">标签分布</h3>
                                        <div className="h-[1px] flex-1 bg-white/5 mx-4" />
                                    </div>
                                    {recentTagDisplay.map((tag) => (
                                        <div key={tag.tag} className="space-y-1.5">
                                            <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                                                <span className="text-zinc-400">{tag.tag}</span>
                                                <span className="text-zinc-500">{tag.count} 部</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary/70 rounded-full"
                                                    style={{ width: `${(tag.count / recentTagMax) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {!recentTagDisplay.length && <div className="text-sm text-zinc-500">标签数据还在累计中。</div>}
                                </div>
                            </div>

                            <div className="rounded-[28px] border border-white/8 bg-white/[0.02] p-5 flex flex-col items-center justify-center">
                                <DonutChart data={donutChartData} />
                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-4">状态比例</p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-8 rounded-[32px]">
                        <div className="flex items-center justify-between gap-4 mb-6">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <StarIcon className="w-4 h-4 text-amber-300" />
                                高分作品陈列
                            </h2>
                            <Link href="/anime/atlas" className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">
                                查看图谱馆
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {topRated.map((anime: AnimeRecord) => (
                                <Link
                                    key={anime.id}
                                    href={`/anime/${anime.id}`}
                                    className="group rounded-[26px] border border-white/6 bg-white/[0.03] overflow-hidden hover:border-amber-300/20 transition-all"
                                >
                                    <div
                                        className="h-36 bg-zinc-900/70 bg-cover bg-center"
                                        style={anime.coverUrl ? { backgroundImage: `linear-gradient(180deg, rgba(7,17,15,0.05), rgba(7,17,15,0.88)), url(${anime.coverUrl})` } : undefined}
                                    />
                                    <div className="p-4">
                                        <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Score Highlight</div>
                                        <div className="mt-1 text-lg text-zinc-100 truncate">{anime.title}</div>
                                        <div className="text-xs text-zinc-500 truncate">{anime.originalTitle ?? anime.originalWork ?? '未补充原名/原作信息'}</div>
                                        <div className="mt-3 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100">
                                            {anime.score?.toFixed(1)}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                            {!topRated.length && <div className="text-sm text-zinc-500">还没有评分字段，后续补全后这里会自动丰富。</div>}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="glass-panel p-7 rounded-[32px]">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 mb-5">
                            <CalendarDaysIcon className="w-4 h-4 text-sky-300" />
                            最近首播作品
                        </h2>
                        <div className="space-y-3">
                            {recentPremiered.map((anime) => (
                                <Link key={anime.id} href={`/anime/${anime.id}`} className="group flex items-center justify-between gap-3 rounded-[20px] border border-white/5 bg-white/[0.03] px-4 py-3 hover:border-sky-300/20 transition-all">
                                    <div className="min-w-0">
                                        <div className="text-sm text-zinc-200 truncate">{anime.title}</div>
                                        <div className="text-xs text-zinc-500 truncate">{formatPremiere(anime.premiereDate)} · {anime.originalWork ?? '未补充原作'}</div>
                                    </div>
                                    <span className="text-[10px] text-zinc-500 group-hover:text-sky-200">↗</span>
                                </Link>
                            ))}
                            {!recentPremiered.length && <div className="text-sm text-zinc-500">首播字段偏少，暂时没有可展示列表。</div>}
                        </div>
                    </div>

                    <div className="glass-panel p-8 rounded-[32px] flex flex-col h-[520px]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                                最近记录
                            </h2>
                            <Link href="/anime/timeline" className="text-[10px] font-bold text-zinc-600 hover:text-white transition-colors uppercase tracking-widest">More →</Link>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar pr-2">
                            <ActivityFeed history={parsedHistory} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
