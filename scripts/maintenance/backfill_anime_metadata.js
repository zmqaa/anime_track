const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const USER_AGENT = 'PersonalAnimeWeb/1.0 (https://github.com/yourname/personal-web)';
const MAX_CAST_MEMBERS = 10;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const SEASON_PATTERN = /第([一二三四五六七八九十0-9]+)季|Season ([0-9]+)|S([0-9]+)/i;
const FOLLOW_UP_SEASON_PATTERN = /第[二三四五六七八九十2-9]+季|Season [2-9]|S[2-9]+/i;

const FIELD_CONFIG = {
  originalTitle: { column: 'original_title', type: 'string' },
  coverUrl: { column: 'coverUrl', type: 'string' },
  score: { column: 'score', type: 'number' },
  totalEpisodes: { column: 'totalEpisodes', type: 'number' },
  durationMinutes: { column: 'durationMinutes', type: 'number' },
  summary: { column: 'summary', type: 'string' },
  tags: { column: 'tags', type: 'array' },
  premiereDate: { column: 'premiere_date', type: 'date' },
  originalWork: { column: 'original_work', type: 'string' },
  cast: { column: 'cast', type: 'array' },
  castAliases: { column: 'cast_aliases', type: 'array' },
  isFinished: { column: 'isFinished', type: 'boolean' },
};

const DEFAULT_FIELDS = [
  'originalTitle',
  'coverUrl',
  'score',
  'totalEpisodes',
  'durationMinutes',
  'summary',
  'tags',
  'premiereDate',
  'originalWork',
  'cast',
  'castAliases',
  'isFinished',
];

const AI_CAPABLE_FIELDS = new Set([
  'originalTitle',
  'coverUrl',
  'totalEpisodes',
  'durationMinutes',
  'summary',
  'tags',
  'premiereDate',
  'originalWork',
  'isFinished',
]);

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

function parseJsonStringArray(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((item) => (typeof item === 'string' ? item : String(item ?? ''))));
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return uniqueStrings(parsed.map((item) => (typeof item === 'string' ? item : String(item ?? ''))));
  } catch {
    return [];
  }
}

function normalizeDate(value) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const text = String(value).trim();
  if (!text) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isBlank(value) {
  return typeof value !== 'string' || !value.trim();
}

function isMissingFieldValue(field, value) {
  const config = FIELD_CONFIG[field];
  if (!config) {
    return true;
  }

  switch (config.type) {
    case 'string':
      return isBlank(value);
    case 'number': {
      const numeric = Number(value);
      return !Number.isFinite(numeric) || numeric <= 0;
    }
    case 'date':
      return !normalizeDate(value);
    case 'array':
      return !Array.isArray(value) || value.length === 0;
    case 'boolean':
      return value === null || value === undefined;
    default:
      return true;
  }
}

function normalizeFieldValue(field, value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  switch (field) {
    case 'originalTitle':
    case 'originalWork': {
      const text = String(value).trim();
      return text || undefined;
    }
    case 'coverUrl': {
      const text = String(value).trim();
      if (!text) {
        return undefined;
      }
      return text.replace(/^http:\/\//i, 'https://');
    }
    case 'summary': {
      const text = String(value).trim();
      if (!text) {
        return undefined;
      }
      if (/无法确定|信息不足|unknown/i.test(text)) {
        return undefined;
      }
      return text;
    }
    case 'score': {
      const score = Number(value);
      if (!Number.isFinite(score) || score <= 0 || score > 10) {
        return undefined;
      }
      return Number(score.toFixed(1));
    }
    case 'totalEpisodes':
    case 'durationMinutes': {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return undefined;
      }
      return Math.round(numeric);
    }
    case 'premiereDate':
      return normalizeDate(value);
    case 'tags': {
      const values = parseJsonStringArray(value);
      return values.length > 0 ? values.slice(0, 20) : undefined;
    }
    case 'cast': {
      const values = parseJsonStringArray(value);
      return values.length > 0 ? values.slice(0, MAX_CAST_MEMBERS) : undefined;
    }
    case 'castAliases': {
      const values = parseJsonStringArray(value);
      return values.length > 0 ? values.slice(0, 30) : undefined;
    }
    case 'isFinished':
      return typeof value === 'boolean' ? value : undefined;
    default:
      return undefined;
  }
}

