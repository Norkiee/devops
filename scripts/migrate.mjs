import { readFileSync } from 'node:fs';
import { Pool, neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = globalThis.WebSocket;

const url = process.env.DATABASE_URL;
if (!url) { console.error('Missing DATABASE_URL'); process.exit(1); }

const file = process.argv[2];
const raw = readFileSync(file, 'utf8');

const pool = new Pool({ connectionString: url });
try {
  await pool.query(raw); // simple protocol runs all semicolon-separated statements
  console.log(`Migration applied: ${file}`);
} finally {
  await pool.end();
}
