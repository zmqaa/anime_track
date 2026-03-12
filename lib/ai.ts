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

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = uniqueStrings(value.map((item) => (typeof item === 'string' ? item : String(item ?? ''))));
  return normalized.length > 0 ? normalized : undefined;
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