import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { listAnimeRecords, createAnimeRecord, CreateAnimeDTO, AnimeStatus } from '@/lib/anime';
import { enrichAnimeData, buildVoiceActorAliases } from '@/lib/ai';
import { normalizeStringArray, uniqueStrings } from '@/lib/anime-cast';
import { fetchAnimeMetadataByQueries } from '@/lib/anime-provider';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as AnimeStatus | undefined;
  
  try {
    const list = await listAnimeRecords(status);
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'admin') {
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
        studio: json.studio,
        director: json.director,
        originalWork: json.originalWork,
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

    // 1. AI Enrichment FIRST (DeepSeek/LLM) 
    // AI is better at understanding things like "第一季" and providing Chinese synopsis
    let aiEnriched = false;
    try {
        console.log(`Enriching anime with AI: ${originalUserTitle}`);
        const enriched = await enrichAnimeData(originalUserTitle);
        if (enriched) {
            console.log('Enriched data:', enriched);
            aiEnriched = true;
            data.title = enriched.officialTitle; 
            if (enriched.originalTitle) {
              data.originalTitle = enriched.originalTitle;
            }
            data.totalEpisodes = enriched.totalEpisodes || undefined;
            data.durationMinutes = enriched.durationMinutes || undefined;
            data.summary = enriched.synopsis; // Prioritize AI Chinese synopsis
            
            if (enriched.tags && (!data.tags || data.tags.length === 0)) {
               data.tags = enriched.tags;
            }
            if (enriched.isFinished !== undefined) {
                data.isFinished = enriched.isFinished;
            }

            // COVER LOGIC: If AI found a cover, and the title was standardized (changed),
            // OR if we didn't have a cover yet, use the AI-found cover.
            // This ensures that "bad" covers from non-standard names are replaced.
            if (enriched.coverUrl) {
                const titleChanged = enriched.officialTitle !== originalUserTitle;
                if (!data.coverUrl || titleChanged) {
                    console.log(`Using AI cover because: ${titleChanged ? 'Title changed' : 'Missing cover'}`);
                    data.coverUrl = enriched.coverUrl;
                }
            }
        }
    } catch (e) {
        console.error('AI Enrichment failed:', e);
    }

    // 2. Fetch Metadata from Providers (Bangumi / Jikan) 
    // Best for assets like high-res covers, accurate episode counts, and scores
    try {
        console.log(`Fetching provider metadata for: ${data.title}`);
        const metadata = await fetchAnimeMetadataByQueries(data.originalTitle, data.title);
        if (metadata) {
            // Only update if missing, if title was standardized by AI, or if provider has better factual data
            const titleWasStandardized = aiEnriched && data.title !== originalUserTitle;
            if (metadata.coverUrl && (!data.coverUrl || data.coverUrl.includes('placeholder') || titleWasStandardized)) {
                data.coverUrl = metadata.coverUrl;
            }
            if (metadata.totalEpisodes && !data.totalEpisodes) {
                data.totalEpisodes = metadata.totalEpisodes;
            }
            if (metadata.score && !data.score) {
                data.score = metadata.score;
            }
            // If we don't have a summary from AI, use provider's (even if English)
            if (metadata.description && !data.summary) {
                data.summary = metadata.description;
            }
            if (metadata.originalTitle && !data.originalTitle) {
                data.originalTitle = metadata.originalTitle;
            }
            if (metadata.studio && !data.studio) {
                data.studio = metadata.studio;
            }
            if (metadata.director && !data.director) {
                data.director = metadata.director;
            }
            if (metadata.originalWork && !data.originalWork) {
                data.originalWork = metadata.originalWork;
            }
            if (metadata.cast && metadata.cast.length > 0 && (!data.cast || data.cast.length === 0)) {
                data.cast = metadata.cast;
            }
            if (metadata.castAliases && metadata.castAliases.length > 0) {
                data.castAliases = uniqueStrings([...(data.castAliases || []), ...metadata.castAliases]);
            }
            if (metadata.isFinished !== undefined && data.isFinished === undefined) {
                data.isFinished = metadata.isFinished;
            }
        }
    } catch (e) {
        console.error('Metadata fetch failed:', e);
    }

    if (data.cast && data.cast.length > 0) {
        try {
            data.castAliases = await buildVoiceActorAliases(data.cast, data.castAliases || []);
        } catch (e) {
            console.error('Voice actor alias generation failed:', e);
            data.castAliases = uniqueStrings([...(data.castAliases || []), ...data.cast]);
        }
    }

    // Auto-complete logic: if status is completed or has end date, set progress to total
    if ((data.status === 'completed' || data.endDate) && data.totalEpisodes) {
        data.progress = data.totalEpisodes;
        if (!data.status) data.status = 'completed';
    }

    const newRecord = await createAnimeRecord(data);

    return NextResponse.json(newRecord);
  } catch (error: any) {
    console.error('Anime create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
