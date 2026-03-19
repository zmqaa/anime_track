const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

function getDeepSeekApiKey() {
  return String(process.env.DEEPSEEK_API_KEY || '').trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

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

function toOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function toOptionalNumber(value) {
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

function toOptionalBoolean(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function toOptionalDateString(value) {
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

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = uniqueStrings(value.map((item) => (typeof item === 'string' ? item : String(item ?? ''))));
  return normalized.length > 0 ? normalized : undefined;
}

async function requestDeepSeekJson(messages, apiKey, temperature = 0.1) {
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

    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek request error:', error);
    return null;
  }
}

async function fetchAiAnimeMetadata(queryName, providedApiKey) {
  const normalizedQuery = String(queryName || '').trim();
  if (!normalizedQuery) {
    return null;
  }

  const apiKey = String(providedApiKey || getDeepSeekApiKey()).trim();
  const payload = await requestDeepSeekJson(
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
  "premiereDate": "YYYY-MM-DD 或 null",
  "isFinished": true,
  "coverUrl": null
}

字段要求：
1. officialTitle 必须是“具体动画条目”的标准简体中文标题，不是漫画、轻小说、游戏或整个原作系列名。
2. 如果是分季、续作、剧场版、OVA、OAD，返回该具体动画条目的标题。
3. 如果某一季有稳定通行的官方中文副标题，优先返回副标题形式，例如“南家三姐妹 再来一碗”；不要强行改写成“南家三姐妹 第二季”。
4. originalTitle 必须对应同一个动画条目的原始标题，通常是日文；不要返回漫画连载名、原作书名或企划名。
5. 所有字段都必须对应动画版本本身，不要混入漫画连载开始时间、原作发售时间或企划公开信息。

如果无法识别，也返回同结构，但未知字段用 null 或空数组。`,
      },
    ],
    apiKey,
    0.1
  );

  if (!payload) {
    return null;
  }

  return {
    title: toOptionalString(payload.officialTitle) || normalizedQuery,
    originalTitle: toOptionalString(payload.originalTitle),
    totalEpisodes: toOptionalNumber(payload.totalEpisodes),
    durationMinutes: toOptionalNumber(payload.durationMinutes),
    summary: toOptionalString(payload.synopsis),
    tags: toStringArray(payload.tags),
    premiereDate: toOptionalDateString(payload.premiereDate),
    isFinished: toOptionalBoolean(payload.isFinished),
    coverUrl: toOptionalString(payload.coverUrl),
  };
}

module.exports = {
  getDeepSeekApiKey,
  fetchAiAnimeMetadata,
};