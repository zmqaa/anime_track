"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PencilSquareIcon, TrashIcon, CalendarIcon, CheckCircleIcon, ClockIcon, PlayCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { AnimeStatus, AnimeDetailItem } from '@/lib/anime-shared';

const statusMap: Record<AnimeStatus, string> = {
  watching: '追番中',
  completed: '已看完',
  dropped: '已弃坑',
  plan_to_watch: '计划看',
};

const statusColors: Record<AnimeStatus, string> = {
  watching: 'text-green-400 border-green-500/50 bg-green-500/10',
  completed: 'text-blue-400 border-blue-500/50 bg-blue-500/10',
  dropped: 'text-red-400 border-red-500/50 bg-red-500/10',
  plan_to_watch: 'text-purple-400 border-purple-500/50 bg-purple-500/10',
};

export default function AnimeDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
    const [item, setItem] = useState<AnimeDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Edit State
    const [formData, setFormData] = useState<Partial<AnimeDetailItem>>({});
    const [isAiEnriching, setIsAiEnriching] = useState(false);

  // Parse cast string to array for display if needed
  // In API we handle JSON parsing, so item.cast should be string[] or string depending on API return of JSON
  // If API returns plain JSON.parse, it's string[]

  useEffect(() => {
    fetch(`/api/anime/${params.id}`)
      .then(res => {
          if (!res.ok) throw new Error('Not found');
          return res.json();
      })
      .then(data => {
          setItem(data);
          setFormData(data);
      })
      .catch((e) => {
          console.error(e);
          router.push('/anime');
      })
      .finally(() => setLoading(false));
  }, [params.id, router]);

    const handleChange = (key: keyof AnimeDetailItem, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
        const payload: Partial<AnimeDetailItem> & { tags?: string[] | string } = { ...formData };
        if (typeof payload.tags === 'string') {
             payload.tags = payload.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
        }
        
        const res = await fetch(`/api/anime/${params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const response = await res.json();
            const updated = response.entry || response;
            setItem(updated);
            setFormData(updated);
            setIsEditing(false);
        } else {
            alert('保存失败');
        }
    } catch {
        alert('保存出错');
    } finally {
        setSaving(false);
    }
  };
  
  const enrichAnimeInfo = async () => {
      setIsAiEnriching(true);
      try {
          const res = await fetch(`/api/anime/${params.id}/enrich`, { method: 'POST' });
          const response = await res.json().catch(() => ({}));

          if (!res.ok) {
              alert(response.error || 'AI补充失败');
              return;
          }

          const updated = response.entry || item;
          setItem(updated);
          setFormData(updated);

          const appliedCount = Array.isArray(response.appliedFields) ? response.appliedFields.length : 0;
          if (appliedCount === 0) {
              alert('没有可补充的空缺字段');
          }
      } catch (error) {
          console.error(error);
          alert('AI补充失败');
      } finally {
          setIsAiEnriching(false);
      }
  };

  const deleteAnime = async () => {
      if(!confirm('确定删除这部动漫记录吗？不可恢复。')) return;
      await fetch(`/api/anime/${params.id}`, { method: 'DELETE' });
      router.push('/anime');
  };

  if (loading) return <div className="p-12 text-center text-zinc-500">Loading details...</div>;
  if (!item) return null;

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8 animate-in fade-in zoom-in-95 duration-300">
        {/* Nav */}
        <button onClick={() => router.back()} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            <span>返回列表</span>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
            {/* Left Column: Cover & Quick Stats */}
            <div className="space-y-6">
                <div className="aspect-[2/3] w-full rounded-xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/5 relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        src={isEditing ? formData.coverUrl : item.coverUrl} 
                        alt={item.title} 
                        className="w-full h-full object-cover"
                        onError={(e) => e.currentTarget.style.display = 'none'} 
                    />
                    {!item.coverUrl && !formData.coverUrl && (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-700">No Image</div>
                    )}
                    
                    {isEditing && (
                         <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <button type="button" onClick={enrichAnimeInfo} disabled={isAiEnriching} className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200">
                                          {isAiEnriching ? '补充中...' : 'AI补充信息'}
                             </button>
                         </div>
                    )}
                </div>

                {isEditing ? (
                     <div className="space-y-4 bg-zinc-900/50 p-4 rounded-lg border border-white/5">
                        <div>
                             <label className="text-xs text-zinc-500 uppercase font-bold">状态</label>
                             <select 
                                value={formData.status} 
                                onChange={e => handleChange('status', e.target.value)}
                                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm"
                             >
                                 {Object.keys(statusMap).map(s => (
                                     <option key={s} value={s}>{statusMap[s as AnimeStatus]}</option>
                                 ))}
                             </select>
                        </div>
                        <div>
                             <label className="text-xs text-zinc-500 uppercase font-bold">评分 (0-10)</label>
                             <input 
                                type="number" 
                                value={formData.score || ''} 
                                onChange={e => handleChange('score', e.target.value)}
                                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm"
                             />
                        </div>
                     </div>
                ) : (
                    <div className="space-y-4">
                        <div className={`text-center px-4 py-2 rounded-lg border backdrop-blur-sm font-bold tracking-wider ${statusColors[item.status]}`}>
                            {statusMap[item.status]}
                        </div>
                        
                        {item.score && (
                            <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-white/5">
                                <span className="text-sm text-zinc-400">评分</span>
                                <span className="text-xl font-bold text-yellow-500">★ {item.score}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right Column: Details */}
            <div className="flex flex-col gap-6">
                 {/* Header */}
                 <div className="border-b border-white/10 pb-6">
                     <div className="flex justify-between items-start gap-4">
                         <div className="space-y-2 flex-1">
                             {isEditing ? (
                                 <input 
                                    value={formData.title} 
                                    onChange={e => handleChange('title', e.target.value)}
                                    className="w-full bg-transparent text-3xl font-bold text-white border-b border-zinc-700 focus:border-purple-500 focus:outline-none p-1"
                                 />
                             ) : (
                                 <h1 className="text-3xl font-bold text-white leading-tight">{item.title}</h1>
                             )}
                             
                             {isEditing ? (
                                 <input 
                                    value={formData.originalTitle || ''}
                                    placeholder="原名 / 日文名"
                                    onChange={e => handleChange('originalTitle', e.target.value)}
                                    className="w-full bg-transparent text-lg text-zinc-400 border-b border-zinc-800 focus:border-purple-500 focus:outline-none p-1 font-mono"
                                 />
                             ) : (
                                 item.originalTitle && <h2 className="text-xl text-zinc-400 font-medium">{item.originalTitle}</h2>
                             )}
                         </div>

                         <div className="flex gap-2 shrink-0">
                             {isEditing ? (
                                 <>
                                     <button onClick={enrichAnimeInfo} disabled={isAiEnriching} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg disabled:opacity-50">
                                         {isAiEnriching ? 'AI补充中...' : 'AI补充'}
                                     </button>
                                     <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm hover:bg-zinc-800 rounded-lg">取消</button>
                                     <button onClick={saveChanges} disabled={saving} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-purple-900/20">
                                         {saving ? '保存中...' : '保存更改'}
                                     </button>
                                 </>
                             ) : (
                                 <>
                                     <button onClick={enrichAnimeInfo} disabled={isAiEnriching} className="px-3 py-2 text-xs bg-zinc-800/70 border border-white/10 text-zinc-200 hover:bg-zinc-700 rounded-lg disabled:opacity-50">
                                         {isAiEnriching ? 'AI补充中...' : 'AI补充'}
                                     </button>
                                     <button onClick={() => setIsEditing(true)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">
                                         <PencilSquareIcon className="w-5 h-5" />
                                     </button>
                                 </>
                             )}
                         </div>
                     </div>

                     {/* Tags */}
                     <div className="mt-4 flex flex-wrap gap-2">
                         {isEditing ? (
                             <input 
                                value={Array.isArray(formData.tags) ? formData.tags.join(', ') : formData.tags || ''}
                                onChange={e => handleChange('tags', e.target.value)}
                                placeholder="标签 (逗号分隔)"
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                             />
                         ) : (
                             item.tags?.map(tag => (
                                 <span key={tag} className="px-2.5 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                                     #{tag}
                                 </span>
                             ))
                         )}
                     </div>
                 </div>

                 {/* Quick Watch & Resource Links */}
                 {!isEditing && (
                     <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                         {/* Primary Watch Source */}
                         <a 
                            href={`https://bgm.girigirilove.com/search/-------------/?wd=${encodeURIComponent(item.title)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 hover:border-pink-500/40 hover:-translate-y-1 transition-all group relative overflow-hidden"
                         >
                             <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                             <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">🌸</span>
                             <div className="flex flex-col items-center">
                                 <span className="text-xs font-bold text-pink-200">GiriGiri</span>
                                 <span className="text-[10px] text-pink-500/70">首选源</span>
                             </div>
                         </a>

                         {/* Secondary Watch Source */}
                         <a 
                            href={`https://www.agedm.io/search?query=${encodeURIComponent(item.title)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/40 hover:-translate-y-1 transition-all group"
                         >
                             <PlayCircleIcon className="w-8 h-8 text-purple-400 group-hover:text-purple-300 transition-colors" />
                             <span className="text-xs font-medium text-purple-200">AGE 动漫</span>
                         </a>
                     </div>
                 )}

                 {/* Progress Section */}
                 <div className="bg-zinc-900/30 rounded-xl p-6 border border-white/5 space-y-4">
                     <div className="flex items-center justify-between mb-2">
                         <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                             <CheckCircleIcon className="w-4 h-4" /> 观看进度
                         </h3>
                         <span className="font-mono text-zinc-300">
                             {isEditing ? (
                                 <div className="flex items-center gap-2">
                                     <input 
                                        type="number" 
                                        value={formData.progress} 
                                        onChange={e => handleChange('progress', Number(e.target.value))}
                                        className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-center"
                                     />
                                     <span>/</span>
                                     <input 
                                        type="number" 
                                        value={formData.totalEpisodes || ''} 
                                        placeholder="?"
                                        onChange={e => handleChange('totalEpisodes', Number(e.target.value))}
                                        className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-center"
                                     />
                                 </div>
                             ) : (
                                 <><span className="text-white text-xl">{item.progress}</span> / {item.totalEpisodes || '?'}</>
                             )}
                             <span className="text-zinc-500 text-sm ml-1">EP</span>
                         </span>
                     </div>
                     {!isEditing && (
                         <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-1000 ease-out"
                                style={{ width: `${Math.min(100, (item.progress / (item.totalEpisodes || 12)) * 100)}%` }}
                            />
                         </div>
                     )}
                 </div>

                 {/* Staff & Cast Info Grid */}
                 {(item.originalWork || (item.cast && item.cast.length > 0) || isEditing) && (
                     <div className="bg-zinc-900/30 rounded-xl p-5 border border-white/5 space-y-4">
                         <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                             <SparklesIcon className="w-4 h-4" /> 制作阵容
                         </h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                             <div className="space-y-1">
                                 <span className="text-zinc-500 block text-xs">原作 (Original Work)</span>
                                 {isEditing ? (
                                      <input 
                                        value={formData.originalWork || ''} 
                                        onChange={e => handleChange('originalWork', e.target.value)} 
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1" 
                                        placeholder="漫画, 小说..."
                                      />
                                 ) : item.originalWork ? (
                                      <span className="text-zinc-200 font-medium">{item.originalWork}</span> 
                                 ) : <span className="text-zinc-600">-</span>}
                             </div>

                         </div>
                         
                         {/* Cast Section */}
                         <div className="space-y-2 pt-2 border-t border-white/5">
                             <span className="text-zinc-500 block text-xs">声优 (Cast)</span>
                             {isEditing ? (
                                 <textarea 
                                    rows={2}
                                    value={Array.isArray(formData.cast) ? formData.cast.join(', ') : (formData.cast || '')}
                                    placeholder="花泽香菜, 宫野真守 (逗号分隔)"
                                    onChange={e => {
                                        const val = e.target.value;
                                        handleChange('cast', val.split(/[,，]/).map(s => s.trim()).filter(Boolean));
                                    }}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm"
                                 />
                             ) : (
                                 <div className="flex flex-wrap gap-2">
                                     {item.cast && item.cast.length > 0 ? (
                                         item.cast.map((cv: string, idx: number) => (
                                             <Link
                                                 key={`${cv}-${idx}`}
                                                 href={`/anime?cast=${encodeURIComponent(cv)}`}
                                                 className="px-2 py-0.5 bg-zinc-800/50 rounded text-xs text-zinc-300 border border-white/5 hover:bg-purple-500/20 hover:text-purple-200 transition-colors"
                                             >
                                                 {cv}
                                             </Link>
                                         ))
                                     ) : (
                                         <span className="text-zinc-600">-</span>
                                     )}
                                 </div>
                             )}
                         </div>
                     </div>
                 )}

                 {/* Dates & Info Grid */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-zinc-900/30 rounded-xl p-5 border border-white/5 space-y-3">
                          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                              <CalendarIcon className="w-4 h-4" /> 放送日期
                          </h3>
                          <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                  <span className="text-zinc-500">放送状态</span>
                                  {isEditing ? (
                                      <div className="flex items-center gap-2">
                                          <input 
                                            type="checkbox" 
                                            checked={formData.isFinished || false} 
                                            onChange={e => handleChange('isFinished', e.target.checked)} 
                                            className="w-4 h-4 rounded border-zinc-800 text-purple-600 focus:ring-purple-500 bg-zinc-950" 
                                          />
                                          <span className="text-zinc-300">已完结</span>
                                      </div>
                                  ) : (
                                      <span className={item.isFinished ? "text-emerald-400 font-medium" : "text-blue-400 font-medium"}>
                                          {item.isFinished ? '已完结' : '连载中'}
                                      </span>
                                  )}
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-zinc-500">首播</span>
                                  {isEditing ? (
                                      <input type="date" value={formData.premiereDate || ''} onChange={e => handleChange('premiereDate', e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5" />
                                  ) : (
                                      <span className="text-zinc-300">{item.premiereDate || '-'}</span>
                                  )}
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-zinc-500">单集时长</span>
                                  {isEditing ? (
                                      <input type="number" value={formData.durationMinutes || ''} onChange={e => handleChange('durationMinutes', e.target.value)} className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-right" placeholder="Min" />
                                  ) : (
                                      <span className="text-zinc-300">{item.durationMinutes ? `${item.durationMinutes} min` : '-'}</span>
                                  )}
                              </div>
                          </div>
                      </div>

                      <div className="bg-zinc-900/30 rounded-xl p-5 border border-white/5 space-y-3">
                          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                              <ClockIcon className="w-4 h-4" /> 观看记录
                          </h3>
                          <div className="space-y-2 text-sm">
                               <div className="flex justify-between">
                                  <span className="text-zinc-500">开始观看</span>
                                  {isEditing ? (
                                      <input type="date" value={formData.startDate || ''} onChange={e => handleChange('startDate', e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5" />
                                  ) : (
                                      <span className="text-zinc-300">{item.startDate || '-'}</span>
                                  )}
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-zinc-500">看完日期</span>
                                  {isEditing ? (
                                      <input type="date" value={formData.endDate || ''} onChange={e => handleChange('endDate', e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5" />
                                  ) : (
                                      <span className="text-zinc-300">{item.endDate || '-'}</span>
                                  )}
                              </div>
                          </div>
                      </div>
                 </div>

                 {/* Summary */}
                 <div className="space-y-3 pt-4">
                     <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">简介 / 剧情</h3>
                     {isEditing ? (
                         <textarea 
                            rows={5}
                            value={formData.summary || ''}
                            onChange={e => handleChange('summary', e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm leading-relaxed focus:outline-none focus:border-purple-500"
                         />
                     ) : (
                         <p className="text-zinc-300 leading-relaxed text-sm whitespace-pre-wrap">
                             {item.summary || '暂无简介'}
                         </p>
                     )}
                 </div>

                 {/* Notes */}
                 <div className="space-y-3 pt-4 border-t border-white/5">
                     <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">个人备注</h3>
                     {isEditing ? (
                         <textarea 
                            rows={3}
                            value={formData.notes || ''}
                            onChange={e => handleChange('notes', e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm leading-relaxed focus:outline-none focus:border-purple-500"
                         />
                     ) : (
                         <p className="text-zinc-400 italic text-sm">
                             {item.notes || 'No notes.'}
                         </p>
                     )}
                 </div>
                 
                 {isEditing && (
                     <div className="pt-8 border-t border-red-500/20">
                         <button onClick={deleteAnime} className="text-red-500 hover:text-red-400 text-sm flex items-center gap-2">
                             <TrashIcon className="w-4 h-4" /> 删除此番剧
                         </button>
                     </div>
                 )}
            </div>
        </div>
    </div>
  );
}
