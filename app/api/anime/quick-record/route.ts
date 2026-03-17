import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createAnimeRecord, findAnimeByTitle, getAnimeRecord, updateAnimeRecord, CreateAnimeDTO, listAnimeRecordsByExactTitle, AnimeRecord } from '@/lib/anime';
import { addBatchWatchHistory, addWatchHistory } from '@/lib/history';
import { parseWatchInput } from '@/lib/ai';
import { enrichAnimeInput } from '@/lib/anime-enrichment';
import { uniqueStrings } from '@/lib/anime-cast';

type SessionUser = {
  role?: string;
};

function parseRewatchCountToken(token: string): number | undefined {
  const normalized = token.trim();
  if (!normalized) {
    return undefined;
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 2 ? parsed : undefined;
  }

  const digitMap: Record<string, number> = {
    '零': 0,
    '〇': 0,
    '一': 1,
    '二': 2,
    '两': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
  };

  let value = 0;
  let current = 0;

  for (const char of normalized) {
    if (digitMap[char] !== undefined) {
      current = digitMap[char];
      continue;
    }

    if (char === '十') {
      value += (current || 1) * 10;
      current = 0;
      continue;
    }

    return undefined;
  }

  value += current;
  return value >= 2 ? value : undefined;
}

function detectRewatchTag(text: string): string | undefined {
  const compact = text.replace(/\s+/g, '');
  if (!compact) {
    return undefined;
  }

  const countToken = compact.match(/([0-9]{1,3}|[一二两三四五六七八九十]+)\s*刷/i)?.[1];
  if (countToken) {
    const count = parseRewatchCountToken(countToken);
    if (count && count >= 2) {
      return `${count}刷`;
    }
  }

  if (/二周目|重刷|重温|再刷/i.test(compact)) {
    return '二刷';
  }

  return undefined;
}

function parseRewatchTagCount(tag: string): number | undefined {
  const normalized = tag.trim();
  if (!normalized) {
    return undefined;
  }

  const match = normalized.match(/^([0-9]{1,3}|[一二两三四五六七八九十]+)刷$/i);
  if (!match) {
    return undefined;
  }

  return parseRewatchCountToken(match[1]);
}

function formatRewatchTag(count: number): string {
  const cjkMap: Record<number, string> = {
    2: '二',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十',
  };

  return cjkMap[count] ? `${cjkMap[count]}刷` : `${count}刷`;
}

function resolveNextRewatchTag(records: Pick<AnimeRecord, 'tags'>[]): string {
  let highestCount = 1;

  for (const record of records) {
    if (!Array.isArray(record.tags)) {
      continue;
    }

    for (const tag of record.tags) {
      const parsed = parseRewatchTagCount(tag);
      if (parsed && parsed > highestCount) {
        highestCount = parsed;
      }
    }
  }

  const baselineCount = Math.max(records.length, 1);
  const nextCount = Math.max(2, highestCount + 1, baselineCount + 1);
  return formatRewatchTag(nextCount);
}

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

    const manualRewatchTag = typeof body?.rewatchTag === 'string' ? body.rewatchTag.trim() : '';
    const detectedRewatchTag = detectRewatchTag(text);
    let rewatchTag = detectedRewatchTag || manualRewatchTag || (body?.forceRewatch ? '二刷' : undefined);

    const watchedAt = normalizeDate(parsed.watchedAt);
    const watchedAtDateString = parsed.watchedAt || toDateString(new Date());

    const anime = await findAnimeByTitle(parsed.animeTitle);
    const sameTitleRecords = anime ? await listAnimeRecordsByExactTitle(anime.title) : [];

    // Auto infer rewatch when user records EP1 again on a completed series.
    if (!rewatchTag && anime && parsed.episode === 1) {
      const finishedByProgress = Boolean(anime.totalEpisodes) && anime.progress >= Number(anime.totalEpisodes);
      const finishedByStatus = anime.status === 'completed';
      if (finishedByProgress || finishedByStatus) {
        rewatchTag = resolveNextRewatchTag(sameTitleRecords);
      }
    }

    const forceCreateDuplicate = Boolean(rewatchTag);

    if (!anime || forceCreateDuplicate) {
      let input: CreateAnimeDTO = {
        title: anime?.title || parsed.animeTitle,
        originalTitle: parsed.originalTitle || anime?.originalTitle,
        coverUrl: anime?.coverUrl,
        status: 'watching',
        progress: 0,
        totalEpisodes: anime?.totalEpisodes,
        durationMinutes: anime?.durationMinutes,
        notes: anime?.notes,
        tags: anime?.tags,
        originalWork: anime?.originalWork,
        cast: anime?.cast,
        castAliases: anime?.castAliases,
        summary: anime?.summary,
        premiereDate: anime?.premiereDate,
        isFinished: anime?.isFinished,
      };

      if (!anime) {
        input = await enrichAnimeInput(input, {
          mode: 'create',
          originalUserTitle: parsed.animeTitle,
        });
      }

      if (rewatchTag) {
        input.tags = uniqueStrings([...(input.tags || []), rewatchTag]);
      }

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
        rewatchTag,
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
