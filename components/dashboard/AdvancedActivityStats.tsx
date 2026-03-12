
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

        const historyMap: Record<string, number> = {};
        history.forEach(h => {
            historyMap[h.dateStr] = (historyMap[h.dateStr] || 0) + 1;
        });

        if (scale === 'week') {
            title = "过去 7 日趋势";
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

        return { data, totalEpisodes, totalMinutes, title };
    }, [history, scale]);

    const maxValue = Math.max(...statsData.data.map(d => d.value), 1);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                     <h2 className="text-xl font-bold flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.5)]"></span>
                        观影趋势分析
                    </h2>
                    <p className="text-xs text-zinc-400 font-mono mt-1 uppercase tracking-wider">{statsData.title}</p>
                </div>
                
                <div className="flex bg-zinc-900/90 p-1.5 rounded-2xl border border-white/10 shadow-xl">
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

            <div className="grid grid-cols-3 gap-6">
                <div className="bg-zinc-900/40 border border-white/10 rounded-[24px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">总看番集数</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold font-mono text-zinc-100 tracking-tighter">{statsData.totalEpisodes}</span>
                         <span className="text-xs text-zinc-500 font-bold">EP</span>
                     </div>
                </div>
                <div className="bg-zinc-900/40 border border-white/10 rounded-[24px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">预估时长</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold font-mono text-blue-400 tracking-tighter">{Math.round(statsData.totalMinutes / 60)}</span>
                         <span className="text-xs text-zinc-500 font-bold">HRS</span>
                     </div>
                </div>
                <div className="bg-zinc-900/40 border border-white/10 rounded-[24px] p-5 flex flex-col justify-between group hover:bg-zinc-900/60 transition-all duration-300">
                     <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">活跃效率</span>
                     <div className="mt-3 flex items-baseline gap-2">
                         <span className="text-3xl font-bold font-mono text-green-400 tracking-tighter">
                             {(statsData.totalEpisodes / (scale === 'week' ? 7 : scale === 'month' ? 30 : 365)).toFixed(1)}
                        </span>
                         <span className="text-xs text-zinc-500 font-bold">EP/D</span>
                     </div>
                </div>
            </div>

            <div className="h-48 flex items-end gap-1.5 pl-12 pr-4 py-6 bg-zinc-950/20 rounded-2xl border border-white/5 relative group/chart">
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
                        className="flex-1 flex flex-col items-center gap-3 group relative h-full justify-end"
                    >
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-zinc-950 text-[11px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-30 whitespace-nowrap shadow-[0_10px_20px_rgba(0,0,0,0.4)] translate-y-2 group-hover:translate-y-0">
                            {item.label}: {item.value} EP
                            <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
                        </div>
                        
                        <div 
                            className={`w-full max-w-[14px] rounded-full transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] relative z-10 ${
                                item.value > 0 
                                ? 'bg-gradient-to-t from-blue-600 to-cyan-400 shadow-[0_0_20px_rgba(37,99,235,0.3)] group-hover:from-blue-400 group-hover:to-cyan-300' 
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
        </div>
    );
});
