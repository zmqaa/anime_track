const mysql = require('mysql2/promise');

const animeList = [
  { title: "血界战线", totalEpisodes: 12 },
  { title: "东京食尸鬼", totalEpisodes: 12 },
  { title: "进击的巨人", totalEpisodes: 25 },
  { title: "寄生兽", totalEpisodes: 24 },
  { title: "fate系列", totalEpisodes: 24 },
  { title: "心理测量者", totalEpisodes: 22 },
  { title: "刀剑神域", totalEpisodes: 25 }
];

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
    for (const anime of animeList) {
      // Check if exists
      const [rows] = await connection.execute('SELECT id FROM anime WHERE title = ?', [anime.title]);
      
      if (rows.length > 0) {
        console.log(`Skipping existing: ${anime.title}`);
        continue;
      }

      // Insert
      await connection.execute(
        `INSERT INTO anime (title, status, progress, totalEpisodes, createdAt, updatedAt, tags) 
         VALUES (?, ?, ?, ?, NOW(), NOW(), ?)`,
        [anime.title, 'plan_to_watch', 0, anime.totalEpisodes, '[]']
      );
      console.log(`Inserted: ${anime.title}`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
  }
}

main();
