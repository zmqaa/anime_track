const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { config: loadEnv } = require('dotenv');

const projectRoot = path.join(__dirname, '../..');

function loadDatabaseEnv() {
  const envFiles = ['.env.local', '.env'];

  for (const fileName of envFiles) {
    const filePath = path.join(projectRoot, fileName);
    if (fs.existsSync(filePath)) {
      loadEnv({ path: filePath, override: false });
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  loadDatabaseEnv();

  const inputFiles = process.argv.slice(2);
  if (inputFiles.length === 0) {
    throw new Error('Usage: node scripts/maintenance/apply_sql_files.js <file.sql> [more.sql]');
  }

  const connection = await mysql.createConnection({
    host: requireEnv('MYSQL_HOST'),
    port: Number(requireEnv('MYSQL_PORT')),
    user: requireEnv('MYSQL_USER'),
    password: requireEnv('MYSQL_PASSWORD'),
    database: requireEnv('MYSQL_DATABASE'),
    charset: 'utf8mb4',
    multipleStatements: true,
  });

  try {
    for (const file of inputFiles) {
      const absolutePath = path.isAbsolute(file) ? file : path.join(projectRoot, file);
      const sql = fs.readFileSync(absolutePath, 'utf8');
      const displayPath = path.relative(projectRoot, absolutePath) || absolutePath;

      console.log(`Applying ${displayPath} ...`);
      await connection.query(sql);
      console.log(`Applied ${displayPath}`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});