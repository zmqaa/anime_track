const { query } = require('../../lib/db');

async function migrate() {
  console.log('Starting migration: 004_add_detailed_credits');
  
  try {
    // Add columns if they don't exist
    // MySQL 5.7+ supports JSON. 
    await query(`
      ALTER TABLE anime
      ADD COLUMN IF NOT EXISTS original_work VARCHAR(255),
      ADD COLUMN IF NOT EXISTS cast JSON;
    `);
    
    console.log('Migration 004 completed successfully');
  } catch (error) {
    console.error('Migration 004 failed:', error);
    process.exit(1);
  }
}

migrate();
