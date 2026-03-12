const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables
const envPath = path.join(__dirname, '..', '.env.local');
let API_KEY = '';
try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DEEPSEEK_API_KEY=(.+)/);
    if (match) API_KEY = match[1].trim();
  }
} catch (e) {
  console.log('Warning: Could not read .env.local', e.message);
}

if (!API_KEY) {
  console.warn('DEEPSEEK_API_KEY not found in .env.local. Please check your configuration.');
  // Proceeding without key will fail the enrichment, but maybe we just want to test DB connection?
  // Better to exit for this specific task.
  process.exit(1);
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 2. AI Fetching Helper
async function enrichAnimeData(queryName) {
  console.log(`Fetching metadata for: ${queryName}...`);
  const prompt = `
You are an expert anime database assistant. I will give you a raw anime name (which might be a nickname, abbreviation, or partial name).
You need to identify the anime and return a JSON object with its details.

Raw Name: "${queryName}"

Return ONLY valid JSON with this structure:
{
  "officialTitle": "The official standard name in Simplified Chinese (简体中文).",
  "originalTitle": "The official original name (usually in Japanese Kanji/Kana). If not anime, use the original source language name.",
  "totalEpisodes": 12, // accurate total number of episodes (excluding OVAs unless specified), or null if unknown
  "durationMinutes": 24, // typical duration per episode in minutes
  "synopsis": "A concise summary in Simplified Chinese (简体中文). Do NOT make it up, use known information.",
  "tags": ["Tag1", "Tag2"], // Tags should be in Simplified Chinese (简体中文)
  "isFinished": true/false // true if the anime has finished airing, false if it is currently airing or upcoming
}
If you cannot identify the anime, return null.
`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Lower temperature for more deterministic/factual results
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
        const txt = await response.text();
        console.error(`API Error: ${response.status} - ${txt}`);
        return null;
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse JSON from AI response:', content);
      return null;
    }

  } catch (error) {
    console.error('Error fetching from AI:', error);
    return null;
  }
}

// 3. Main Script
async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'personal_web'
  });

  console.log('Connected to database.');

  try {
    // Get all anime
    const [rows] = await connection.execute('SELECT id, title FROM anime');
    console.log(`Found ${rows.length} anime records to process.`);

    for (const anime of rows) {
      // 1-second delay to be nice to the API
      await new Promise(r => setTimeout(r, 1000));

      const metadata = await enrichAnimeData(anime.title);
      
      if (metadata) {
        console.log(`Updating [${anime.title}] -> JP: ${metadata.originalTitle}, EPs: ${metadata.totalEpisodes}, Finished: ${metadata.isFinished}`);

        const updateQuery = `
          UPDATE anime 
          SET 
            summary = ?,
            totalEpisodes = ?,
            durationMinutes = ?,
            tags = ?,
            original_title = ?,
            isFinished = ?
          WHERE id = ?
        `;
        
        // Ensure tags is a JSON string
        const tagsJson = JSON.stringify(metadata.tags || []);
        
        await connection.execute(updateQuery, [
          metadata.synopsis || null,
          metadata.totalEpisodes || 0,
          metadata.durationMinutes || 0,
          tagsJson,
          metadata.originalTitle || null,
          metadata.isFinished ? 1 : 0,
          anime.id
        ]);
      } else {
        console.log(`Skipping [${anime.title}] - AI could not identify.`);
      }
    }
  } catch (err) {
    console.error('Database Error:', err);
  } finally {
    await connection.end();
  }
}

main();
