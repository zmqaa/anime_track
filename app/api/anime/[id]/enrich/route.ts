import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getAnimeRecord, updateAnimeRecord, CreateAnimeDTO } from '@/lib/anime';
import { enrichAnimeInput } from '@/lib/anime-enrichment';

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

function sameArray(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as SessionUser | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以执行 AI 补全' }, { status: 403 });
  }

  const id = parseId(context.params.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const record = await getAnimeRecord(id);
  if (!record) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const baseInput: CreateAnimeDTO = {
    title: record.title,
    originalTitle: record.originalTitle,
    coverUrl: record.coverUrl,
    status: record.status,
    score: record.score,
    progress: record.progress,
    totalEpisodes: record.totalEpisodes,
    durationMinutes: record.durationMinutes,
    notes: record.notes,
    tags: record.tags,
    originalWork: record.originalWork,
    cast: record.cast,
    castAliases: record.castAliases,
    summary: record.summary,
    startDate: record.startDate,
    endDate: record.endDate,
    premiereDate: record.premiereDate,
    isFinished: record.isFinished,
  };

  const enriched = await enrichAnimeInput(baseInput, {
    mode: 'fill-missing',
    originalUserTitle: record.title,
  });

  const patch: Partial<CreateAnimeDTO> = {};

  if (enriched.title && enriched.title !== record.title) {
    patch.title = enriched.title;
  }

  if (enriched.coverUrl && enriched.coverUrl !== record.coverUrl) {
    patch.coverUrl = enriched.coverUrl;
  }
  if (enriched.originalTitle && enriched.originalTitle !== record.originalTitle) {
    patch.originalTitle = enriched.originalTitle;
  }
  if (enriched.totalEpisodes && enriched.totalEpisodes !== record.totalEpisodes) {
    patch.totalEpisodes = enriched.totalEpisodes;
  }
  if (enriched.durationMinutes && enriched.durationMinutes !== record.durationMinutes) {
    patch.durationMinutes = enriched.durationMinutes;
  }
  if (enriched.score && enriched.score !== record.score) {
    patch.score = enriched.score;
  }
  if (enriched.summary && enriched.summary !== record.summary) {
    patch.summary = enriched.summary;
  }
  if (enriched.originalWork && enriched.originalWork !== record.originalWork) {
    patch.originalWork = enriched.originalWork;
  }
  if (Array.isArray(enriched.tags) && enriched.tags.length > 0 && !sameArray(enriched.tags, record.tags)) {
    patch.tags = enriched.tags;
  }
  if (Array.isArray(enriched.cast) && enriched.cast.length > 0 && !sameArray(enriched.cast, record.cast)) {
    patch.cast = enriched.cast;
  }
  if (Array.isArray(enriched.castAliases) && enriched.castAliases.length > 0 && !sameArray(enriched.castAliases, record.castAliases)) {
    patch.castAliases = enriched.castAliases;
  }
  if (enriched.isFinished !== undefined && enriched.isFinished !== record.isFinished) {
    patch.isFinished = enriched.isFinished;
  }

  const appliedFields = Object.keys(patch);
  if (appliedFields.length === 0) {
    return NextResponse.json({ ok: true, appliedFields: [], entry: record });
  }

  const updated = await updateAnimeRecord(id, patch);
  if (!updated) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, appliedFields, entry: updated });
}
