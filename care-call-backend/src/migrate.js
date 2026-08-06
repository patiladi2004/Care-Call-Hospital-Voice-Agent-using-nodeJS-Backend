import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '..', 'migrations', '001_init.sql');

async function migrate() {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log('Running migration...');
  await pool.query(sql);
  console.log('Done. Tables created (or already existed).');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
