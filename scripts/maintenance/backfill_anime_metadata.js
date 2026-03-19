const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { fetchAnimeMetadataByQueriesDetailed } = require('../../lib/metadata/provider-source.js');
const { getDeepSeekApiKey, fetchAiAnimeMetadata } = require('../../lib/metadata/ai-metadata-source.js');
const {
  ALL_METADATA_FIELDS,
  DEFAULT_METADATA_FIELDS,
  buildMetadataCandidate,
  buildMetadataPatch,
  isMetadataFieldMissing,
  normalizeMetadataDate,
  shouldUseAiForMetadata,
} = require('../../lib/metadata/merge-policy.js');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const FIELD_CONFIG = {
  originalTitle: { column: 'original_title', type: 'string' },
  coverUrl: { column: 'coverUrl', type: 'string' },
  score: { column: 'score', type: 'number' },
  totalEpisodes: { column: 'totalEpisodes', type: 'number' },
  durationMinutes: { column: 'durationMinutes', type: 'number' },
  summary: { column: 'summary', type: 'string' },
  tags: { column: 'tags', type: 'array' },
  premiereDate: { column: 'premiere_date', type: 'date' },
  cast: { column: 'cast', type: 'array' },
  castAliases: { column: 'cast_aliases', type: 'array' },
  isFinished: { column: 'isFinished', type: 'boolean' },
};

const DEFAULT_FIELDS = [...DEFAULT_METADATA_FIELDS];

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
  return normalizeMetadataDate(value);
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
    cast: parseJsonStringArray(row.cast),
    castAliases: parseJsonStringArray(row.castAliases),
    isFinished: row.isFinished === null || row.isFinished === undefined ? undefined : Boolean(row.isFinished),
  };
}

function rowNeedsProcessing(row, options) {
  if (options.force) {
    return true;
  }

  return options.fields.some((field) => isMetadataFieldMissing(field, row[field]));
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

  const allowed = ALL_METADATA_FIELDS;
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
  console.log('  --ai-only               Skip provider lookup and use AI as the only source');
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
    aiOnly: false,
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

    if (arg === '--ai-only') {
      options.aiOnly = true;
      options.ai = true;
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

  if (options.aiOnly && !options.ai) {
    throw new Error('--ai-only cannot be combined with --no-ai');
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
    cast: provider.cast,
    castAliases: provider.castAliases,
    isFinished: provider.isFinished,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = getDeepSeekApiKey();

  if (options.aiOnly && !apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required when using --ai-only');
  }

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
    console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'} | fields=${options.fields.join(', ')} | force=${options.force} | aiOnly=${options.aiOnly}`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let aiUsed = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const row = queue[index];

      try {
        const queries = uniqueStrings([row.originalTitle, row.title]);
        const providerResult = options.aiOnly
          ? { metadata: null, query: queries[0] || row.originalTitle || row.title }
          : await fetchAnimeMetadataByQueriesDetailed(queries);
        const providerCandidate = options.aiOnly ? {} : buildProviderCandidate(providerResult.metadata);

        let aiCandidate = null;
        const needAi = options.ai && apiKey
          ? (options.aiOnly || shouldUseAiForMetadata(row, providerCandidate, {
              fields: options.fields,
              force: options.force,
            }))
          : false;

        if (needAi && apiKey) {
          aiUsed += 1;
          aiCandidate = await fetchAiAnimeMetadata(providerResult.query || row.originalTitle || row.title, apiKey);
        }

        const merged = buildMetadataCandidate(providerCandidate, aiCandidate);
        const { patch, sources } = buildMetadataPatch(row, merged, {
          fields: options.fields,
          force: options.force,
          allowCastAliasAugment: true,
          allowIsFinishedUpgrade: true,
        });

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
