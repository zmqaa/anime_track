const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Simple .env.local parser to avoid dependency on 'dotenv'
const envPath = path.join(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
  });
}

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  const migrationsDir = path.join(__dirname, '../../database/migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.sql')) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
          await connection.query(sql);
          console.log(`Successfully ran ${file}`);
      } catch (err) {
          console.error(`Error running ${file}:`, err.message);
          // Continue or exit? usually exit on error for migrations
          process.exit(1);
      }
    }
  }

  await connection.end();
}

runMigrations().catch(err => {
  console.error(err);
  process.exit(1);
});