function sameString(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function sameNumber(left, right) {
  if (left === undefined && right === undefined) {
    return true;
  }

  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }

  return Math.abs(a - b) < 0.0001;
}

function sameArray(left, right) {
  const a = uniqueStrings(Array.isArray(left) ? left : []).sort();
  const b = uniqueStrings(Array.isArray(right) ? right : []).sort();

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

function sameFieldValue(field, left, right) {
  const config = FIELD_CONFIG[field];
  if (!config) {
    return false;
  }

  switch (config.type) {
    case 'string':
      return sameString(left, right);
    case 'number':
      return sameNumber(left, right);
    case 'date':
      return sameString(normalizeDate(left), normalizeDate(right));
    case 'array':
      return sameArray(left, right);
    case 'boolean':
      return Boolean(left) === Boolean(right);
    default:
      return false;
  }
}

function toPrintable(value) {
  if (Array.isArray(value)) {
    return `[${value.slice(0, 6).join(', ')}${value.length > 6 ? ', ...' : ''}]`;
  }

  if (typeof value === 'string') {
    return value.length > 70 ? `${value.slice(0, 70)}...` : value;
  }

  return String(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, init = {}, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 2;
  const backoffMs = Number.isFinite(options.backoffMs) ? options.backoffMs : 1200;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt < retries) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }
      throw error;
    }

    if (response.ok) {
      return response.json();
    }

    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(backoffMs * (attempt + 1));
      continue;
    }

    return null;
  }

  return null;
}

function selectBangumiSubject(subjects, title) {
  let subject = subjects.find((item) => item?.name_cn === title || item?.name === title);

  if (!subject) {
    const hasSeasonInTitle = SEASON_PATTERN.test(title);

    if (!hasSeasonInTitle) {
      subject = subjects.find((item) => {
        const itemName = item?.name_cn || item?.name || '';
        return !FOLLOW_UP_SEASON_PATTERN.test(itemName);
      });
    } else {
      const seasonQuery = title.match(SEASON_PATTERN)?.[0];
      if (seasonQuery) {
        subject = subjects.find((item) => {
          const itemName = item?.name_cn || item?.name || '';
          return itemName.includes(seasonQuery);
        });
      }
    }
  }

  return subject || subjects[0] || null;
}

async function fetchBangumiSubject(query) {
  const url = `https://api.bgm.tv/search/subject/${encodeURIComponent(query)}?type=2&responseGroup=small&max_results=5`;
  const data = await fetchJsonWithRetry(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
      },
    },
    { retries: 2, backoffMs: 1400 }
  );

  if (!Array.isArray(data?.list) || data.list.length === 0) {
    return null;
  }

  return selectBangumiSubject(data.list, query);
}

async function fetchBangumiCast(subjectId) {
  const url = `https://api.bgm.tv/subject/${subjectId}?responseGroup=large`;
  const data = await fetchJsonWithRetry(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
      },
    },
    { retries: 2, backoffMs: 1400 }
  );

  if (!Array.isArray(data?.crt)) {
    return [];
  }

  return uniqueStrings(
    data.crt.flatMap((character) =>
      Array.isArray(character?.actors)
        ? character.actors.map((actor) => actor?.name_cn || actor?.name)
        : []
    )
  ).slice(0, MAX_CAST_MEMBERS);
}

