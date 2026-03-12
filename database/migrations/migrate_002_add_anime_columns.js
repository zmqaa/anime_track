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

  const columns = [
    { name: 'summary', type: 'TEXT' },
    { name: 'start_date', type: 'DATE' },
    { name: 'end_date', type: 'DATE' },
    { name: 'premiere_date', type: 'DATE' }
  ];

  try {
    for (const col of columns) {
      try {
        const query = `ALTER TABLE anime ADD COLUMN ${col.name} ${col.type}`;
        await connection.execute(query);
        console.log(`Added column: ${col.name}`);
      } catch (err) {
        if (err.errno === 1060) {
           console.log(`Column ${col.name} already exists. Skipping.`);
        } else {
           console.error(`Failed to add ${col.name}:`, err.message);
        }
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
  }
}

main();
