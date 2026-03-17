
"use client";

import { useMemo, useState, memo } from 'react';
import { AnimeRecord, ParsedWatchHistory } from '@/lib/dashboard-types';

export default memo(function AdvancedActivityStats({ history, animeList }: { history: ParsedWatchHistory[], animeList: AnimeRecord[] }) {
    const [scale, setScale] = useState<'week' | 'month' | 'year'>('week');

    const statsData = useMemo(() => {
        const now = new Date();
        const data: { label: string; value: number }[] = [];
        let totalEpisodes = 0;
        let totalMinutes = 0;
        let title = "";
        let scaleStart = new Date(now);

        const historyMap: Record<string, number> = {};
        history.forEach(h => {
            historyMap[h.dateStr] = (historyMap[h.dateStr] || 0) + 1;
        });

        if (scale === 'week') {
            title = "过去 7 日趋势";
            scaleStart.setHours(0, 0, 0, 0);
            scaleStart.setDate(scaleStart.getDate() - 6);
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const count = historyMap[dateStr] || 0;
                totalEpisodes += count;
                data.push({ label: d.toLocaleDateString('zh-CN', { weekday: 'short' }), value: count });
            }
        } else if (scale === 'month') {
            title = "本月每日趋势";
            const year = now.getFullYear();
            const month = now.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            scaleStart = new Date(year, month, 1);
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const count = historyMap[dateStr] || 0;
                totalEpisodes += count;
                data.push({ label: `${i}`, value: count });
            }
        } else {
            title = "年度每月趋势";
            const year = now.getFullYear();
            const monthlyMap: Record<string, number> = {};
            scaleStart = new Date(year, 0, 1);
            
            history.forEach(h => {
                if (h.year === year) {
                    const monthKey = `${h.year}-${String(h.month + 1).padStart(2, '0')}`;
                    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + 1;
                }
            });

            for (let i = 0; i < 12; i++) {
                const monthKey = `${year}-${String(i + 1).padStart(2, '0')}`;
                const count = monthlyMap[monthKey] || 0;
                totalEpisodes += count;
                data.push({ label: `${i + 1}月`, value: count });
            }
        }

        totalMinutes = totalEpisodes * 24; 

        const scopedHistory = history.filter((item) => item.dateObj >= scaleStart);
        const activeWindows = {
            凌晨: 0,
            日间: 0,
            黄昏: 0,
            深夜: 0,
        };

        scopedHistory.forEach((item) => {
            if (item.hour < 6) activeWindows.凌晨 += 1;
            else if (item.hour < 14) activeWindows.日间 += 1;
            else if (item.hour < 20) activeWindows.黄昏 += 1;
            else activeWindows.深夜 += 1;
        });

        const mostActiveWindow = Object.entries(activeWindows).sort((a, b) => b[1] - a[1])[0] ?? ['暂无', 0];
        const peakPoint = data.reduce((peak, point) => point.value > peak.value ? point : peak, { label: '暂无', value: 0 });
        const activeDays = data.filter((point) => point.value > 0).length;
        const knownEpisodes = animeList.reduce((sum, anime) => sum + (anime.totalEpisodes ?? anime.progress), 0);
        const libraryCoverage = knownEpisodes > 0 ? Math.min(100, Math.round((totalEpisodes / knownEpisodes) * 100)) : 0;

        return { data, totalEpisodes, totalMinutes, title, peakPoint, activeDays, mostActiveWindow, libraryCoverage };
    }, [animeList, history, scale]);

    const maxValue = Math.max(...statsData.data.map(d => d.value), 1);
    const averagePerUnit = scale === 'week' ? 7 : scale === 'month' ? 30 : 365;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                     <h2 className="text-2xl font-display font-semibold flex items-center gap-3 text-zinc-100">
                        <span className="w-1.5 h-8 bg-gradient-to-b from-cyan-300 to-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.5)]"></span>
                        观影趋势分析
                    </h2>
                    <p className="text-sm text-zinc-400 mt-2 leading-6">{statsData.title}，现在会额外给出高频观看时段和这一段时间对整库的推进占比。</p>
                </div>
                
                <div className="flex bg-zinc-900/90 p-1.5 rounded-2xl border border-white/10 shadow-xl self-start lg:self-auto">
                    {(['week', 'month', 'year'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setScale(s)}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${scale === s ? 'bg-zinc-800 text-primary shadow-lg ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {s === 'week' ? '周' : s === 'month' ? '月' : '年'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-zinc-900/40 border border-white/10 rounded-[28px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300 surface-highlight">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">总看番集数</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold font-mono text-zinc-100 tracking-tighter">{statsData.totalEpisodes}</span>
                         <span className="text-xs text-zinc-500 font-bold">EP</span>
                     </div>
                </div>
                <div className="bg-zinc-900/40 border border-white/10 rounded-[28px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300 surface-highlight">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">预估时长</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold font-mono text-blue-400 tracking-tighter">{Math.round(statsData.totalMinutes / 60)}</span>
                         <span className="text-xs text-zinc-500 font-bold">HRS</span>
                     </div>
                </div>
                <div className="bg-zinc-900/40 border border-white/10 rounded-[28px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300 surface-highlight">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">活跃效率</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold font-mono text-green-400 tracking-tighter">
                             {(statsData.totalEpisodes / averagePerUnit).toFixed(1)}
                        </span>
                         <span className="text-xs text-zinc-500 font-bold">EP/D</span>
                     </div>
                </div>
                <div className="bg-zinc-900/40 border border-white/10 rounded-[28px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300 surface-highlight">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">高频时段</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold text-amber-300 tracking-tight">{statsData.mostActiveWindow[0]}</span>
                     </div>
                     <div className="text-[11px] mt-2 text-zinc-500">出现 {statsData.mostActiveWindow[1]} 次观看记录</div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-5">
                <div className="h-64 flex items-end gap-1.5 pl-12 pr-4 py-6 bg-zinc-950/20 rounded-[28px] border border-white/5 relative group/chart overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(93,214,242,0.12),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_28%)]" />
                {/* Y-Axis Labels */}
                    <div className="absolute left-3 inset-y-6 flex flex-col justify-between text-[9px] font-mono text-zinc-500 pointer-events-none">
                        <span className="flex items-center gap-1">{maxValue}<span className="text-[7px] opacity-50">EP</span></span>
                        <span className="flex items-center gap-1">{Math.round(maxValue / 2)}</span>
                        <span>0</span>
                    </div>

                    <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none opacity-10">
                        <div className="border-t border-zinc-500 w-full h-px ml-6"></div>
                        <div className="border-t border-zinc-500 w-full h-px border-dashed ml-6"></div>
                        <div className="border-t border-zinc-500 w-full h-px border-dashed ml-6"></div>
                        <div className="border-t border-zinc-500 w-full h-px ml-6"></div>
                    </div>

                    {statsData.data.map((item, i) => (
                        <div 
                            key={i} 
                            className="flex-1 flex flex-col items-center gap-3 group relative h-full justify-end z-10"
                        >
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-zinc-950 text-[11px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-30 whitespace-nowrap shadow-[0_10px_20px_rgba(0,0,0,0.4)] translate-y-2 group-hover:translate-y-0">
                                {item.label}: {item.value} EP
                                <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
                            </div>
                            
                            <div 
                                className={`w-full max-w-[16px] rounded-full transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] relative z-10 ${
                                    item.value > 0 
                                    ? 'bg-gradient-to-t from-blue-600 via-sky-500 to-cyan-300 shadow-[0_0_24px_rgba(56,189,248,0.28)] group-hover:from-blue-400 group-hover:to-cyan-200' 
                                    : 'bg-zinc-800/40'
                                }`}
                                style={{ 
                                    height: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 5 : 2)}%`,
                                }}
                            >
                                {item.value > 0 && (
                                    <div className="absolute inset-x-0 top-0 h-1/2 bg-white/20 rounded-t-full" />
                                )}
                            </div>
                            
                            {(scale !== 'month' || i % 5 === 0) && (
                                <span className={`text-[9px] font-bold font-mono transition-colors duration-300 ${item.value > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                    {item.label}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 xl:flex xl:flex-col gap-3 xl:h-64">
                    <div className="flex-1 rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-3 flex flex-col justify-between">
                        <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">Peak Point</div>
                        <div className="flex items-end justify-between gap-2">
                            <span className="text-xl font-display text-zinc-100 leading-tight">{statsData.peakPoint.label}</span>
                            <span className="text-[10px] text-zinc-500 font-mono pb-0.5">max {statsData.peakPoint.value} EP</span>
                        </div>
                    </div>
                    <div className="flex-1 rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-3 flex flex-col justify-between">
                        <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">Active Days</div>
                        <div className="flex items-end justify-between gap-2">
                            <span className="text-xl font-mono text-emerald-300">{statsData.activeDays}</span>
                            <span className="text-[10px] text-zinc-500 pb-0.5">有记录天</span>
                        </div>
                    </div>
                    <div className="flex-1 rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-3 flex flex-col justify-between">
                        <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">Library Cov.</div>
                        <div className="flex items-end justify-between gap-2">
                            <span className="text-xl font-mono text-cyan-300">{statsData.libraryCoverage}%</span>
                            <span className="text-[10px] text-zinc-500 pb-0.5">整库占比</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