async function fetchJikanSearch(query) {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`;
  const data = await fetchJsonWithRetry(url, {}, { retries: 2, backoffMs: 1400 });

  if (!Array.isArray(data?.data) || data.data.length === 0) {
    return null;
  }

  return data.data[0] || null;
}

async function fetchJikanCast(malId) {
  const url = `https://api.jikan.moe/v4/anime/${malId}/characters`;
  const data = await fetchJsonWithRetry(url, {}, { retries: 2, backoffMs: 1400 });

  if (!Array.isArray(data?.data)) {
    return [];
  }

  return uniqueStrings(
    data.data.flatMap((entry) => {
      const allVoiceActors = Array.isArray(entry?.voice_actors) ? entry.voice_actors : [];
      const japaneseVoiceActors = allVoiceActors.filter((actor) => actor?.language === 'Japanese');
      const preferredActors = japaneseVoiceActors.length > 0 ? japaneseVoiceActors : allVoiceActors;
      return preferredActors.map((actor) => actor?.person?.name);
    })
  ).slice(0, MAX_CAST_MEMBERS);
}

async function fetchProviderMetadata(query) {
  const title = String(query || '').trim();
  if (!title) {
    return null;
  }

  const result = {};
  let found = false;
  let bangumiSubject = null;

  try {
    bangumiSubject = await fetchBangumiSubject(title);

    if (bangumiSubject) {
      const bgmCover = bangumiSubject?.images?.large || bangumiSubject?.images?.common || bangumiSubject?.images?.medium;
      if (bgmCover) {
        result.coverUrl = String(bgmCover).replace(/^http:\/\//i, 'https://');
      }

      if (bangumiSubject?.name) {
        result.originalTitle = bangumiSubject.name;
      }

      if (bangumiSubject?.id) {
        const bangumiCast = await fetchBangumiCast(Number(bangumiSubject.id));
        if (bangumiCast.length > 0) {
          result.cast = bangumiCast;
          result.castAliases = bangumiCast;
        }
      }

      found = true;
    }
  } catch (error) {
    console.error('[provider] bangumi failed:', error?.message || error);
  }

  try {
    const needJikan =
      !result.coverUrl ||
      !result.totalEpisodes ||
      !result.summary ||
      !result.score ||
      !result.originalWork ||
      !result.premiereDate ||
      !Array.isArray(result.cast) ||
      result.cast.length === 0;

    if (needJikan) {
      const anime = await fetchJikanSearch(title);
      if (anime) {
        const imageUrl = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url;
        if (!result.coverUrl && imageUrl) {
          result.coverUrl = imageUrl;
        }

        if (!result.totalEpisodes && anime?.episodes) {
          result.totalEpisodes = anime.episodes;
        }

        if (!result.summary && anime?.synopsis) {
          result.summary = anime.synopsis;
        }

        if (!result.score && anime?.score) {
          result.score = anime.score;
        }

        if (anime?.title_japanese) {
          result.originalTitle = anime.title_japanese;
        }

        if (anime?.airing !== undefined) {
          result.isFinished = !anime.airing;
        }

        if (anime?.source) {
          result.originalWork = anime.source;
        }

        const airedDate = normalizeDate(anime?.aired?.from);
        if (airedDate) {
          result.premiereDate = airedDate;
        }

        if ((!Array.isArray(result.cast) || result.cast.length === 0) && anime?.mal_id) {
          const jikanCast = await fetchJikanCast(Number(anime.mal_id));
          if (jikanCast.length > 0) {
            result.cast = jikanCast;
            result.castAliases = jikanCast;
          }
        }

        found = true;
      }
    }
  } catch (error) {
    console.error('[provider] jikan failed:', error?.message || error);
  }

  return found ? result : null;
}

async function fetchProviderMetadataByQueries(queries) {
  const deduped = uniqueStrings(queries);

  for (const query of deduped) {
    const metadata = await fetchProviderMetadata(query);
    if (metadata) {
      return { metadata, query };
    }
  }

  return { metadata: null, query: deduped[0] || '' };
}

function getApiKey() {
  return String(process.env.DEEPSEEK_API_KEY || '').trim();
}

async function requestDeepSeekJson(messages, apiKey, temperature = 0.2) {
  if (!apiKey) {
    return null;
  }

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
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function fetchAiMetadata(query, apiKey) {
  const title = String(query || '').trim();
  if (!title || !apiKey) {
    return null;
  }

  const payload = await requestDeepSeekJson(
    [
      {
        role: 'system',
        content: 'You are an anime metadata assistant. Return JSON only. Leave unknown fields as null. Do not fabricate uncertain facts.',
      },
      {
        role: 'user',
        content: `
Query title: ${title}

Return JSON in this exact structure:
{
  "originalTitle": "original title in source language or null",
  "totalEpisodes": 12,
  "durationMinutes": 24,
  "synopsis": "short Simplified Chinese summary",
  "tags": ["TagA", "TagB"],
  "isFinished": true,
  "coverUrl": "https://... or null",
  "originalWork": "manga/light novel/original etc, or null",
  "premiereDate": "YYYY-MM-DD or null"
}
`,
      },
    ],
    apiKey,
    0.1
  );

  if (!payload) {
    return null;
  }

  return {
    originalTitle: payload.originalTitle,
    totalEpisodes: payload.totalEpisodes,
    durationMinutes: payload.durationMinutes,
    synopsis: payload.synopsis,
    tags: payload.tags,
    isFinished: payload.isFinished,
    coverUrl: payload.coverUrl,
    originalWork: payload.originalWork,
    premiereDate: payload.premiereDate,
  };
}

function shouldUseAiForRow(row, providerCandidate, options, apiKey) {
  if (!options.ai || !apiKey) {
    return false;
  }

  for (const field of options.fields) {
    if (!AI_CAPABLE_FIELDS.has(field)) {
      continue;
    }

    const currentValue = row[field];
    const providerValue = providerCandidate[field];

    if (options.force) {
      if (providerValue === undefined) {
        return true;
      }
      continue;
    }

    const missingCurrent = isMissingFieldValue(field, currentValue);
    const missingProvider = isMissingFieldValue(field, providerValue);
    if (missingCurrent && missingProvider) {
      return true;
    }
  }

  return false;
}

function buildMergedCandidate(provider, ai) {
  const providerData = provider || {};
  const aiData = ai || {};

  const candidate = {
    originalTitle: providerData.originalTitle ?? aiData.originalTitle,
    coverUrl: providerData.coverUrl ?? aiData.coverUrl,
    score: providerData.score,
    totalEpisodes: providerData.totalEpisodes ?? aiData.totalEpisodes,
    durationMinutes: providerData.durationMinutes ?? aiData.durationMinutes,
    summary: providerData.summary ?? aiData.synopsis,
    tags: providerData.tags ?? aiData.tags,
    premiereDate: providerData.premiereDate ?? aiData.premiereDate,
    originalWork: providerData.originalWork ?? aiData.originalWork,
    cast: providerData.cast ?? aiData.cast,
    castAliases: providerData.castAliases ?? aiData.castAliases,
    isFinished: providerData.isFinished ?? aiData.isFinished,
  };

  const source = {};

  for (const field of Object.keys(candidate)) {
    if (providerData[field] !== undefined && providerData[field] !== null) {
      source[field] = 'provider';
    } else if (aiData[field] !== undefined && aiData[field] !== null) {
      source[field] = 'ai';
    }
  }

  return { candidate, source };
}

function shouldUpdateField(field, currentValue, nextValue, options) {
  if (nextValue === undefined) {
    return false;
  }

  if (options.force) {
    return !sameFieldValue(field, currentValue, nextValue);
  }

  const isMissing = isMissingFieldValue(field, currentValue);
  if (!isMissing) {
    if (field === 'isFinished' && currentValue === false && nextValue === true) {
      return true;
    }
    return false;
  }

  return !sameFieldValue(field, currentValue, nextValue);
}

function buildPatch(row, merged, options) {
  const patch = {};
  const sources = {};

  for (const field of options.fields) {
    const rawValue = merged.candidate[field];
    const normalizedNext = normalizeFieldValue(field, rawValue);

    if (normalizedNext === undefined) {
      continue;
    }

    if (shouldUpdateField(field, row[field], normalizedNext, options)) {
      patch[field] = normalizedNext;
      sources[field] = merged.source[field] || 'unknown';
    }
  }

  return { patch, sources };
}

function toDbValue(field, value) {
  if (value === undefined) {
    return undefined;
  }

  const type = FIELD_CONFIG[field]?.type;
  if (type === 'array') {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }

  if (type === 'boolean') {
    return value ? 1 : 0;
  }

  return value;
}

async function applyPatch(connection, id, patch) {
  const fields = Object.keys(patch);
  if (fields.length === 0) {
    return;
  }

  const sets = [];
  const params = [];

  for (const field of fields) {
    const column = FIELD_CONFIG[field]?.column;
    if (!column) {
      continue;
    }

    sets.push(`${column} = ?`);
    params.push(toDbValue(field, patch[field]));
  }

  sets.push('updatedAt = NOW()');
  params.push(id);

  const sql = `UPDATE anime SET ${sets.join(', ')} WHERE id = ?`;
  await connection.execute(sql, params);
}

function parseRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    status: row.status,
    originalTitle: typeof row.originalTitle === 'string' ? row.originalTitle : undefined,
    coverUrl: typeof row.coverUrl === 'string' ? row.coverUrl : undefined,
    score: row.score === null || row.score === undefined ? undefined : Number(row.score),
    totalEpisodes: row.totalEpisodes === null || row.totalEpisodes === undefined ? undefined : Number(row.totalEpisodes),
    durationMinutes: row.durationMinutes === null || row.durationMinutes === undefined ? undefined : Number(row.durationMinutes),
    summary: typeof row.summary === 'string' ? row.summary : undefined,
    tags: parseJsonStringArray(row.tags),
    premiereDate: normalizeDate(row.premiereDate),
    originalWork: typeof row.originalWork === 'string' ? row.originalWork : undefined,
    cast: parseJsonStringArray(row.cast),
    castAliases: parseJsonStringArray(row.castAliases),
    isFinished: row.isFinished === null || row.isFinished === undefined ? undefined : Boolean(row.isFinished),
  };
}

