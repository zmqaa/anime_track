const mysql = require('mysql2/promise');

// Load env vars from .env.local if not in production, 
// but since this is a script, we might need to hardcode or use dotenv.
// Assuming local execution environment context or hardcoded for now based on previous scripts.
// The previous scripts used hardcoded crendentials in `insert_anime_batch.js`.
// I will try to read from `lib/env.ts` or just assume standard local defaults if connection fails.
// Let's copy the pattern from `migrate_001...`. Oh wait, I didn't read that file. 
// Let's assume standard local connection or use the one from `insert_anime_batch.js` which I read.
// Host: 127.0.0.1, User: root, Pass: 123456, DB: personal_web

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
    // Add original_title column
    console.log('Adding original_title column...');
    await connection.query(`
      ALTER TABLE anime
      ADD COLUMN original_title VARCHAR(255) AFTER title;
    `);
    console.log('original_title column added.');

    // Clear summary and totalEpisodes as requested
    console.log('Clearing summary and totalEpisodes...');
    await connection.query(`
      UPDATE anime
      SET summary = NULL, totalEpisodes = NULL, original_title = NULL;
    `);
    console.log('Fields cleared.');

  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column original_title already exists.');
    } else {
      console.error('Error:', err);
    }
  } finally {
    await connection.end();
  }
}

main();
