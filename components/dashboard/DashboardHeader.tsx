
"use client";

import { memo, useEffect, useState } from 'react';
import { formatTime, formatDate } from '@/lib/utils';

const TimeDisplay = memo(function TimeDisplay() {
    const [nowText, setNowText] = useState<{ time: string; date: string } | null>(null);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setNowText({ time: formatTime(now), date: formatDate(now) });
        };
        tick();
        const interval = window.setInterval(tick, 1000);
        return () => window.clearInterval(interval);
    }, []);

    return (
        <p className="text-muted-foreground font-mono text-sm opacity-60 min-h-[1.25rem]">
            {nowText ? `${nowText.date} · ${nowText.time}` : ''}
        </p>
    );
});

interface DashboardHeaderProps {
    isLoading: boolean;
    isRefreshing: boolean;
}

export default function DashboardHeader({ isLoading, isRefreshing }: DashboardHeaderProps) {
    return (
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 mb-10 relative z-10">
            <div className="space-y-3 max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-[0.32em]">
                        Private Anime Observatory
                    </div>
                    <div className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.28em]">
                        Metadata Enabled
                    </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight text-foreground/95 flex items-center gap-4">
                    动漫记录总览
                </h1>
                <p className="text-sm md:text-base text-zinc-400 leading-7 max-w-2xl">
                    把观看记录、评分、作品原名、制作信息和时间节律放进同一张总览里，让首页更像一座会呼吸的番剧档案馆。
                </p>
                <TimeDisplay />
            </div>
            <div className="flex items-center gap-3 self-stretch xl:self-auto">
                <div className="glass-panel px-4 py-3 rounded-[22px] min-w-[220px]">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Scene</div>
                    <div className="mt-2 text-sm text-zinc-200 leading-6">总览页现在会优先展示作品质感、观看节律和片库画像。</div>
                </div>
                {(isLoading || isRefreshing) && (
                    <div className="flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-[10px] font-mono text-blue-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
                        {isLoading ? '初始化数据中...' : '数据同步中...'}
                    </div>
                )}
            </div>
        </div>
    );
}
