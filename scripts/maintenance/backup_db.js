const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables manually since this is a standalone script
// In a real project, you might use dotenv
const envPath = path.join(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
}

const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER;
const password = process.env.MYSQL_PASSWORD;
const database = process.env.MYSQL_DATABASE;
const backupDir = path.join(__dirname, '../../backups');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const fileName = `backup-${database}-${timestamp}.sql`;
const filePath = path.join(backupDir, fileName);

console.log(`Starting backup of ${database}...`);

const cmd = `mysqldump -h ${host} -u ${user} -p${password} ${database} > "${filePath}"`;

exec(cmd, (error, stdout, stderr) => {
    if (error) {
        console.error(`Backup failed: ${error.message}`);
        return;
    }
    if (stderr && !stderr.includes('password on the command line interface can be insecure')) {
        console.error(`Backup stderr: ${stderr}`);
        return;
    }
    console.log(`Backup completed successfully: ${filePath}`);
    
    // Optional: Keep only last 7 backups
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql')).sort();
    if (files.length > 7) {
        files.slice(0, files.length - 7).forEach(f => {
            fs.unlinkSync(path.join(backupDir, f));
            console.log(`Deleted old backup: ${f}`);
        });
    }
});
