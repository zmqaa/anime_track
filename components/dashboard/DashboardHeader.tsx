
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 relative z-10">
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                        Anime Tracker
                    </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-light tracking-tight text-foreground/90 flex items-center gap-4">
                    动漫记录总览
                </h1>
                <TimeDisplay />
            </div>
            <div className="flex items-center gap-4">
                {(isLoading || isRefreshing) && (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        {isLoading ? '初始化数据中...' : '数据同步中...'}
                    </div>
                )}
            </div>
        </div>
    );
}
