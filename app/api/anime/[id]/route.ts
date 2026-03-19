import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { deleteAnimeRecord, getAnimeRecord, updateAnimeRecord, AnimeRecord } from '@/lib/anime';
import { buildVoiceActorAliases } from '@/lib/ai';
import { normalizeStringArray } from '@/lib/anime-cast';
import { addBatchWatchHistory, deleteWatchHistoryByAnime } from '@/lib/history';
import { query } from '@/lib/db';

type SessionUser = {
  role?: string;
};

function parseId(idParam: string) {
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const id = parseId(context.params.id);
  if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const record = await getAnimeRecord(id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(record);
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as SessionUser | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以删除数据' }, { status: 403 });
  }

  const id = parseId(context.params.id);
  if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await deleteAnimeRecord(id);
  // Also clean up history when anime is deleted
  await deleteWatchHistoryByAnime(id);
  
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as SessionUser | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以修改数据' }, { status: 403 });
  }

  const id = parseId(context.params.id);
  if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const before = await getAnimeRecord(id);
  const body = await request.json();
  const normalizedBody = {
    ...body,
    tags: normalizeStringArray(body.tags) ?? body.tags,
    cast: normalizeStringArray(body.cast) ?? body.cast,
    castAliases: normalizeStringArray(body.castAliases) ?? body.castAliases,
  };
  const allowedKeys = ['title', 'originalTitle', 'status', 'progress', 'score', 'totalEpisodes', 'notes', 'coverUrl', 'durationMinutes', 'tags', 'summary', 'startDate', 'endDate', 'premiereDate', 'cast', 'castAliases', 'isFinished'] as const;
  type AllowedKey = (typeof allowedKeys)[number];
  const updateData: Partial<AnimeRecord> = {};

  for (const key of allowedKeys) {
    const value = normalizedBody[key];
    if (value !== undefined) {
      (updateData as Record<AllowedKey, unknown>)[key] = value;
    }
  }

  if (updateData.cast !== undefined) {
    try {
      updateData.castAliases = await buildVoiceActorAliases(updateData.cast, updateData.castAliases || before?.castAliases || []);
    } catch (error) {
      console.error('Voice actor alias generation failed:', error);
    }
  }

  // Auto-complete logic
  const newProgress = updateData.progress !== undefined ? updateData.progress : before?.progress;
  const newTotal = updateData.totalEpisodes !== undefined ? updateData.totalEpisodes : before?.totalEpisodes;
  const newStatus = updateData.status !== undefined ? updateData.status : before?.status;

  // 1. If progress hits max, auto-complete
  if (newTotal && newProgress !== undefined && newProgress >= newTotal) {
      if (newStatus !== 'completed') {
           updateData.status = 'completed';
      }
      // If closing today and no end date set
      if (!updateData.endDate && !before?.endDate) {
          updateData.endDate = new Date().toISOString().split('T')[0];
      }
  }

  const updated = await updateAnimeRecord(id, updateData);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (before) {
    const delta = updated.progress - before.progress;
    // Only record history if explicitly requested (usually from the +1 button)
    if (delta > 0 && body.recordHistory) {
        await addBatchWatchHistory(updated.id, updated.title, before.progress + 1, updated.progress);
    } else if (delta < 0) {
        // If progress decreased, remove history entries beyond new progress to keep it consistent
        await query(
            'DELETE FROM watch_history WHERE animeId = ? AND episode > ?', 
            [updated.id, updated.progress]
        );
    }
  }

  return NextResponse.json({ ok: true, entry: updated });
}
