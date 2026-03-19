import 'server-only';

import { enrichAnimeData, buildVoiceActorAliases } from './ai';
import { fetchAnimeMetadataByQueries } from './anime-provider';
import { uniqueStrings } from './anime-cast';
import { CreateAnimeDTO } from './anime';

type MetadataSourceInput = Partial<CreateAnimeDTO> & {
  description?: string;
  synopsis?: string;
};

const metadataMergePolicy = require('./metadata/merge-policy.js') as {
  DEFAULT_METADATA_FIELDS: string[];
  applyMetadataPatch: (
    current: CreateAnimeDTO,
    candidateLike: MetadataSourceInput | { candidate: MetadataSourceInput; source?: Record<string, string> },
    options?: {
      fields?: string[];
      force?: boolean;
      allowReplaceFilledCover?: boolean;
      allowCastAliasAugment?: boolean;
      allowIsFinishedUpgrade?: boolean;
    }
  ) => { data: CreateAnimeDTO; patch: Partial<CreateAnimeDTO>; sources: Record<string, string> };
  buildMetadataCandidate: (
    provider?: MetadataSourceInput | null,
    ai?: MetadataSourceInput | null
  ) => { candidate: Partial<CreateAnimeDTO>; source: Record<string, string> };
};

const { DEFAULT_METADATA_FIELDS, applyMetadataPatch, buildMetadataCandidate } = metadataMergePolicy;

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

function normalizeTitle(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

export async function enrichAnimeInput(input: CreateAnimeDTO, options: AnimeEnrichmentOptions = {}): Promise<CreateAnimeDTO> {
  const mode = options.mode || 'create';
  const originalUserTitle = (options.originalUserTitle || input.title || '').trim();

  let data: CreateAnimeDTO = {
    ...input,
    tags: input.tags ? [...input.tags] : undefined,
    cast: input.cast ? [...input.cast] : undefined,
    castAliases: input.castAliases ? [...input.castAliases] : undefined,
  };

  if (!originalUserTitle) {
    return data;
  }

  let titleWasStandardized = false;
  let aiCandidate: MetadataSourceInput | null = null;
  let providerCandidate: MetadataSourceInput | null = null;

  try {
    const enriched = await enrichAnimeData(originalUserTitle);
    if (enriched) {
      aiCandidate = {
        originalTitle: enriched.originalTitle,
        totalEpisodes: enriched.totalEpisodes,
        durationMinutes: enriched.durationMinutes,
        summary: enriched.synopsis,
        tags: enriched.tags,
        premiereDate: enriched.premiereDate,
        isFinished: enriched.isFinished,
        coverUrl: enriched.coverUrl,
      };

      const officialTitle = normalizeTitle(enriched.officialTitle);
      if ((mode === 'create' || mode === 'fill-missing') && officialTitle) {
        titleWasStandardized = officialTitle !== originalUserTitle;
        data.title = officialTitle;
      }
    }
  } catch (error) {
    console.error('AI enrichment failed:', error);
  }

  try {
    const metadata = await fetchAnimeMetadataByQueries(data.originalTitle, data.title, originalUserTitle);
    if (metadata) {
      providerCandidate = metadata;

      const providerTitle = normalizeTitle(metadata.title);
      if ((mode === 'create' || mode === 'fill-missing') && providerTitle && providerTitle !== data.title) {
        titleWasStandardized = titleWasStandardized || providerTitle !== originalUserTitle;
        data.title = providerTitle;
      }
    }
  } catch (error) {
    console.error('Provider metadata enrichment failed:', error);
  }

  const mergedCandidate = buildMetadataCandidate(providerCandidate, aiCandidate);
  data = applyMetadataPatch(data, mergedCandidate, {
    fields: DEFAULT_METADATA_FIELDS,
    allowReplaceFilledCover: mode === 'create' && titleWasStandardized,
    allowCastAliasAugment: true,
    allowIsFinishedUpgrade: true,
  }).data;

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
