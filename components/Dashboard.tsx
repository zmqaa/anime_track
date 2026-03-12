'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { 
    TvIcon, 
    FireIcon,
    ClockIcon,
    ChartBarIcon
} from '@heroicons/react/24/outline';
import { useAnimeData } from '@/hooks/useAnimeData';
import { useHistoryData } from '@/hooks/useHistoryData';
import { AnimeStatus, statusLabels, statusColors } from '@/lib/dashboard-types';
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

export default function Dashboard() {
    const { parsedHistory, isLoading: hLoading, isRefreshing: hRefreshing } = useHistoryData();
    const { 
        animeList, animeStats, animeTagStats, recentTagStats, animeCompletionRate, 
        isLoading: aLoading, isRefreshing: aRefreshing 
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
        while (current < 400) { // sane guard
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
        { label: '追番总数', value: animeStats.count.toString(), unit: '部', change: 'Total Library', icon: TvIcon, color: 'text-green-400' },
        { label: '当前连载', value: (animeStats.byStatus['watching'] || 0).toString(), unit: '部', change: 'Watching', icon: FireIcon, color: 'text-orange-400' },
        { label: '本周观看', value: weeklyEpisodes.toString(), unit: '集', change: 'Weekly Activity', icon: ClockIcon, color: 'text-blue-400' },
        { label: '看番总时长', value: Math.round(animeStats.minutesWatched / 60).toString(), unit: '小时', change: 'Total Time', icon: ChartBarIcon, color: 'text-purple-400' },
    ];

    const recentTagDisplay = (recentTagStats.length ? recentTagStats : animeTagStats).slice(0, 4);
    const recentTagMax = recentTagDisplay.reduce((max, item) => Math.max(max, item.count), 1);
    const donutChartData = (Object.keys(animeStats.byStatus) as AnimeStatus[]).map((status) => ({
        label: statusLabels[status],
        value: animeStats.byStatus[status],
        color: statusColors[status],
    }));

    return (
        <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in pb-24 relative">
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

            <DashboardHeader isLoading={isLoading} isRefreshing={isRefreshing} />

            {/* Quick Metrics Strip */}
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
                            style={{ background: 'rgba(21, 25, 21, 0.85)' }}
                        >
                            <div className="absolute -bottom-4 -right-4 opacity-10 group-hover:opacity-20 transition-all duration-500 scale-150 group-hover:rotate-12">
                                <stat.icon className={`w-24 h-24 ${stat.color}`} />
                            </div>

                            <div className="flex justify-between items-start relative z-10">
                                <div className="flex items-center gap-2">
                                    <stat.icon className={`w-5 h-5 ${stat.color} opacity-80`} />
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

            {/* Activity Stats - Large Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
                <div className="lg:col-span-12 flex flex-col">
                    <LazyRender fallback={<div className="glass-panel rounded-[32px] h-96 animate-pulse" />}>
                         <div className="glass-panel p-8 rounded-[32px] flex-1 bg-gradient-to-br from-zinc-900/40 via-transparent to-transparent min-h-[420px]">
                            <AdvancedActivityStats history={parsedHistory} animeList={animeList} />
                         </div>
                    </LazyRender>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
                {/* Anime Insights */}
                <div className="lg:col-span-8 glass-panel p-8 rounded-[32px] flex flex-col h-[520px]">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 mb-6">
                        <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]"></span>
                        观看统计与偏好
                    </h2>
                    <div className="space-y-8 flex-1">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 hover:bg-zinc-900/60 transition-colors group text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-zinc-400">总进度</div>
                                <div className="text-2xl font-bold text-white mt-1 tracking-tight">{animeStats.episodesWatched}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">已看集数</div>
                            </div>
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 hover:bg-zinc-900/60 transition-colors group text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-zinc-400">完结率</div>
                                <div className="text-2xl font-bold text-emerald-400 mt-1 tracking-tight">{animeCompletionRate}%</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">已看 {animeStats.byStatus.completed}</div>
                            </div>
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 hover:bg-zinc-900/60 transition-colors group text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-zinc-400">当前连续</div>
                                <div className="text-2xl font-bold text-yellow-400 mt-1 tracking-tight">{currentStreak}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">最长 {longestStreak}d</div>
                            </div>
                            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 hover:bg-zinc-900/60 transition-colors group text-center">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-zinc-400">本周效率</div>
                                <div className="text-2xl font-bold text-blue-400 mt-1 tracking-tight">{weeklyEpisodes}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide">集/周</div>
                            </div>
                        </div>

                        <div className="flex flex-col xl:flex-row gap-8">
                            <div className="grid grid-cols-2 gap-4 flex-1">
                                {(Object.keys(animeStats.byStatus) as AnimeStatus[]).map((status) => (
                                    <div key={status} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col justify-center items-center group hover:bg-white/[0.08] transition-all">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[status] }} />
                                            <span className="text-sm font-bold text-zinc-400 group-hover:text-zinc-200 transition-colors">
                                                {statusLabels[status]}
                                            </span>
                                        </div>
                                        <span className="text-3xl font-bold text-white tracking-tighter">
                                            {animeStats.byStatus[status]}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">标签分布</h3>
                                        <div className="h-[1px] flex-1 bg-white/5 mx-4" />
                                    </div>
                                    <div className="space-y-3">
                                        {recentTagDisplay.map((tag) => (
                                            <div key={tag.tag} className="space-y-1.5 group">
                                                <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                                                    <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors">{tag.tag}</span>
                                                    <span className="text-zinc-500">{tag.count} 部</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-primary/60 group-hover:bg-primary transition-all duration-700 ease-out rounded-full"
                                                        style={{ width: `${(tag.count / recentTagMax) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-center justify-center p-4 bg-white/[0.02] rounded-3xl border border-white/5">
                                    <DonutChart data={donutChartData} />
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-4">状态比例</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* History Feed */}
                <div className="lg:col-span-4 glass-panel p-8 rounded-[32px] flex flex-col h-[520px]">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]"></span>
                            最近记录
                        </h2>
                        <Link href="/anime/timeline" className="text-[10px] font-bold text-zinc-600 hover:text-white transition-colors uppercase tracking-widest">More &rarr;</Link>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar pr-2">
                        <ActivityFeed history={parsedHistory} />
                    </div>
                </div>
            </div>
        </div>
    );
}
