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
    const queries = [
      "ALTER TABLE anime ADD COLUMN IF NOT EXISTS summary TEXT",
      "ALTER TABLE anime ADD COLUMN IF NOT EXISTS start_date DATE",
      "ALTER TABLE anime ADD COLUMN IF NOT EXISTS end_date DATE",
      "ALTER TABLE anime ADD COLUMN IF NOT EXISTS premiere_date DATE"
    ];

    for (const query of queries) {
      await connection.execute(query);
      console.log(`Executed: ${query}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
  }
}

main();
