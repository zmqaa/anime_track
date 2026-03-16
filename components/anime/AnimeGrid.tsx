"use client";

import AnimeCard from './AnimeCard';
import type { AnimeCardItem } from '@/lib/anime-shared';

interface AnimeGridProps {
  items: AnimeCardItem[];
  onEdit: (item: AnimeCardItem) => void;
  updateProgress: (id: number, current: number, total?: number | null) => Promise<void>;
  loading: boolean;
  isAdmin?: boolean;
}

export default function AnimeGrid({ items, onEdit, updateProgress, loading, isAdmin = false }: AnimeGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-zinc-900/50 rounded-2xl aspect-[3/5] animate-pulse border border-white/5" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 bg-zinc-900 border border-white/5 rounded-3xl">
        <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
           <span className="text-2xl">📺</span>
        </div>
        <h3 className="text-white font-medium mb-1">暂无番剧记录</h3>
        <p className="text-zinc-500 text-sm">点击右上角开始添加你的第一部番剧</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
      {items.map((item) => (
        <AnimeCard 
          key={item.id} 
          item={item} 
          onEdit={onEdit} 
          updateProgress={updateProgress}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}
