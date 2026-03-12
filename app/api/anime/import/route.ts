import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  createAnimeRecord,
  updateAnimeRecord,
  findAnimeByTitle,
  AnimeStatus,
  CreateAnimeDTO
} from '@/lib/anime';

interface IncomingRecord extends Partial<CreateAnimeDTO> {
  title: string;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以导入数据' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const records = Array.isArray(body.records) ? body.records as IncomingRecord[] : [];
    if (records.length === 0) {
      return NextResponse.json({ error: 'records 不能为空' }, { status: 400 });
    }

    let created = 0;
    let updated = 0;

    for (const item of records) {
      if (!item?.title) continue;
      const status = (item.status || 'plan_to_watch') as AnimeStatus;
      const existing = await findAnimeByTitle(item.title);

      // Normalize payload to CreateAnimeDTO shape
      const payload: CreateAnimeDTO = {
        title: item.title,
        originalTitle: item.originalTitle,
        coverUrl: item.coverUrl,
        status,
        score: item.score,
        progress: Number(item.progress ?? 0),
        totalEpisodes: item.totalEpisodes,
        durationMinutes: item.durationMinutes,
        notes: item.notes,
        tags: item.tags || [],
        summary: item.summary,
        startDate: item.startDate,
        endDate: item.endDate,
        premiereDate: item.premiereDate,
        isFinished: item.isFinished,
      };

      if (existing) {
        await updateAnimeRecord(existing.id, payload);
        updated += 1;
      } else {
        await createAnimeRecord(payload);
        created += 1;
      }
    }

    return NextResponse.json({ success: true, created, updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '导入失败' }, { status: 500 });
  }
}
