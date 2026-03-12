const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const USER_AGENT = 'PersonalAnimeWeb/1.0 (https://github.com/yourname/personal-web)';
const MAX_CAST_MEMBERS = 10;
const SEASON_PATTERN = /第([一二三四五六七八九十0-9]+)季|Season ([0-9]+)|S([0-9]+)/i;
const FOLLOW_UP_SEASON_PATTERN = /第[二三四五六七八九十2-9]+季|Season [2-9]|S[2-9]+/i;
const API_KEY = process.env.DEEPSEEK_API_KEY || '';

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

function parseExistingCast(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeSearchableAlias(value) {
  return String(value || '').trim();
}

function containsCjkText(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ''));
}

async function generateCastAliases(cast) {
  const normalizedCast = uniqueStrings(cast.map((name) => normalizeSearchableAlias(name)));
  if (normalizedCast.length === 0) {
    return [];
  }

  if (!API_KEY) {
    return normalizedCast;
  }

  const prompt = `
你是日本声优姓名规范助手。我会给你一组声优名字，它们可能是日文、罗马字或中文。
请为每个名字返回常见的简体中文名；如果不确定，返回 null。

返回 JSON：
{
  "actors": [
    { "name": "原始名字", "chineseName": "简体中文名或 null" }
  ]
}

输入：${JSON.stringify(normalizedCast)}
`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你只负责补全动漫声优的简体中文别名，不要输出解释。' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      return normalizedCast;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return normalizedCast;
    }

    const parsed = JSON.parse(content);
    const aiAliases = Array.isArray(parsed?.actors)
      ? parsed.actors.flatMap((actor) => {
          const chineseName = typeof actor?.chineseName === 'string' ? actor.chineseName.trim() : '';
          return containsCjkText(chineseName) ? [chineseName] : [];
        })
      : [];

    return uniqueStrings([...normalizedCast, ...aiAliases]);
  } catch {
    return normalizedCast;
  }
}

function selectBangumiSubject(subjects, title) {
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

async function fetchBangumiSubject(query) {
  const res = await fetch(`https://api.bgm.tv/search/subject/${encodeURIComponent(query)}?type=2&responseGroup=small&max_results=5`, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  if (!Array.isArray(data?.list) || data.list.length === 0) {
    return null;
  }

  return selectBangumiSubject(data.list, query);
}

async function fetchBangumiCast(subjectId) {
  const res = await fetch(`https://api.bgm.tv/subject/${subjectId}?responseGroup=large`, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
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
  const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  if (!Array.isArray(data?.data) || data.data.length === 0) {
    return null;
  }

  return data.data[0];
}

async function fetchJikanCast(malId) {
  const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`);
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
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

async function fetchCastForQuery(query) {
  const bangumiSubject = await fetchBangumiSubject(query);
  if (bangumiSubject?.id) {
    const bangumiCast = await fetchBangumiCast(Number(bangumiSubject.id));
    if (bangumiCast.length > 0) {
      return bangumiCast;
    }
  }

  const jikanAnime = await fetchJikanSearch(query);
  if (jikanAnime?.mal_id) {
    return fetchJikanCast(Number(jikanAnime.mal_id));
  }

  return [];
}

async function fetchCastForAnime(anime) {
  const queries = uniqueStrings([anime.original_title, anime.title]);

  for (const query of queries) {
    const cast = await fetchCastForQuery(query);
    if (cast.length > 0) {
      return { cast, query };
    }
  }

  return { cast: [], query: queries[0] || anime.title };
}

function printHelp() {
  console.log('Usage: node scripts/maintenance/backfill_anime_cast.js [--write] [--force] [--limit=50] [--delay=500]');
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    force: false,
    limit: undefined,
    delay: 400,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--write') {
      options.dryRun = false;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (Number.isFinite(value) && value > 0) {
        options.limit = value;
      }
      continue;
    }

    if (arg.startsWith('--delay=')) {
      const value = Number(arg.slice('--delay='.length));
      if (Number.isFinite(value) && value >= 0) {
        options.delay = value;
      }
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDbConfig() {
  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;

  if (!MYSQL_HOST || !MYSQL_PORT || !MYSQL_USER || !MYSQL_DATABASE) {
    throw new Error('Missing MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE in environment');
  }

  return {
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connection = await mysql.createConnection(createDbConfig());

  try {
    const [rows] = await connection.execute('SELECT id, title, original_title, cast, cast_aliases FROM anime ORDER BY updatedAt DESC');
    const allAnime = Array.isArray(rows) ? rows : [];
    const missingCastAnime = allAnime.filter((anime) => {
      if (options.force) {
        return true;
      }

      const hasCast = parseExistingCast(anime.cast).length > 0;
      const hasAliases = parseExistingCast(anime.cast_aliases).length > 0;
      return !hasCast || !hasAliases;
    });
    const candidates = typeof options.limit === 'number' ? missingCastAnime.slice(0, options.limit) : missingCastAnime;

    console.log(`Found ${allAnime.length} anime records, processing ${candidates.length}.`);
    if (options.dryRun) {
      console.log('Running in dry-run mode. No database rows will be changed. Add --write to apply updates.');
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      const anime = candidates[index];

      try {
        const existingCast = parseExistingCast(anime.cast);
        const existingAliases = parseExistingCast(anime.cast_aliases);
        let cast = existingCast;
        let query = anime.title;

        if (cast.length === 0) {
          const fetched = await fetchCastForAnime(anime);
          cast = fetched.cast;
          query = fetched.query;
        }

        const castAliases = await generateCastAliases(uniqueStrings([...cast, ...existingAliases]));

        if (cast.length === 0) {
          skippedCount += 1;
          console.log(`[skip] ${anime.title} -> no cast found`);
        } else if (options.dryRun) {
          updatedCount += 1;
          console.log(`[dry-run] ${anime.title} <= ${query} -> cast=${cast.join(', ')} | aliases=${castAliases.join(', ')}`);
        } else {
          await connection.execute('UPDATE anime SET cast = ?, cast_aliases = ?, updatedAt = NOW() WHERE id = ?', [JSON.stringify(cast), JSON.stringify(castAliases), anime.id]);
          updatedCount += 1;
          console.log(`[updated] ${anime.title} <= ${query} -> cast=${cast.join(', ')} | aliases=${castAliases.join(', ')}`);
        }
      } catch (error) {
        errorCount += 1;
        console.error(`[error] ${anime.title}:`, error.message || error);
      }

      if (index < candidates.length - 1 && options.delay > 0) {
        await sleep(options.delay);
      }
    }

    console.log(`Done. updated=${updatedCount}, skipped=${skippedCount}, errors=${errorCount}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});