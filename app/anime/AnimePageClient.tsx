"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MagnifyingGlassIcon, TvIcon, TagIcon, SparklesIcon, FireIcon } from '@heroicons/react/24/outline';
import AnimeHeader from '@/components/anime/AnimeHeader';
import AnimeFilterBar from '@/components/anime/AnimeFilterBar';
import AnimeForm from '@/components/anime/AnimeForm';
import AnimeGrid from '@/components/anime/AnimeGrid';
import { containsCjkText, matchesTextQuery, uniqueStrings } from '@/lib/anime-cast';
import type { AnimeStatus, AnimeSortBy, SessionUser, AnimeListItem, AnimeCardItem } from '@/lib/anime-shared';

export default function AnimePageClient() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAdmin = (session?.user as SessionUser | undefined)?.role === 'admin';
  const [items, setItems] = useState<AnimeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickMessage, setQuickMessage] = useState('');
  
  // 筛选与排序状态
  const [filterStatus, setFilterStatus] = useState<AnimeStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [castQuery, setCastQuery] = useState('');
  const [sortBy, setSortBy] = useState<AnimeSortBy>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // 从 URL 读取页码，默认 1，缺失时回退 sessionStorage
  const currentPage = useMemo(() => {
    const urlPage = Number(searchParams.get('page'));
    return Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1;
  }, [searchParams]);

  const setCurrentPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`?${params.toString()}`, { scroll: false });
    sessionStorage.setItem('anime_last_page', String(page));
  }, [router, searchParams]);

  // 缺少页码时，用上次停留的页码填充 URL
  useEffect(() => {
    if (!searchParams.get('page')) {
      const cached = sessionStorage.getItem('anime_last_page');
      if (cached) {
        const cachedPage = Number(cached);
        if (Number.isFinite(cachedPage) && cachedPage > 0) {
          setCurrentPage(cachedPage);
        }
      }
    }
  }, [searchParams, setCurrentPage]);

  const pageSize = 12;

  // 表单初始数据
  const [formData, setFormData] = useState({
    title: '',
    originalTitle: '',
    progress: '0',
    totalEpisodes: '',
    status: 'watching' as AnimeStatus,
    notes: '',
    coverUrl: '',
    tags: '',
    durationMinutes: '',
    startDate: '',
    endDate: '',
    isFinished: false,
  });

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/anime');
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? (data as AnimeListItem[]) : []);
      }
    } catch (err) {
      console.error('Failed to load anime:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    // 只有当过滤器改变时才重置到第一页
    if (currentPage !== 1 && (filterStatus !== 'all' || searchQuery !== '' || castQuery !== '')) {
        setCurrentPage(1);
    }
  }, [currentPage, filterStatus, searchQuery, castQuery, sortBy, sortOrder, setCurrentPage]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      title: '',
      originalTitle: '',
      progress: '0',
      totalEpisodes: '',
      status: 'watching',
      notes: '',
      coverUrl: '',
      tags: '',
      durationMinutes: '',
      startDate: '',
      endDate: '',
      isFinished: false,
    });
  };

  const startEdit = (item: AnimeCardItem) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      originalTitle: item.originalTitle || '',
      progress: String(item.progress),
      totalEpisodes: item.totalEpisodes ? String(item.totalEpisodes) : '',
      status: item.status,
      notes: item.notes || '',
      coverUrl: item.coverUrl || '',
      tags: item.tags ? item.tags.join(', ') : '',
      durationMinutes: item.durationMinutes ? String(item.durationMinutes) : '',
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      isFinished: item.isFinished || false,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateProgress = async (id: number, current: number, total?: number | null) => {
    if (current < 0) return;
    try {
      const isFinishing = total && current >= total;
      const res = await fetch(`/api/anime/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          progress: current,
          status: isFinishing ? 'completed' : undefined,
          recordHistory: true
        })
      });
      if (res.ok) loadItems();
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const deleteAnime = async (id: number) => {
    if (!confirm('确定要删除这部番剧吗？')) return;
    try {
      const res = await fetch(`/api/anime/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadItems();
        resetForm();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleQuickRecord = async () => {
    const text = quickInput.trim();
    if (!text) {
      setQuickMessage('请输入一句话记录');
      return;
    }

    setQuickLoading(true);
    setQuickMessage('');

    try {
      const res = await fetch('/api/anime/quick-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setQuickMessage(data.error || 'AI录入失败');
        return;
      }

      await loadItems();
      setQuickInput('');

      const title = data?.entry?.title || '番剧';
      const progress = data?.entry?.progress;
      const stateText = data?.created ? '已新建并记录' : '已记录';
      setQuickMessage(`${stateText}：${title}${Number.isFinite(progress) ? `（EP ${progress}）` : ''}`);
    } catch (error) {
      console.error('Quick record failed:', error);
      setQuickMessage('AI录入失败，请稍后重试');
    } finally {
      setQuickLoading(false);
    }
  };

  const voiceActorSuggestions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of items) {
      const names = uniqueStrings([
        ...(item.castAliases || []).filter((name: string) => containsCjkText(name)),
        ...(item.cast || []),
      ]);
      for (const name of names) {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([name]) => name);
  }, [items]);

  // 综合过滤与排序
  const filteredItems = useMemo(() => {
    const result = items.filter(item => {
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      const matchesSearch = matchesTextQuery(searchQuery, [item.title, item.originalTitle], item.cast, item.castAliases);
      const matchesCast = matchesTextQuery(castQuery, item.cast, item.castAliases);
      return matchesStatus && matchesSearch && matchesCast;
    });

    return result.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      
      // 处理数值类排序
      if (sortBy === 'score' || sortBy === 'progress') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      // 处理日期类排序，空日期排在最后
      if (sortBy === 'startDate' || sortBy === 'endDate' || sortBy === 'updatedAt' || sortBy === 'createdAt') {
          if (!valA && !valB) return 0;
          if (!valA) return 1;
          if (!valB) return -1;
      }
      
      const comparableA = valA ?? '';
      const comparableB = valB ?? '';

      if (comparableA < comparableB) return sortOrder === 'asc' ? -1 : 1;
      if (comparableA > comparableB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, filterStatus, searchQuery, castQuery, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (safePage !== currentPage) setCurrentPage(safePage);
  }, [safePage, currentPage, setCurrentPage]);

  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  return (
    <main className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8 pb-20">
      <AnimeHeader 
        showForm={showForm}
        editingId={editingId}
        setShowForm={setShowForm}
        resetForm={resetForm}
        isAdmin={isAdmin}
      />

      {isAdmin && (
        <section className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-300 uppercase tracking-wider">
            <SparklesIcon className="w-4 h-4 text-cyan-400" />
            AI 一句话录入
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuickRecord();
            }}
            className="mt-3 flex flex-col md:flex-row gap-2"
          >
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="例如：今天看了 间谍过家家第三季 第1集"
              className="flex-1 bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
            />
            <button
              type="submit"
              disabled={quickLoading}
              className="px-4 py-2.5 rounded-xl bg-cyan-500/90 hover:bg-cyan-400 text-black text-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {quickLoading ? '录入中...' : 'AI录入'}
            </button>
          </form>

          <p className="text-xs text-zinc-500 mt-2">自动识别番名、集数并更新进度，同时写入观看历史。</p>
          {quickMessage && (
            <p className={`text-xs mt-2 ${quickMessage.includes('失败') || quickMessage.includes('请输入') ? 'text-red-400' : 'text-emerald-400'}`}>
              {quickMessage}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          <div className="space-y-4">
            {/* 搜索框 */}
            <div className="relative group shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-zinc-500 group-focus-within:text-purple-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="搜索番剧、原名或声优..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all shadow-xl"
              />
            </div>

            <AnimeFilterBar 
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              castQuery={castQuery}
              setCastQuery={setCastQuery}
              voiceActorSuggestions={voiceActorSuggestions}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              itemsCount={filteredItems.length}
            />
          </div>

          {isAdmin && showForm && (
            <AnimeForm 
              key={editingId || 'new'}
              editingId={editingId}
              initialData={formData}
              resetForm={resetForm}
              loadItems={loadItems}
              deleteAnime={deleteAnime}
            />
          )}

          <AnimeGrid 
            items={pagedItems}
            onEdit={startEdit}
            updateProgress={updateProgress}
            loading={loading}
            isAdmin={isAdmin}
          />

          {!loading && filteredItems.length > 0 && (
            <div className="flex items-center justify-between bg-zinc-900/40 border border-white/5 rounded-2xl px-4 py-3">
              <button
                type="button"
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-white/5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <div className="text-xs text-zinc-400">
                第 {safePage} / {totalPages} 页
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-white/5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6 sticky top-8">
          {/* 库统计 */}
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TvIcon className="w-20 h-20 text-white" />
             </div>
             <h3 className="text-base font-bold text-zinc-300 mb-8 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                库统计
             </h3>
             <div className="grid grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-all group/stat">
                  <p className="text-xs text-blue-400 font-bold uppercase mb-3 tracking-wider group-hover/stat:translate-x-1 transition-transform">还没看完</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-bold text-white tracking-tighter leading-none">{items.filter(i => i.status !== 'completed').length}</p>
                    <p className="text-xs text-zinc-500 font-bold">部</p>
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-all group/stat">
                  <p className="text-xs text-emerald-400 font-bold uppercase mb-3 tracking-wider group-hover/stat:translate-x-1 transition-transform">已经看完</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-bold text-white tracking-tighter leading-none">{items.filter(i => i.status === 'completed').length}</p>
                    <p className="text-xs text-zinc-500 font-bold">部</p>
                  </div>
                </div>
             </div>
             
             <div className="mt-8 pt-8 border-t border-white/5 space-y-6">
                <div className="flex justify-between items-center group/info">
                    <span className="text-sm font-medium text-zinc-500 group-hover/info:text-zinc-300 transition-colors">累计观看剧集</span>
                    <span className="text-lg font-mono font-bold text-zinc-200 tracking-tight">
                        {items.reduce((acc, curr) => acc + (Number(curr.progress) || 0), 0)} <span className="text-[10px] text-zinc-600 ml-1 uppercase">Episodes</span>
                    </span>
                </div>
                <div className="flex justify-between items-center group/info">
                    <span className="text-sm font-medium text-zinc-500 group-hover/info:text-zinc-300 transition-colors">累计时间估计</span>
                    <span className="text-lg font-mono font-bold text-blue-400 tracking-tight">
                        {(() => {
                            const totalMinutes = items.reduce((acc, curr) => {
                                const prog = Number(curr.progress) || 0;
                                const duration = Number(curr.durationMinutes) || 24; // 默认24分钟
                                return acc + (prog * duration);
                            }, 0);
                            const hours = Math.floor(totalMinutes / 60);
                            const days = (hours / 24).toFixed(1);
                            return `${hours}h / ${days}d`;
                        })()}
                    </span>
                </div>
             </div>
          </div>

          {/* 风格偏好 */}
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TagIcon className="w-20 h-20 text-white" />
             </div>
             <h3 className="text-base font-bold text-zinc-300 mb-8 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></span>
                风格偏好
             </h3>
             <div className="flex flex-wrap gap-2.5 relative z-10">
                {Array.from(new Set(items.flatMap(i => i.tags || [])))
                    .map(tag => ({ 
                        tag, 
                        count: items.filter(i => (i.tags || []).includes(tag)).length 
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 18)
                    .map(({ tag, count }) => (
                        <div key={tag} className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-zinc-950/50 border border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group/tag">
                            <span className="text-xs font-medium text-zinc-400 group-hover/tag:text-purple-300 transition-colors">{tag}</span>
                            <span className="text-[10px] text-zinc-600 font-mono group-hover/tag:text-purple-500/50">{count}</span>
                        </div>
                    ))}
             </div>
          </div>

          {/* 最近更新 */}
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <FireIcon className="w-16 h-16 text-white" />
             </div>
             <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                最近动态
             </h3>
             <div className="space-y-3 relative z-10">
                {items
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .slice(0, 5)
                  .map(item => (
                    <div 
                        key={item.id} 
                        onClick={() => isAdmin && startEdit(item)}
                        className={`flex items-center gap-3 p-2.5 -mx-2 rounded-xl transition-all ${isAdmin ? 'cursor-pointer hover:bg-white/5 hover:translate-x-1' : ''} group/item`}
                    >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 border border-white/5 group-hover/item:border-blue-500/30 transition-colors shadow-lg">
                            {item.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.coverUrl} className="w-full h-full object-cover transition-transform group-hover/item:scale-110" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600 uppercase">IMG</div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-zinc-200 truncate group-hover/item:text-blue-400 transition-colors uppercase tracking-tight">{item.title}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-2">
                                <span className="font-medium">{item.status === 'completed' ? '已看完' : `看到第 ${item.progress} 集`}</span>
                                <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
                                <span className="italic font-mono">{new Date(item.updatedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                            </div>
                        </div>
                        {isAdmin && (
                            <div className="opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <div className="p-1 rounded-md bg-blue-500/10 text-blue-400">
                                    <SparklesIcon className="w-3 h-3" />
                                </div>
                            </div>
                        )}
                    </div>
                  ))}
             </div>
          </div>
        </div>
      </div>

    </main>
  );
}

