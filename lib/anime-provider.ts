export interface AnimeMetadata {
    coverUrl?: string;
    totalEpisodes?: number;
    title?: string;
    originalTitle?: string;
    score?: number;
    description?: string;
    originalWork?: string;
    cast?: string[];
    castAliases?: string[];
    isFinished?: boolean;
}

interface BangumiImages {
    large?: string;
    common?: string;
    medium?: string;
}

interface BangumiActor {
    name?: string;
    name_cn?: string;
}

interface BangumiCharacter {
    actors?: BangumiActor[];
}

interface BangumiSubject {
    id?: number | string;
    name?: string;
    name_cn?: string;
    images?: BangumiImages;
    crt?: BangumiCharacter[];
}

interface BangumiSearchResponse {
    list?: BangumiSubject[];
}

interface JikanImageSet {
    large_image_url?: string;
    image_url?: string;
}

interface JikanVoiceActor {
    language?: string;
    person?: {
        name?: string;
    };
}

interface JikanCharacterEntry {
    voice_actors?: JikanVoiceActor[];
}

interface JikanAnime {
    mal_id?: number;
    images?: {
        jpg?: JikanImageSet;
    };
    episodes?: number;
    synopsis?: string;
    score?: number;
    title_japanese?: string;
    airing?: boolean;
    source?: string;
}

interface JikanSearchResponse {
    data?: JikanAnime[];
}

interface JikanCharactersResponse {
    data?: JikanCharacterEntry[];
}

const USER_AGENT = 'PersonalAnimeWeb/1.0 (https://github.com/yourname/personal-web)';
const MAX_CAST_MEMBERS = 10;
const SEASON_PATTERN = /第([一二三四五六七八九十0-9]+)季|Season ([0-9]+)|S([0-9]+)/i;
const FOLLOW_UP_SEASON_PATTERN = /第[二三四五六七八九十2-9]+季|Season [2-9]|S[2-9]+/i;

function uniqueValues(values: Array<string | undefined | null>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = typeof value === 'string' ? value.trim() : '';
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        result.push(normalized);
    }

    return result;
}

function pickBangumiSubject(subjects: BangumiSubject[], title: string) {
    let subject = subjects.find((item) => item.name_cn === title || item.name === title);

    if (!subject) {
        const hasSeasonInTitle = SEASON_PATTERN.test(title);
        if (!hasSeasonInTitle) {
            subject = subjects.find((item) => {
                const itemName = item.name_cn || item.name || '';
                return !FOLLOW_UP_SEASON_PATTERN.test(itemName);
            });
        } else {
            const seasonQuery = title.match(SEASON_PATTERN)?.[0];
            if (seasonQuery) {
                subject = subjects.find((item) => {
                    const itemName = item.name_cn || item.name || '';
                    return itemName.includes(seasonQuery);
                });
            }
        }
    }

    return subject || subjects[0] || null;
}

async function fetchBangumiSubject(title: string): Promise<BangumiSubject | null> {
    const res = await fetch(`https://api.bgm.tv/search/subject/${encodeURIComponent(title)}?type=2&responseGroup=small&max_results=5`, {
        headers: {
            'User-Agent': USER_AGENT,
        },
    });

    if (!res.ok) {
        return null;
    }

    const data = await res.json() as BangumiSearchResponse;
    if (!data?.list || !Array.isArray(data.list) || data.list.length === 0) {
        return null;
    }

    return pickBangumiSubject(data.list, title);
}

async function fetchBangumiCast(subjectId: number): Promise<string[]> {
    try {
        const res = await fetch(`https://api.bgm.tv/subject/${subjectId}?responseGroup=large`, {
            headers: {
                'User-Agent': USER_AGENT,
            },
        });

        if (!res.ok) {
            return [];
        }

        const data = await res.json() as { crt?: BangumiCharacter[] };
        if (!Array.isArray(data?.crt)) {
            return [];
        }

        const cast = uniqueValues(
            data.crt.flatMap((character) =>
                Array.isArray(character?.actors)
                    ? character.actors.map((actor) => actor?.name_cn || actor?.name)
                    : []
            )
        );

        return cast.slice(0, MAX_CAST_MEMBERS);
    } catch (error) {
        console.error('Bangumi cast fetch failed', error);
        return [];
    }
}

async function fetchJikanSearch(title: string): Promise<JikanAnime | null> {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
    if (!res.ok) {
        return null;
    }

    const data = await res.json() as JikanSearchResponse;
    if (!Array.isArray(data?.data) || data.data.length === 0) {
        return null;
    }

    return data.data[0];
}

