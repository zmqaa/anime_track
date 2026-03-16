import 'server-only';

import { enrichAnimeData, buildVoiceActorAliases } from './ai';
import { fetchAnimeMetadataByQueries } from './anime-provider';
import { uniqueStrings } from './anime-cast';
import { CreateAnimeDTO } from './anime';

export type AnimeEnrichmentMode = 'create' | 'fill-missing';

export interface AnimeEnrichmentOptions {
  mode?: AnimeEnrichmentMode;
  originalUserTitle?: string;
}

function isBlank(value: string | undefined | null): boolean {
  return !value || !value.trim();
}

function shouldFillNumber(value: number | undefined | null): boolean {
  return value === undefined || value === null || !Number.isFinite(value) || value <= 0;
}

function shouldFillArray(value: string[] | undefined | null): boolean {
  return !Array.isArray(value) || value.length === 0;
}

function hasPlaceholderCover(value: string | undefined | null): boolean {
  return !!value && value.includes('placeholder');
}

export async function enrichAnimeInput(input: CreateAnimeDTO, options: AnimeEnrichmentOptions = {}): Promise<CreateAnimeDTO> {
  const mode = options.mode || 'create';
  const originalUserTitle = (options.originalUserTitle || input.title || '').trim();

  const data: CreateAnimeDTO = {
    ...input,
    tags: input.tags ? [...input.tags] : undefined,
    cast: input.cast ? [...input.cast] : undefined,
    castAliases: input.castAliases ? [...input.castAliases] : undefined,
  };

  if (!originalUserTitle) {
    return data;
  }

  let titleWasStandardized = false;

  try {
    const enriched = await enrichAnimeData(originalUserTitle);
    if (enriched) {
      if (mode === 'create' && !isBlank(enriched.officialTitle)) {
        const officialTitle = enriched.officialTitle.trim();
        titleWasStandardized = officialTitle !== originalUserTitle;
        data.title = officialTitle;
      }

      if (isBlank(data.originalTitle) && !isBlank(enriched.originalTitle)) {
        data.originalTitle = enriched.originalTitle;
      }

      if (shouldFillNumber(data.totalEpisodes) && enriched.totalEpisodes) {
        data.totalEpisodes = enriched.totalEpisodes;
      }

      if (shouldFillNumber(data.durationMinutes) && enriched.durationMinutes) {
        data.durationMinutes = enriched.durationMinutes;
      }

      if (isBlank(data.summary) && !isBlank(enriched.synopsis)) {
        data.summary = enriched.synopsis;
      }

      if (shouldFillArray(data.tags) && Array.isArray(enriched.tags) && enriched.tags.length > 0) {
        data.tags = enriched.tags;
      }

      if (data.isFinished === undefined && enriched.isFinished !== undefined) {
        data.isFinished = enriched.isFinished;
      }

      if (
        !isBlank(enriched.coverUrl) &&
        (isBlank(data.coverUrl) || hasPlaceholderCover(data.coverUrl) || (mode === 'create' && titleWasStandardized))
      ) {
        data.coverUrl = enriched.coverUrl;
      }
    }
  } catch (error) {
    console.error('AI enrichment failed:', error);
  }

  try {
    const metadata = await fetchAnimeMetadataByQueries(data.originalTitle, data.title, originalUserTitle);
    if (metadata) {
      if (!isBlank(metadata.coverUrl) && (isBlank(data.coverUrl) || hasPlaceholderCover(data.coverUrl))) {
        data.coverUrl = metadata.coverUrl;
      }

      if (shouldFillNumber(data.totalEpisodes) && metadata.totalEpisodes) {
        data.totalEpisodes = metadata.totalEpisodes;
      }

      if (shouldFillNumber(data.score) && metadata.score) {
        data.score = metadata.score;
      }

      if (isBlank(data.summary) && !isBlank(metadata.description)) {
        data.summary = metadata.description;
      }

      if (isBlank(data.originalTitle) && !isBlank(metadata.originalTitle)) {
        data.originalTitle = metadata.originalTitle;
      }

      if (isBlank(data.originalWork) && !isBlank(metadata.originalWork)) {
        data.originalWork = metadata.originalWork;
      }

      if (shouldFillArray(data.cast) && Array.isArray(metadata.cast) && metadata.cast.length > 0) {
        data.cast = metadata.cast;
      }

      if (Array.isArray(metadata.castAliases) && metadata.castAliases.length > 0) {
        data.castAliases = uniqueStrings([...(data.castAliases || []), ...metadata.castAliases]);
      }

      if (data.isFinished === undefined && metadata.isFinished !== undefined) {
        data.isFinished = metadata.isFinished;
      }
    }
  } catch (error) {
    console.error('Provider metadata enrichment failed:', error);
  }

  if (Array.isArray(data.cast) && data.cast.length > 0) {
    try {
      data.castAliases = await buildVoiceActorAliases(data.cast, data.castAliases || []);
    } catch (error) {
      console.error('Voice actor alias generation failed:', error);
      data.castAliases = uniqueStrings([...(data.castAliases || []), ...data.cast]);
    }
  }

  return data;
}
