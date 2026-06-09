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
    } catch {
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

// ── Memory layer ────────────────────────────────────────────────
// Generation/feedback history. Every write here is BEST-EFFORT: callers wrap
// these in `safeMemory` so a DB failure (or a missing DATABASE_URL) logs and
// degrades to a no-op rather than breaking generation or submission.

// The lifecycle states a generated item can move through. Single source of
// truth so the validating endpoint and the type stay in lockstep.
export const FEEDBACK_STATUSES = ['approved', 'edited', 'rejected', 'pushed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface GeneratedItemRow {
  flowId: string | null;
  sourceType: string;
  workItemType: string;
  title: string;
  description?: string;
  sourceRef?: string; // plugin WorkItem.id, for later feedback correlation
}

export interface PriorItem {
  title: string;
  status: string;
  feedback: string | null;
}

export interface FeedbackUpdate {
  sourceRef: string; // plugin WorkItem.id
  status: FeedbackStatus;
  azureId?: number;
  feedback?: string;
}

// Runs a best-effort memory operation. Never throws — logs and returns a
// fallback so the caller's main flow is unaffected by storage issues.
export async function safeMemory<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[memory] ${label} failed:`, err);
    return fallback;
  }
}

// Upserts a batch of durable flows keyed on (file_key, flow_key) in a single
// round-trip and returns a flow_key → id map. The flow name defaults to the key.
export async function getOrCreateFlows(
  fileKey: string,
  flowKeys: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const keys = [...new Set(flowKeys)]; // dedup: ON CONFLICT can't hit a row twice
  if (keys.length === 0) return result;

  const sql = getSql();
  const rows = (await sql`
    INSERT INTO flows (file_key, flow_key, name)
    SELECT ${fileKey}, k, k FROM unnest(${keys}::text[]) AS k
    ON CONFLICT (file_key, flow_key) DO UPDATE
      SET name = COALESCE(excluded.name, flows.name)
    RETURNING flow_key, id
  `) as Array<{ flow_key: string; id: string }>;
  for (const r of rows) result.set(r.flow_key, r.id);
  return result;
}

// Inserts proposed generated items in a single multi-row statement.
export async function insertGeneratedItems(
  rows: GeneratedItemRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const sql = getSql();
  await sql`
    INSERT INTO generated_items
      (flow_id, source_type, work_item_type, title, description, source_ref, status)
    SELECT * FROM unnest(
      ${rows.map((r) => r.flowId)}::uuid[],
      ${rows.map((r) => r.sourceType)}::text[],
      ${rows.map((r) => r.workItemType)}::text[],
      ${rows.map((r) => r.title)}::text[],
      ${rows.map((r) => r.description ?? null)}::text[],
      ${rows.map((r) => r.sourceRef ?? null)}::text[],
      ${rows.map(() => 'proposed')}::text[]
    )
  `;
}

// Loads prior generated items for a set of flows, so the prompt can avoid
// re-emitting them and learn from past rejections.
export async function loadPriorItems(
  flowIds: string[]
): Promise<PriorItem[]> {
  if (flowIds.length === 0) return [];
  const sql = getSql();
  const rows = (await sql`
    SELECT title, status, feedback
    FROM generated_items
    WHERE flow_id = ANY(${flowIds})
    ORDER BY created_at DESC
    LIMIT 200
  `) as Array<{ title: string; status: string; feedback: string | null }>;
  return rows.map((r) => ({
    title: r.title,
    status: r.status,
    feedback: r.feedback,
  }));
}

// Records the outcome of a submit pass against previously-proposed items,
// matching on the plugin's WorkItem.id stored in source_ref.
export async function recordFeedback(
  updates: FeedbackUpdate[]
): Promise<void> {
  if (updates.length === 0) return;
  const sql = getSql();
  await sql`
    UPDATE generated_items AS g
    SET status = u.status,
        azure_id = u.azure_id,
        feedback = u.feedback
    FROM unnest(
      ${updates.map((u) => u.sourceRef)}::text[],
      ${updates.map((u) => u.status)}::text[],
      ${updates.map((u) => u.azureId ?? null)}::bigint[],
      ${updates.map((u) => u.feedback ?? null)}::text[]
    ) AS u(source_ref, status, azure_id, feedback)
    WHERE g.source_ref = u.source_ref
  `;
}
