const mysql = require('mysql2/promise');

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
    // 1. Sync progress for completed anime
    // Find all completed anime where progress does not match totalEpisodes
    // Only where totalEpisodes is valid (>0)
    const [rows] = await connection.execute(
      `SELECT id, title, progress, totalEpisodes 
       FROM anime 
       WHERE status = 'completed' 
       AND totalEpisodes IS NOT NULL 
       AND totalEpisodes > 0 
       AND progress != totalEpisodes`
    );
    
    console.log(`Found ${rows.length} completed anime with mismatched progress.`);

    if (rows.length > 0) {
      for (const anime of rows) {
        console.log(`Syncing [${anime.title}]: Progress ${anime.progress} -> ${anime.totalEpisodes}`);
        await connection.execute(
          `UPDATE anime SET progress = ? WHERE id = ?`,
          [anime.totalEpisodes, anime.id]
        );
      }
      console.log('All completed anime synced.');
    } else {
        console.log('No completed anime needed syncing.');
    }

    // 2. Optional: Check for 'watching' anime that might have progress > totalEpisodes (overflow)
    // If progress > totalEpisodes, it's likely totalEpisodes was updated by AI to be smaller (e.g., 24 -> 12)
    // but the user's progress was left at 24.
    // User said "remove residual wrong episodes", this might be what they mean.
    
    const [overflowRows] = await connection.execute(
        `SELECT id, title, progress, totalEpisodes, status
         FROM anime 
         WHERE totalEpisodes IS NOT NULL 
         AND totalEpisodes > 0 
         AND progress > totalEpisodes`
    );

    if (overflowRows.length > 0) {
        console.log(`\nFound ${overflowRows.length} anime with progress > totalEpisodes (Overflow). Fixing...`);
        for (const anime of overflowRows) {
            // For overflow, cap it at totalEpisodes.
            // If it was completed, it's handled above (set to total), but if it was > total, it will be set to total.
            // If it is watching, and progress > total, maybe we should just set it to total and maybe mark as completed?
            // User's instruction: "显示已看完的就是填满这个集数即可"
            // For now, I'll just cap progress at totalEpisodes to be safe.
             console.log(`Capping [${anime.title}] (${anime.status}): ${anime.progress} -> ${anime.totalEpisodes}`);
             await connection.execute(
                `UPDATE anime SET progress = ? WHERE id = ?`,
                [anime.totalEpisodes, anime.id]
             );
        }
    }

  } catch (err) {
    console.error('Database Error:', err);
  } finally {
    await connection.end();
  }
}

main();
