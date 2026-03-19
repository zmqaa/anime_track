import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { listAnimeRecordsWithLastWatched, createAnimeRecord, CreateAnimeDTO, AnimeStatus } from '@/lib/anime';
import { normalizeStringArray } from '@/lib/anime-cast';
import { enrichAnimeInput } from '@/lib/anime-enrichment';

type SessionUser = {
  role?: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as AnimeStatus | undefined;
  
  try {
    const list = await listAnimeRecordsWithLastWatched(status);
    return NextResponse.json(list);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as SessionUser | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以添加数据' }, { status: 403 });
  }

  try {
    const json = await request.json();
    let data: CreateAnimeDTO = {
        title: json.title,
        originalTitle: json.originalTitle,
        status: json.status || 'plan_to_watch',
        progress: Number(json.progress) || 0,
        coverUrl: json.coverUrl,
        score: json.score,
        totalEpisodes: json.totalEpisodes,
        notes: json.notes,
        durationMinutes: json.durationMinutes,
        tags: normalizeStringArray(json.tags),
        cast: normalizeStringArray(json.cast),
        castAliases: normalizeStringArray(json.castAliases),
        summary: json.summary,
        startDate: json.startDate,
        endDate: json.endDate,
        premiereDate: json.premiereDate,
        isFinished: typeof json.isFinished === 'boolean' ? json.isFinished : undefined
    };

    if (!data.title) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const originalUserTitle = data.title;

    data = await enrichAnimeInput(data, {
        mode: 'create',
        originalUserTitle,
    });

    // Auto-complete logic: if status is completed or has end date, set progress to total
    if ((data.status === 'completed' || data.endDate) && data.totalEpisodes) {
        data.progress = data.totalEpisodes;
        if (!data.status) data.status = 'completed';
    }

    const newRecord = await createAnimeRecord(data);

    return NextResponse.json(newRecord);
  } catch (error: unknown) {
    console.error('Anime create error:', error);
    const message = error instanceof Error ? error.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
