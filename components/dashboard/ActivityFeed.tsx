
"use client";

import { memo } from 'react';
import { WatchHistoryRecord } from '@/lib/dashboard-types';

export default memo(function ActivityFeed({ history }: { history: WatchHistoryRecord[] }) {
    if (history.length === 0) return <div className="text-zinc-500 text-sm text-center py-4">暂无活动记录</div>;

    const grouped: Record<string, WatchHistoryRecord[]> = {};
    history.slice(0, 15).forEach(item => {
        const dateStr = new Date(item.watchedAt).toLocaleDateString('zh-CN');
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push(item);
    });

    return (
        <div className="space-y-6 relative border-l border-zinc-800 ml-3 pl-6 py-2">
            {Object.entries(grouped).map(([date, items]) => (
                <div key={date} className="relative">
                    <span className="absolute -left-[29px] top-1 w-3 h-3 bg-zinc-800 border-2 border-zinc-900 rounded-full z-10"></span>
                    <h4 className="text-[10px] font-mono text-zinc-600 mb-3 tracking-widest">{date}</h4>
                    <div className="space-y-3">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 group">
                                <span className="text-xs text-zinc-400 group-hover:text-white transition-colors">
                                    观看 <span className="font-bold text-primary/80">{item.animeTitle}</span>
                                </span>
                                <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900/50 px-1.5 py-0.5 rounded border border-white/5">
                                    EP {item.episode}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
});
