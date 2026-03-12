const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Simple .env.local parser
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

async function main() {
    console.log('Correcting states: setting isFinished=1 but restoring status based on progress...');
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            port: process.env.MYSQL_PORT,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
        });

        // 1. 统一设为已完结 (Airing Status = Finished)
        await connection.execute('UPDATE anime SET isFinished = 1 WHERE status != "dropped"');
        
        // 2. 恢复观看状态 (User Status): 如果进度还没到总集数，恢复为 watching
        // 注意：只有当总集数已知且进度小于总集数时才恢复为正在看
        const [result] = await connection.execute(
            'UPDATE anime SET status = "watching" WHERE status = "completed" AND progress < totalEpisodes AND totalEpisodes IS NOT NULL AND totalEpisodes > 0'
        );
        
        console.log(`Success! restored ${result.affectedRows} anime to "watching" status.`);
        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('Update failed:', error);
        process.exit(1);
    }
}

main();
