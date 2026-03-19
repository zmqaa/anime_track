const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { config: loadEnv } = require('dotenv');

const projectRoot = path.join(__dirname, '../..');

function loadDatabaseEnv() {
  for (const fileName of ['.env.local', '.env']) {
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

  const args = process.argv.slice(2);
  const shouldClearSuspiciousFuture = args.includes('--clear-suspicious-future');
  const titleArg = args.find((arg) => !arg.startsWith('--'));
  const title = titleArg || '看得见的女孩';
  const connection = await mysql.createConnection({
    host: requireEnv('MYSQL_HOST'),
    port: Number(requireEnv('MYSQL_PORT')),
    user: requireEnv('MYSQL_USER'),
    password: process.env.MYSQL_PASSWORD || '',
    database: requireEnv('MYSQL_DATABASE'),
    charset: 'utf8mb4',
  });

  try {
    if (shouldClearSuspiciousFuture) {
      await connection.query(`
        UPDATE anime
        SET premiere_date = NULL
        WHERE premiere_date IS NOT NULL
          AND premiere_date > CURDATE()
          AND (
            progress > 0
            OR status IN ('watching', 'completed', 'dropped')
            OR start_date IS NOT NULL
            OR end_date IS NOT NULL
          )
      `);
    }

    const [countRows] = await connection.query(`
      SELECT
        COUNT(*) AS total,
        SUM(score IS NULL) AS scoreNulls,
        SUM(premiere_date IS NULL) AS premiereNulls,
        SUM(summary IS NULL) AS summaryNulls
      FROM anime
    `);

    const [titleRows] = await connection.query(
      `
        SELECT
          id,
          title,
          DATE_FORMAT(premiere_date, '%Y-%m-%d') AS premiereDate,
          score,
          LEFT(summary, 60) AS summaryPreview
        FROM anime
        WHERE title = ?
        LIMIT 1
      `,
      [title]
    );

    const [futureRows] = await connection.query(`
      SELECT
        id,
        title,
        status,
        progress,
        DATE_FORMAT(premiere_date, '%Y-%m-%d') AS premiereDate
      FROM anime
      WHERE premiere_date IS NOT NULL
        AND premiere_date > CURDATE()
        AND (
          progress > 0
          OR status IN ('watching', 'completed', 'dropped')
          OR start_date IS NOT NULL
          OR end_date IS NOT NULL
        )
      ORDER BY premiere_date ASC, id ASC
      LIMIT 12
    `);

    console.log(JSON.stringify({
      counts: Array.isArray(countRows) ? countRows[0] : null,
      item: Array.isArray(titleRows) && titleRows.length > 0 ? titleRows[0] : null,
      suspiciousFuturePremieres: Array.isArray(futureRows) ? futureRows : [],
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});