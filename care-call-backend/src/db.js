import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

// Postgres DATE columns (OID 1082) get converted into full JS Date objects by
// default, which print with a verbose timestamp+timezone string like
// "Mon Aug 10 2026 00:00:00 GMT+0530...". Since we only ever display dates as
// plain text (never do date math with them), tell pg to leave them as the
// original "YYYY-MM-DD" string instead.
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres error', err);
});