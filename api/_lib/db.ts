import { neon } from '@neondatabase/serverless';

// Neon's HTTP driver issues one-shot queries that survive Vercel's serverless
// model without exhausting a connection pool. A single tagged-template client is
// reused across invocations within a warm function instance.
let sqlClient: ReturnType<typeof neon> | null = null;

function getSql(): ReturnType<typeof neon> {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('Missing DATABASE_URL environment variable');
    }
    sqlClient = neon(url);
  }
  return sqlClient;
}

// jsonb columns are returned as already-parsed JS values by the Neon driver.
// Guard against the rare case of a value stored as a JSON string.
function coerce<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (e) {
      return value as unknown as T;
    }
  }
  return value as T;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT value FROM kv_store
    WHERE key = ${key}
      AND (expires_at IS NULL OR expires_at > now())
  `) as Array<{ value: unknown }>;
  if (rows.length === 0) return null;
  return coerce<T>(rows[0].value);
}

// Atomic get-and-delete to prevent race conditions where two poll requests
// could both receive the same token before deletion. Postgres `DELETE … RETURNING`
// is atomic, preserving the guarantee the Redis GETDEL implementation provided.
export async function kvGetDel<T>(key: string): Promise<T | null> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM kv_store
    WHERE key = ${key}
      AND (expires_at IS NULL OR expires_at > now())
    RETURNING value
  `) as Array<{ value: unknown }>;
  if (rows.length === 0) return null;
  return coerce<T>(rows[0].value);
}

export async function kvSet(
  key: string,
  value: unknown,
  expirySeconds?: number
): Promise<void> {
  const sql = getSql();
  const serialized = JSON.stringify(value);
  const expiresAt = expirySeconds
    ? new Date(Date.now() + expirySeconds * 1000).toISOString()
    : null;
  await sql`
    INSERT INTO kv_store (key, value, expires_at)
    VALUES (${key}, ${serialized}::jsonb, ${expiresAt}::timestamptz)
    ON CONFLICT (key) DO UPDATE
      SET value = excluded.value,
          expires_at = excluded.expires_at
  `;
}

export async function kvDel(key: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM kv_store WHERE key = ${key}`;
}
