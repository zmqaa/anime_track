import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createAnimeRecord, findAnimeByTitle, getAnimeRecord, updateAnimeRecord, CreateAnimeDTO } from '@/lib/anime';
import { addBatchWatchHistory, addWatchHistory } from '@/lib/history';
import { parseWatchInput } from '@/lib/ai';
import { enrichAnimeInput } from '@/lib/anime-enrichment';

type SessionUser = {
  role?: string;
};

function normalizeDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolveTargetEpisode(parsedEpisode: number | undefined, currentProgress: number): number {
  if (parsedEpisode && parsedEpisode > 0) {
    return parsedEpisode;
  }

  return Math.max(1, currentProgress + 1);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as SessionUser | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以使用 AI 录入' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: '请输入一句话记录' }, { status: 400 });
    }

    const parsed = await parseWatchInput(text);
    if (!parsed?.animeTitle) {
      return NextResponse.json({ error: '未能识别番剧名称，请换一种说法' }, { status: 400 });
    }

    const watchedAt = normalizeDate(parsed.watchedAt);
    const watchedAtDateString = parsed.watchedAt || toDateString(new Date());

    const anime = await findAnimeByTitle(parsed.animeTitle);

    if (!anime) {
      let input: CreateAnimeDTO = {
        title: parsed.animeTitle,
        originalTitle: parsed.originalTitle,
        status: 'watching',
        progress: 0,
      };

      input = await enrichAnimeInput(input, {
        mode: 'create',
        originalUserTitle: parsed.animeTitle,
      });

      const targetEpisode = resolveTargetEpisode(parsed.episode, 0);
      input.progress = targetEpisode;

      if (!input.startDate) {
        input.startDate = watchedAtDateString;
      }

      if (input.totalEpisodes && input.progress >= input.totalEpisodes) {
        input.status = 'completed';
        if (!input.endDate) {
          input.endDate = watchedAtDateString;
        }
      }

      const created = await createAnimeRecord(input);
      await addWatchHistory(created.id, created.title, targetEpisode, watchedAt);

      const refreshed = await getAnimeRecord(created.id);
      return NextResponse.json({
        ok: true,
        created: true,
        parsed,
        entry: refreshed || created,
      });
    }

    const targetEpisode = resolveTargetEpisode(parsed.episode, anime.progress);

    if (targetEpisode > anime.progress) {
      const patch: Partial<CreateAnimeDTO> = {
        progress: targetEpisode,
      };

      if (anime.totalEpisodes && targetEpisode >= anime.totalEpisodes) {
        patch.status = 'completed';
        if (!anime.endDate) {
          patch.endDate = watchedAtDateString;
        }
      }

      const updated = await updateAnimeRecord(anime.id, patch);
      if (!updated) {
        return NextResponse.json({ error: '更新失败' }, { status: 500 });
      }

      await addBatchWatchHistory(updated.id, updated.title, anime.progress + 1, targetEpisode, watchedAt);

      return NextResponse.json({
        ok: true,
        created: false,
        parsed,
        entry: updated,
      });
    }

    await addWatchHistory(anime.id, anime.title, targetEpisode, watchedAt);
    const latest = await getAnimeRecord(anime.id);

    return NextResponse.json({
      ok: true,
      created: false,
      replay: true,
      parsed,
      entry: latest || anime,
    });
  } catch (error: unknown) {
    console.error('Quick record error:', error);
    const message = error instanceof Error ? error.message : 'AI 录入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
