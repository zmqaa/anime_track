const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { fetchAnimeMetadataByQueriesDetailed } = require('../../lib/metadata/provider-source.js');
const { normalizeMetadataDate } = require('../../lib/metadata/merge-policy.js');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_DELAY_MS = 900;
const DEFAULT_MIN_CONFIDENCE = 0.75;
const MAX_REASONABLE_FUTURE_YEARS = 5;

function loadEnvironment() {
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') });
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIdsArg(value) {
  const ids = String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);

  return ids.length > 0 ? ids : undefined;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numeric));
}

function parseConfidenceArg(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --min-confidence value: ${value}`);
  }

  return clampConfidence(parsed);
}

function printHelp() {
  console.log('Usage: node scripts/maintenance/backfill_premiere_date.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --write                     Apply updates (default is dry-run)');
  console.log('  --dry-run                   Preview updates without writing (default)');
  console.log('  --force                     Refresh rows even when premiere_date already exists');
  console.log(`  --limit=50                  Process only the first N candidates`);
  console.log(`  --delay=${DEFAULT_DELAY_MS}                 Delay between records in ms`);
  console.log('  --ids=1,2,3                 Process specific anime IDs');
  console.log('  --no-ai                     Disable AI fallback');
  console.log(`  --min-confidence=${DEFAULT_MIN_CONFIDENCE}        Minimum AI confidence required to accept a date`);
  console.log('  --log-file=logs/...json     Custom audit log path');
  console.log('  --help                      Show this message');
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    force: false,
    limit: undefined,
    delay: DEFAULT_DELAY_MS,
    ids: undefined,
    ai: true,
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    logFile: undefined,
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

    if (arg.startsWith('--ids=')) {
      options.ids = parseIdsArg(arg.slice('--ids='.length));
      continue;
    }

    if (arg.startsWith('--min-confidence=')) {
      options.minConfidence = parseConfidenceArg(arg.slice('--min-confidence='.length));
      continue;
    }

    if (arg.startsWith('--log-file=')) {
      const value = arg.slice('--log-file='.length).trim();
      options.logFile = value || undefined;
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

function parseRow(row) {
  return {
    id: Number(row.id),
    title: typeof row.title === 'string' ? row.title.trim() : '',
    originalTitle: typeof row.originalTitle === 'string' ? row.originalTitle.trim() : '',
    status: typeof row.status === 'string' ? row.status.trim() : '',
    progress: toFiniteNumber(row.progress, 0),
    startDate: normalizeMetadataDate(row.startDate),
    endDate: normalizeMetadataDate(row.endDate),
    premiereDate: normalizeMetadataDate(row.premiereDate),
  };
}

function rowNeedsProcessing(row, options) {
  if (options.force) {
    return true;
  }

  return !row.premiereDate;
}

function buildAuditFilePath(customPath) {
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(PROJECT_ROOT, customPath);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(PROJECT_ROOT, 'logs', 'maintenance', 'premiere-date', `premiere-date-backfill-${timestamp}.json`);
}

function requestDeepSeekJson(messages, apiKey, temperature = 0.05) {
  if (!apiKey) {
    return Promise.resolve(null);
  }

  return fetch(DEEPSEEK_API_URL, {
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
  })
    .then(async (response) => {
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`DeepSeek request failed: ${response.status} ${detail}`);
      }

      return response.json();
    })
    .then((data) => {
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        return null;
      }

      return JSON.parse(content);
    });
}

async function fetchAiPremiereDate(row, apiKey) {
  const payload = await requestDeepSeekJson(
    [
      {
        role: 'system',
        content: '你是动画首播日期核验助手。任务对象只能是已经动画化的电视动画、网络动画、OVA、OAD 或剧场版，不是漫画、轻小说、游戏、原作小说或连载本身。只输出 JSON，不输出解释。不能确认到动画版本的具体首播或上映日期时返回 null，不要把漫画连载开始日、原作发售日或企划公开日当成答案。',
      },
      {
        role: 'user',
        content: `请识别这部动画作品，只返回动画版本的首播日期和置信度。\n\n已知信息：\n- 当前标题：${row.title || '未知'}\n- 原始标题：${row.originalTitle || '未知'}\n\n返回 JSON：\n{\n  "premiereDate": "YYYY-MM-DD or null",\n  "confidence": 0.0\n}\n\n规则：\n1. 只返回动画改编版本首次公开播出或上映日期。\n2. 如果同名作品同时存在漫画、轻小说、游戏或广播剧，忽略这些原作时间。\n3. 如果只能确认到漫画连载开始、原作出版时间或企划发布时间，返回 null。\n4. 如果只能确认到年份或月份，不要猜具体日，直接返回 null。\n5. confidence 取值范围 0 到 1。\n6. 除 premiereDate 和 confidence 外，不要返回其它字段。`,
      },
    ],
    apiKey,
    0.05
  );

  return {
    premiereDate: normalizeMetadataDate(payload?.premiereDate),
    confidence: clampConfidence(payload?.confidence),
  };
}

function hasExistingWatchSignals(row) {
  return row.progress > 0 || ['watching', 'completed', 'dropped'].includes(row.status) || Boolean(row.startDate) || Boolean(row.endDate);
}

function evaluateCandidate(row, candidateDate, source, options, confidence = undefined) {
  const normalized = normalizeMetadataDate(candidateDate);
  if (!normalized) {
    return { accepted: false, reason: 'missing_date' };
  }

  if (source === 'ai' && clampConfidence(confidence) < options.minConfidence) {
    return { accepted: false, reason: `ai_confidence_below_threshold:${clampConfidence(confidence).toFixed(2)}` };
  }

  const today = new Date();
  const candidate = new Date(`${normalized}T00:00:00Z`);
  const maxFuture = new Date(Date.UTC(today.getUTCFullYear() + MAX_REASONABLE_FUTURE_YEARS, today.getUTCMonth(), today.getUTCDate()));

  if (!Number.isNaN(candidate.getTime()) && candidate > maxFuture) {
    return { accepted: false, reason: 'too_far_in_future' };
  }

  const todayString = normalizeMetadataDate(today);
  if (todayString && normalized > todayString && hasExistingWatchSignals(row)) {
    return { accepted: false, reason: 'future_date_conflicts_with_watch_state' };
  }

  if (row.premiereDate && row.premiereDate === normalized) {
    return { accepted: false, reason: 'same_as_current' };
  }

  return { accepted: true, reason: 'accepted', value: normalized };
}

function formatConfidence(confidence) {
  if (!Number.isFinite(confidence)) {
    return 'n/a';
  }

  return clampConfidence(confidence).toFixed(2);
}

async function applyPremiereDate(connection, id, premiereDate) {
  await connection.execute('UPDATE anime SET premiere_date = ?, updatedAt = NOW() WHERE id = ?', [premiereDate, id]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  loadEnvironment();

  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  const auditPath = buildAuditFilePath(options.logFile);
  const auditEntries = [];
  const startedAt = new Date().toISOString();

  if (options.ai && !apiKey) {
    console.warn('[warn] DEEPSEEK_API_KEY is empty, AI fallback will be skipped.');
  }

  const connection = await mysql.createConnection(createDbConfig());
  let loadedCount = 0;
  let selectedCount = 0;
  let changedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let providerSelectedCount = 0;
  let aiSelectedCount = 0;
  let aiCallCount = 0;

  try {
    const [rows] = await connection.execute(
      `SELECT
        id,
        title,
        original_title AS originalTitle,
        status,
        progress,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
        DATE_FORMAT(premiere_date, '%Y-%m-%d') AS premiereDate
      FROM anime
      ORDER BY updatedAt DESC`
    );

    const allRows = Array.isArray(rows) ? rows.map(parseRow) : [];
    loadedCount = allRows.length;

    const filteredById = Array.isArray(options.ids) && options.ids.length > 0
      ? allRows.filter((row) => options.ids.includes(row.id))
      : allRows;
    const candidates = filteredById.filter((row) => rowNeedsProcessing(row, options));
    const queue = Number.isFinite(options.limit) ? candidates.slice(0, options.limit) : candidates;

    selectedCount = queue.length;

    console.log(`Loaded ${loadedCount} anime rows.`);
    console.log(`Will process ${selectedCount} rows.`);
    console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'} | force=${options.force} | ai=${options.ai} | minConfidence=${options.minConfidence.toFixed(2)}`);

    for (let index = 0; index < queue.length; index += 1) {
      const row = queue[index];
      const queries = uniqueStrings([row.originalTitle, row.title]);
      const auditEntry = {
        id: row.id,
        title: row.title,
        originalTitle: row.originalTitle || null,
        beforePremiereDate: row.premiereDate || null,
        queries,
        provider: {
          query: null,
          premiereDate: null,
          premiereDateSource: null,
          decision: null,
        },
        ai: {
          used: false,
          premiereDate: null,
          confidence: null,
          decision: null,
        },
        outcome: 'skip',
        source: null,
        afterPremiereDate: null,
        reason: null,
      };

      try {
        const providerResult = await fetchAnimeMetadataByQueriesDetailed(queries);
        const providerPremiereMeta = providerResult?.metadata?.__providerMeta?.fieldSources?.premiereDate || null;
        const providerDate = normalizeMetadataDate(providerResult?.metadata?.premiereDate);
        const providerQuery = providerResult?.query || queries[0] || row.title;
        const providerEvaluation = evaluateCandidate(row, providerDate, 'provider', options);

        auditEntry.provider.query = providerQuery;
        auditEntry.provider.premiereDate = providerDate || null;
        auditEntry.provider.premiereDateSource = providerPremiereMeta;
        auditEntry.provider.decision = providerEvaluation.reason;

        let chosen = providerEvaluation.accepted
          ? { source: 'provider', premiereDate: providerEvaluation.value, providerMeta: providerPremiereMeta }
          : null;

        if (!chosen && providerEvaluation.reason !== 'same_as_current' && options.ai && apiKey) {
          auditEntry.ai.used = true;
          aiCallCount += 1;

          const aiResult = await fetchAiPremiereDate(row, apiKey);
          const aiEvaluation = evaluateCandidate(row, aiResult.premiereDate, 'ai', options, aiResult.confidence);

          auditEntry.ai.premiereDate = aiResult.premiereDate || null;
          auditEntry.ai.confidence = aiResult.confidence;
          auditEntry.ai.decision = aiEvaluation.reason;

          if (aiEvaluation.accepted) {
            chosen = {
              source: 'ai',
              premiereDate: aiEvaluation.value,
              confidence: aiResult.confidence,
            };
          }
        } else if (providerEvaluation.reason === 'same_as_current') {
          auditEntry.ai.decision = 'provider_same_as_current';
        } else if (!options.ai) {
          auditEntry.ai.decision = 'ai_disabled';
        } else if (!apiKey) {
          auditEntry.ai.decision = 'missing_api_key';
        }

        if (!chosen) {
          skippedCount += 1;
          auditEntry.outcome = 'skip';
          auditEntry.reason = [auditEntry.provider.decision, auditEntry.ai.decision].filter(Boolean).join('; ');
          console.log(`[skip] #${row.id} ${row.title} -> ${auditEntry.reason}`);
        } else if (options.dryRun) {
          changedCount += 1;
          auditEntry.outcome = 'dry-run';
          auditEntry.source = chosen.source;
          auditEntry.afterPremiereDate = chosen.premiereDate;
          auditEntry.reason = 'dry_run_preview';

          if (chosen.source === 'provider') {
            providerSelectedCount += 1;
            const providerSite = chosen.providerMeta?.site ? `:${chosen.providerMeta.site}` : '';
            console.log(`[dry-run] #${row.id} ${row.title} -> ${chosen.premiereDate} via provider${providerSite}`);
          } else {
            aiSelectedCount += 1;
            console.log(`[dry-run] #${row.id} ${row.title} -> ${chosen.premiereDate} via ai (confidence=${formatConfidence(chosen.confidence)})`);
          }
        } else {
          await applyPremiereDate(connection, row.id, chosen.premiereDate);
          changedCount += 1;
          auditEntry.outcome = 'updated';
          auditEntry.source = chosen.source;
          auditEntry.afterPremiereDate = chosen.premiereDate;
          auditEntry.reason = 'updated';

          if (chosen.source === 'provider') {
            providerSelectedCount += 1;
            const providerSite = chosen.providerMeta?.site ? `:${chosen.providerMeta.site}` : '';
            console.log(`[updated] #${row.id} ${row.title} -> ${chosen.premiereDate} via provider${providerSite}`);
          } else {
            aiSelectedCount += 1;
            console.log(`[updated] #${row.id} ${row.title} -> ${chosen.premiereDate} via ai (confidence=${formatConfidence(chosen.confidence)})`);
          }
        }
      } catch (error) {
        errorCount += 1;
        auditEntry.outcome = 'error';
        auditEntry.reason = error?.message || String(error);
        console.error(`[error] #${row.id} ${row.title}:`, error?.message || error);
      }

      auditEntries.push(auditEntry);

      if (index < queue.length - 1 && options.delay > 0) {
        await sleep(options.delay);
      }
    }
  } finally {
    await connection.end();
  }

  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        mode: options.dryRun ? 'dry-run' : 'write',
        options: {
          force: options.force,
          limit: options.limit ?? null,
          delay: options.delay,
          ids: options.ids ?? null,
          ai: options.ai,
          minConfidence: options.minConfidence,
          logFile: path.relative(PROJECT_ROOT, auditPath),
        },
        summary: {
          loadedCount,
          selectedCount,
          changedCount,
          skippedCount,
          errorCount,
          providerSelectedCount,
          aiSelectedCount,
          aiCallCount,
        },
        entries: auditEntries,
      },
      null,
      2
    )
  );

  console.log(`Audit log written to ${path.relative(PROJECT_ROOT, auditPath)}`);
  console.log(`Done. changed=${changedCount}, skipped=${skippedCount}, errors=${errorCount}, provider=${providerSelectedCount}, ai=${aiSelectedCount}, aiCalls=${aiCallCount}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});