async function fetchJikanCast(malId: number): Promise<string[]> {
    try {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`);
        if (!res.ok) {
            return [];
        }

        const data = await res.json() as JikanCharactersResponse;
        if (!Array.isArray(data?.data)) {
            return [];
        }

        const cast = uniqueValues(
            data.data.flatMap((entry) => {
                const allVoiceActors = Array.isArray(entry?.voice_actors) ? entry.voice_actors : [];
                const japaneseVoiceActors = allVoiceActors.filter((actor) => actor?.language === 'Japanese');
                const preferredActors = japaneseVoiceActors.length > 0 ? japaneseVoiceActors : allVoiceActors;
                return preferredActors.map((actor) => actor?.person?.name);
            })
        );

        return cast.slice(0, MAX_CAST_MEMBERS);
    } catch (error) {
        console.error('Jikan cast fetch failed', error);
        return [];
    }
}

export async function fetchAnimeMetadata(title: string): Promise<AnimeMetadata | null> {
    if (!title) return null;

    const result: AnimeMetadata = {};
    let found = false;
    let bangumiSubject: BangumiSubject | null = null;

    console.log(`[AnimeProvider] Searching metadata for: ${title}`);

    // Strategy 1: Bangumi (bgm.tv)
    try {
        bangumiSubject = await fetchBangumiSubject(title);

        if (bangumiSubject) {
            if (bangumiSubject.images) {
                const bgmCover = bangumiSubject.images.large || bangumiSubject.images.common || bangumiSubject.images.medium;
                if (bgmCover) {
                    result.coverUrl = bgmCover.replace('http://', 'https://');
                }
            }

            if (bangumiSubject.name_cn) {
                result.title = bangumiSubject.name_cn;
            }

            if (bangumiSubject.name) {
                result.originalTitle = bangumiSubject.name;
            }

            if (bangumiSubject.id) {
                const bangumiCast = await fetchBangumiCast(Number(bangumiSubject.id));
                if (bangumiCast.length > 0) {
                    result.cast = bangumiCast;
                    result.castAliases = bangumiCast;
                }
            }

            found = true;
        }
    } catch (e) {
        console.error('Bangumi search failed', e);
    }

    // Strategy 2: Jikan (MyAnimeList) - Fallback or supplementary
    // Try Jikan if we miss key info (Cover OR Episodes OR Description)
    // Always Try Jikan for episodes/summary if missing, as Bangumi simple search lacks deep data
    if (!result.coverUrl || !result.totalEpisodes || !result.description || !result.cast || result.cast.length === 0 || !result.originalWork) {
        try {
            const anime = await fetchJikanSearch(title);

            if (anime) {
                    // Cover
                    if (!result.coverUrl) {
                        const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
                        if (imageUrl) {
                            result.coverUrl = imageUrl;
                        }
                    }

                    // Episodes
                    if (!result.totalEpisodes && anime.episodes) {
                        result.totalEpisodes = anime.episodes;
                    }

                    // Description / Synopsis
                    if (!result.description && anime.synopsis) {
                        result.description = anime.synopsis;
                    }
                    
                    // Score
                    if (!result.score && anime.score) {
                        result.score = anime.score;
                    }
                    
                    if (anime.title_japanese) {
                        result.originalTitle = anime.title_japanese;
                    }

                    // Airing status
                    if (anime.airing !== undefined) {
                        result.isFinished = !anime.airing;
                    }

                    // Original Work / Source
                    if (anime.source) {
                        result.originalWork = anime.source;
                    }

                    if ((!result.cast || result.cast.length === 0) && anime.mal_id) {
                        const jikanCast = await fetchJikanCast(Number(anime.mal_id));
                        if (jikanCast.length > 0) {
                            result.cast = jikanCast;
                            result.castAliases = jikanCast;
                        }
                    }

                    found = true;
            }
        } catch (e) {
            console.error('Jikan search failed', e);
        }
    }
    
    return found ? result : null;
}

export async function fetchAnimeMetadataByQueries(...queries: Array<string | undefined | null>): Promise<AnimeMetadata | null> {
    const dedupedQueries = uniqueValues(queries);

    for (const query of dedupedQueries) {
        const metadata = await fetchAnimeMetadata(query);
        if (metadata) {
            return metadata;
        }
    }

    return null;
}

