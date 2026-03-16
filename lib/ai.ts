import 'server-only';

import { containsCjkText, uniqueStrings } from './anime-cast';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

export interface EnrichedAnimeData {
  officialTitle: string;
  originalTitle?: string;
  totalEpisodes?: number;
  durationMinutes?: number;
  synopsis?: string;
  tags?: string[];
  isFinished?: boolean;
  coverUrl?: string;
}

export interface ParsedWatchInput {
  animeTitle: string;
  originalTitle?: string;
  episode?: number;
  season?: number;
  watchedAt?: string;
}

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function getApiKey(): string {
  return process.env.DEEPSEEK_API_KEY?.trim() || '';
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toOptionalDateString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = uniqueStrings(value.map((item) => (typeof item === 'string' ? item : String(item ?? ''))));
  return normalized.length > 0 ? normalized : undefined;
}

function parseChineseNumberToken(token: string): number | undefined {
  const normalized = token.trim();
  if (!normalized) {
    return undefined;
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

    if (char === '百') {
      value += (current || 1) * 100;
      current = 0;
      continue;
    }

    return undefined;
  }

  value += current;
  return value > 0 ? value : undefined;
}

function parseWatchInputFallback(inputText: string): ParsedWatchInput | null {
  const text = inputText.trim();
  if (!text) {
    return null;
  }

  const seasonToken = text.match(/第\s*([0-9一二三四五六七八九十百零两〇]+)\s*季/i)?.[1];
  const episodeToken = text.match(/第\s*([0-9一二三四五六七八九十百零两〇]+)\s*[集话話]/i)?.[1];

  const season = seasonToken ? parseChineseNumberToken(seasonToken) : undefined;
  const episode = episodeToken ? parseChineseNumberToken(episodeToken) : undefined;

  let animeTitle = text
    .replace(/^(我)?\s*(今天|昨天|前天)?\s*(看了|补了|追了|刷了|看完了|看完|看)\s*/i, '')
    .replace(/第\s*[0-9一二三四五六七八九十百零两〇]+\s*季/gi, '')
    .replace(/第\s*[0-9一二三四五六七八九十百零两〇]+\s*[集话話]/gi, '')
    .replace(/[，。,.!！?？]/g, ' ')
    .trim();

  if (!animeTitle) {
    animeTitle = text;
  }

  animeTitle = animeTitle.replace(/\s+/g, ' ').trim();
  if (!animeTitle) {
    return null;
  }

  return {
    animeTitle,
    season,
    episode,
  };
}

async function requestDeepSeekJson<T>(messages: DeepSeekMessage[], temperature = 0.2): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('DeepSeek request failed:', response.status, detail);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return null;
    }

    return JSON.parse(content) as T;
  } catch (error) {
    console.error('DeepSeek request error:', error);
    return null;
  }
}

export async function enrichAnimeData(queryName: string): Promise<EnrichedAnimeData | null> {
  const normalizedQuery = queryName.trim();
  if (!normalizedQuery) {
    return null;
  }

  const payload = await requestDeepSeekJson<Record<string, unknown>>(
    [
      {
        role: 'system',
        content: '你是动漫资料整理助手，只输出 JSON，不输出解释。信息不确定时宁可留空，不要编造。',
      },
      {
        role: 'user',
        content: `
请识别这部动画，并返回 JSON。

原始名字：${normalizedQuery}

返回结构：
{
  "officialTitle": "标准简体中文标题",
  "originalTitle": "原始标题，可为空",
  "totalEpisodes": 12,
  "durationMinutes": 24,
  "synopsis": "简体中文简介",
  "tags": ["校园", "喜剧"],
  "isFinished": true,
  "coverUrl": null
}

如果无法识别，也返回同结构，但未知字段用 null 或空数组。`,
      },
    ],
    0.1
  );

  if (!payload) {
    return null;
  }

  const officialTitle = toOptionalString(payload.officialTitle) || normalizedQuery;
  const synopsis = toOptionalString(payload.synopsis);
  const tags = toStringArray(payload.tags);

  return {
    officialTitle,
    originalTitle: toOptionalString(payload.originalTitle),
    totalEpisodes: toOptionalNumber(payload.totalEpisodes),
    durationMinutes: toOptionalNumber(payload.durationMinutes),
    synopsis,
    tags,
    isFinished: toOptionalBoolean(payload.isFinished),
    coverUrl: toOptionalString(payload.coverUrl),
  };
}

export async function buildVoiceActorAliases(cast: string[], existingAliases: string[] = []): Promise<string[]> {
  const baseAliases = uniqueStrings([...(existingAliases || []), ...(cast || [])]);
  if (baseAliases.length === 0) {
    return [];
  }

  const payload = await requestDeepSeekJson<Record<string, unknown>>(
    [
      {
        role: 'system',
        content: '你是日本声优姓名规范助手，只输出 JSON，不输出解释。',
      },
      {
        role: 'user',
        content: `
请为以下声优名字补充常见的简体中文别名。不确定时填 null。

输入：${JSON.stringify(baseAliases)}

返回 JSON：
{
  "actors": [
    { "name": "原始名字", "chineseName": "简体中文名或 null" }
  ]
}`,
      },
    ],
    0.2
  );

  const aiAliases = Array.isArray(payload?.actors)
    ? payload.actors.flatMap((actor) => {
        const chineseName = toOptionalString((actor as Record<string, unknown>)?.chineseName);
        return chineseName && containsCjkText(chineseName) ? [chineseName] : [];
      })
    : [];

  return uniqueStrings([...baseAliases, ...aiAliases]);
}

export async function parseWatchInput(inputText: string): Promise<ParsedWatchInput | null> {
  const normalizedText = inputText.trim();
  if (!normalizedText) {
    return null;
  }

  const payload = await requestDeepSeekJson<Record<string, unknown>>(
    [
      {
        role: 'system',
        content: '你是追番日志解析助手，只输出 JSON，不输出解释。',
      },
      {
        role: 'user',
        content: `
请把这句话解析成追番记录：${normalizedText}

输出 JSON：
{
  "animeTitle": "标准中文标题，必须",
  "originalTitle": "原名，可空",
  "season": 1,
  "episode": 1,
  "watchedAt": "YYYY-MM-DD，可空"
}

规则：
1. 如果句子里有季数或集数，尽量提取成数字。
2. 如果日期没提到，watchedAt 返回 null。
3. 识别不出来时，animeTitle 返回 null。`,
      },
    ],
    0.1
  );

  if (payload) {
    const animeTitle = toOptionalString(payload.animeTitle) || toOptionalString(payload.title);
    if (animeTitle) {
      return {
        animeTitle,
        originalTitle: toOptionalString(payload.originalTitle),
        season: toOptionalNumber(payload.season),
        episode: toOptionalNumber(payload.episode),
        watchedAt: toOptionalDateString(payload.watchedAt),
      };
    }
  }

  return parseWatchInputFallback(normalizedText);
}