function rowNeedsProcessing(row, options) {
  if (options.force) {
    return true;
  }

  return options.fields.some((field) => isMissingFieldValue(field, row[field]));
}

function parseIdsArg(value) {
  const ids = String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);

  return ids.length > 0 ? ids : undefined;
}

function parseFieldsArg(value) {
  const requested = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return DEFAULT_FIELDS;
  }

  const allowed = Object.keys(FIELD_CONFIG);
  const invalid = requested.filter((item) => !allowed.includes(item));
  if (invalid.length > 0) {
    throw new Error(`Unknown fields: ${invalid.join(', ')}. Allowed: ${allowed.join(', ')}`);
  }

  return uniqueStrings(requested);
}

function printHelp() {
  console.log('Usage: node scripts/maintenance/backfill_anime_metadata.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --write                 Apply updates (default is dry-run)');
  console.log('  --dry-run               Print planned updates without writing (default)');
  console.log('  --force                 Refresh fields even if already present');
  console.log('  --limit=50              Process only first N candidates');
  console.log('  --delay=900             Delay between records in ms');
  console.log('  --fields=a,b,c          Restrict to specific fields');
  console.log('  --ids=1,2,3             Process specific anime IDs');
  console.log('  --no-ai                 Disable AI fallback');
  console.log('  --help                  Show this message');
  console.log('');
  console.log(`Default fields: ${DEFAULT_FIELDS.join(', ')}`);
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    force: false,
    limit: undefined,
    delay: 900,
    fields: [...DEFAULT_FIELDS],
    ids: undefined,
    ai: true,
  };

  for (const arg of argv) {
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--write') {
      options.dryRun = false;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--no-ai') {
      options.ai = false;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
      continue;
    }

    if (arg.startsWith('--delay=')) {
      const parsed = Number(arg.slice('--delay='.length));
      if (Number.isFinite(parsed) && parsed >= 0) {
        options.delay = parsed;
      }
      continue;
    }

    if (arg.startsWith('--fields=')) {
      options.fields = parseFieldsArg(arg.slice('--fields='.length));
      continue;
    }

    if (arg.startsWith('--ids=')) {
      options.ids = parseIdsArg(arg.slice('--ids='.length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function createDbConfig() {
  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_DATABASE } = process.env;

  if (!MYSQL_HOST || !MYSQL_PORT || !MYSQL_USER || !MYSQL_DATABASE) {
    throw new Error('Missing MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_DATABASE in environment');
  }

  return {
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: MYSQL_DATABASE,
  };
}

function buildProviderCandidate(providerMetadata) {
  const provider = providerMetadata || {};

  return {
    originalTitle: provider.originalTitle,
    coverUrl: provider.coverUrl,
    score: provider.score,
    totalEpisodes: provider.totalEpisodes,
    summary: provider.summary || provider.description,
    premiereDate: provider.premiereDate,
    originalWork: provider.originalWork,
    cast: provider.cast,
    castAliases: provider.castAliases,
    isFinished: provider.isFinished,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = getApiKey();

  if (options.ai && !apiKey) {
    console.warn('[warn] DEEPSEEK_API_KEY is empty, AI fallback will be skipped.');
  }

  const connection = await mysql.createConnection(createDbConfig());

  try {
    const [rows] = await connection.execute(
      `SELECT
        id,
        title,
        status,
        original_title AS originalTitle,
        coverUrl,
        score,
        totalEpisodes,
        durationMinutes,
        summary,
        tags,
        premiere_date AS premiereDate,
        original_work AS originalWork,
        cast,
        cast_aliases AS castAliases,
        isFinished
      FROM anime
      ORDER BY updatedAt DESC`
    );

    const allRows = Array.isArray(rows) ? rows.map(parseRow) : [];
    const filteredById = Array.isArray(options.ids) && options.ids.length > 0
      ? allRows.filter((row) => options.ids.includes(row.id))
      : allRows;

    const candidates = filteredById.filter((row) => rowNeedsProcessing(row, options));
    const queue = Number.isFinite(options.limit) ? candidates.slice(0, options.limit) : candidates;

    console.log(`Loaded ${allRows.length} anime rows.`);
    console.log(`Will process ${queue.length} rows.`);
    console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'} | fields=${options.fields.join(', ')} | force=${options.force}`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let aiUsed = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const row = queue[index];

      try {
        const queries = uniqueStrings([row.originalTitle, row.title]);
        const providerResult = await fetchProviderMetadataByQueries(queries);
        const providerCandidate = buildProviderCandidate(providerResult.metadata);

        let aiCandidate = null;
        const needAi = shouldUseAiForRow(row, providerCandidate, options, apiKey);

        if (needAi && apiKey) {
          aiUsed += 1;
          aiCandidate = await fetchAiMetadata(providerResult.query || row.originalTitle || row.title, apiKey);
        }

        const merged = buildMergedCandidate(providerCandidate, aiCandidate);
        const { patch, sources } = buildPatch(row, merged, options);

        const changedFields = Object.keys(patch);
        if (changedFields.length === 0) {
          skipped += 1;
          console.log(`[skip] #${row.id} ${row.title} -> nothing to update`);
        } else if (options.dryRun) {
          updated += 1;
          const summary = changedFields.map((field) => `${field}=${toPrintable(patch[field])}`).join(' | ');
          const sourceSummary = changedFields.map((field) => `${field}:${sources[field]}`).join(', ');
          console.log(`[dry-run] #${row.id} ${row.title} -> ${summary} [${sourceSummary}]`);
        } else {
          await applyPatch(connection, row.id, patch);
          updated += 1;
          const sourceSummary = changedFields.map((field) => `${field}:${sources[field]}`).join(', ');
          console.log(`[updated] #${row.id} ${row.title} -> ${changedFields.join(', ')} [${sourceSummary}]`);
        }
      } catch (error) {
        errors += 1;
        console.error(`[error] #${row.id} ${row.title}:`, error?.message || error);
      }

      if (index < queue.length - 1 && options.delay > 0) {
        await sleep(options.delay);
      }
    }

    console.log(`Done. changed=${updated}, skipped=${skipped}, errors=${errors}, aiCalls=${aiUsed}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
