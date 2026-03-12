const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'personal_web'
  });

  console.log('Connected to database for performance indexing.');

  try {
    const skipErrorsExecute = async (sql) => {
      try {
        await connection.execute(sql);
        console.log(`Success: ${sql}`);
      } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME') {
          console.log(`Skipped (already exists): ${sql}`);
        } else {
          console.error(`Error executing ${sql}:`, e.message);
        }
      }
    };

    const indexQueries = [
      "ALTER TABLE anime ADD INDEX idx_anime_status (status)",
      "ALTER TABLE anime ADD INDEX idx_anime_updatedAt (updatedAt)",
      "ALTER TABLE watch_history ADD INDEX idx_watch_history_animeId (animeId)",
      "ALTER TABLE watch_history ADD INDEX idx_watch_history_watchedAt (watchedAt)",
      "ALTER TABLE users ADD INDEX idx_users_role (role)"
    ];

    for (const query of indexQueries) {
      await skipErrorsExecute(query);
    }

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

main();
