# Tasklist — implementation plan: source adapters + Postgres memory

Product name: **Tasklist**. Repo/folder stays `devops` for now — rename the package, `CLAUDE.md`, and the deployed URL later if you want.

Build on the existing `devops` codebase. Keep the Azure DevOps flow exactly as is. This plan adds three things:

1. A Postgres store, replacing Redis entirely.
2. A source-adapter layer so tasks/stories can come from more than selected frames.
3. Accept/reject feedback persistence so generation stops repeating itself.

Nothing here changes how work items get pushed to Azure. The push path (`api/azure/*`, the ReviewScreen, OAuth) stays.

---

## Core idea — one input becomes many

Right now there is exactly one input source: selected Figma frames. The plugin extracts `FrameData`, posts to `api/generate.ts`, the user reviews, and it pushes to Azure.

Every new feature below is the same move — another adapter that normalizes into the input `generate` already consumes, then rides the existing review → push path.

```
                 ┌─ figma-frames     (existing, refactor into adapter)
 sources ────────┼─ design-delta     ("tasks from doing work")
                 ├─ readme           ("stories from README")
                 └─ resolved-comments
                          │
                          ▼
              normalize → generate (Claude) → ReviewScreen → Azure push
                          │                                      │
                          └──────── Postgres memory ◄────────────┘
                                  (snapshots, push history, feedback, dedup)
```

Do not fork the generate or push logic per source. Adapters only produce normalized units.

---

## Phase 0 — Postgres in, Redis out

Redis is only doing the OAuth handoff (`KVSession`, polling state via `kvGetDel`). Postgres covers it. One store, one connection string.

### Provider
Neon, via the `@neondatabase/serverless` driver — HTTP/WebSocket queries that survive Vercel's serverless functions without connection-pool exhaustion. Do **not** use the deprecated `@vercel/postgres` package.

```bash
cd devops
npm rm ioredis
npm i @neondatabase/serverless
```

### New file: `api/_lib/db.ts`
Reimplement the same key-value helpers currently in `api/_lib/redis.ts`, backed by Postgres, keeping identical signatures so callers barely change:

- `kvGet<T>(key)` → select.
- `kvGetDel<T>(key)` → `DELETE … RETURNING` — this is the atomic get-and-delete that `api/azure/poll.ts` relies on. Postgres `DELETE … RETURNING` is atomic, so the race protection is preserved.
- `kvSet(key, value, expirySeconds?)` → upsert with `expires_at`.
- `kvDel(key)` → delete.

Reads must treat `expires_at < now()` as absent.

### Swap imports
Replace `from './_lib/redis'` with `from './_lib/db'` in:
`api/azure/poll.ts`, `api/azure/callback.ts`, `api/azure/refresh.ts`, plus anywhere else importing `redis`. Then delete `api/_lib/redis.ts`.

### Env
- Remove `REDIS_URL`.
- Add `DATABASE_URL` (Neon connection string).

---

## Phase 1 — schema

Run as the first migration. Covers the OAuth replacement plus the memory layer.

```sql
-- ── OAuth handoff (replaces Redis) ──────────────────────────────
create table kv_store (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on kv_store (expires_at);

-- ── Durable flow identity (NOT the volatile Figma node-id) ──────
create table flows (
  id         uuid primary key default gen_random_uuid(),
  file_key   text not null,
  flow_key   text not null,          -- stable: frame/section name within the file
  name       text,
  created_at timestamptz not null default now(),
  unique (file_key, flow_key)
);

-- ── Design fingerprint per generation run ───────────────────────
create table design_snapshots (
  id          uuid primary key default gen_random_uuid(),
  flow_id     uuid not null references flows(id) on delete cascade,
  fingerprint jsonb not null,        -- normalized, volatile fields stripped
  hash        text not null,         -- sha256(fingerprint) for fast no-change check
  created_at  timestamptz not null default now()
);
create index on design_snapshots (flow_id, created_at desc);

-- ── What was generated, what happened to it, where it landed ────
create table generated_items (
  id             uuid primary key default gen_random_uuid(),
  flow_id        uuid references flows(id) on delete set null,
  source_type    text not null,      -- figma_frames | design_delta | readme | resolved_comment
  work_item_type text not null,      -- Epic | Feature | UserStory | Task
  title          text not null,
  description    text,
  azure_id       bigint,             -- set once pushed
  status         text not null default 'proposed', -- proposed|approved|edited|rejected|pushed
  feedback       text,               -- optional reason on edit/reject
  source_ref     text,               -- comment id, frame id, or doc name
  snapshot_id    uuid references design_snapshots(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on generated_items (flow_id);
create index on generated_items (source_type);

-- ── Dedup ledger for resolved comments already turned into items ─
create table comment_ingest (
  file_key          text not null,
  comment_id        text not null,
  generated_item_id uuid references generated_items(id) on delete set null,
  ingested_at       timestamptz not null default now(),
  primary key (file_key, comment_id)
);
```

`flows.flow_key` is the load-bearing decision. Do not key on the Figma node-id — it churns when a frame is re-scoped or restructured, which silently orphans snapshots and feedback. Use the frame/section name within the file, or let the user name the flow.

---

## Phase 2 — source adapter layer

### New: `api/_lib/sources/types.ts`
```ts
export type SourceType = 'figma_frames' | 'design_delta' | 'readme' | 'resolved_comment';

export interface GenerationUnit {
  refId: string;                      // frame id, comment id, doc section
  refName: string;
  flowKey?: string;                   // durable flow key when applicable
  content: Record<string, unknown>;   // free-form; the prompt builder turns this into the user message
}

export interface GenerationInput {
  sourceType: SourceType;
  workItemType: WorkItemType;         // reuse existing type
  context?: string;
  hierarchyContext?: HierarchyContext;
  units: GenerationUnit[];
}
```

### Refactor `api/_lib/claude.ts`
Extract the raw call into a reusable function so every adapter shares retry + JSON extraction:
```ts
export async function callClaudeJSON(system: string, user: string, maxTokens = 1500): Promise<string>;
```
Keep the existing per-type prompt builders (`buildTaskPrompt`, `buildUserStoryPrompt`, etc.) but have them consume a `GenerationUnit` instead of `FrameData` directly. Existing frame behavior must not change.

### Refactor `api/generate.ts`
Accept either the current `{ frames, … }` body (keep for backwards compatibility) or a `GenerationInput`. Internally, the frames path becomes adapter A producing `GenerationInput`. Response shape stays the same (`frameWorkItems` + `frameTasks` alias) so the plugin keeps working.

### Adapter A — figma-frames (refactor only)
Move the current `FrameData → prompt` logic behind the adapter interface. No new behavior. This proves the abstraction before adding new sources.

### Adapter B — design-delta ("tasks from doing work")
- Input: current `FrameData[]` for a flow (same extraction the plugin already does).
- Normalize → fingerprint (Phase 3). Compute hash.
- Look up latest `design_snapshots` row for the flow. If hash matches, return "no changes" and skip the Claude call.
- Otherwise diff against the stored fingerprint → produce units only for new/changed frames.
- Pull prior `generated_items` for the flow and pass their titles into `context` so Claude doesn't re-emit them.
- Persist the new snapshot after a successful run.
- New endpoint: `POST /api/generate/delta` (or a `sourceType` switch inside `generate.ts`).

### Adapter C — readme ("stories from README")
- Port tasky's extraction prompt (in `tasky/AGENTS.md`, the `EXTRACTION_PROMPT`) — it already outputs epics → features → stories with acceptance criteria in "As a… I can… so that…" form.
- Input: README text (paste field or file).
- Output stories map onto the existing Azure story create path — `createUserStories` in the plugin and `api/azure/stories.ts` POST. Reuse, don't rebuild.
- New endpoint: `POST /api/extract` (mirror tasky's).
- Caveat to expect: READMEs describe what a thing *is*, not user outcomes, so this often yields cleaner epics/features than true stories. Tune the prompt; allow the user to pick the output type.

### Adapter D — resolved-comments
- Comments are **not** reachable from the Figma plugin API. They come from the REST API: `GET /v1/files/:file_key/comments`, scope `file_comments:read`. So this runs on the backend with a Figma token (see Phase 5).
- Filter to resolved: keep comments where `resolved_at != null`.
- Dedup via `comment_ingest` — skip any `(file_key, comment_id)` already ingested.
- Use `client_meta` to anchor each comment to the frame/region it sits on (best-effort — `client_meta` is sometimes null).
- Treat each resolved comment as a decided change → generate a Task, tie it to the anchored flow.
- One-way only: the API can read resolved state but cannot set it, so there's no "mark done back in Figma."
- New endpoint: `POST /api/sources/comments` taking `{ fileKey }`.

---

## Phase 3 — fingerprint + diff (shared by adapter B)

### Normalizer: `api/_lib/fingerprint.ts`
Turn `FrameData` into a stable, semantic fingerprint. Keep: frame name, `componentNames`, meaningful `textContent`, `nestedFrameNames`, `layoutPattern`, interactive elements. Drop: coordinates, dimensions that fluctuate, raw node-ids, ordering noise. Sort arrays so equal designs hash equal.

```ts
export function fingerprint(frame: FrameData): object;     // stable, normalized
export function hashFingerprint(fp: object): string;       // sha256
export function diff(prev: object, next: object): { added: string[]; changed: string[]; removed: string[] };
```

The point of normalizing first: diffing raw Figma JSON reports "changes" on every nudge. Diff the fingerprint, not the tree.

---

## Phase 4 — feedback capture

The ReviewScreen already lets the user edit/deselect before submit. Wire its result into `generated_items`:

- On generate: insert each proposed item as `status='proposed'`.
- On submit: update to `approved` / `edited` / `rejected`, store the `azure_id` for pushed ones, and capture an optional `feedback` note on edits/rejects.
- On the next run for the same flow: load prior items and feed their titles + any rejects into the prompt `context`, so Claude avoids duplicates and learns from past rejections.

This is the correction memory. It applies to all four adapters, not just the delta one.

---

## Phase 5 — Figma REST token (new auth surface, comments only)

Adapter D needs a Figma token on the backend — new, since the app currently only authenticates to Azure.

- Start with a personal access token in env: `FIGMA_TOKEN`, scope `file_comments:read`.
- Move to Figma OAuth later if this ships to other users.
- This is the one genuinely new dependency. The other three adapters need no new external auth.

---

## Env vars — final state

```
# existing
ANTHROPIC_API_KEY=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=common
AZURE_REDIRECT_URI=
AZURE_DEVOPS_RESOURCE_ID=

# changed
DATABASE_URL=            # Neon — replaces REDIS_URL
# REDIS_URL  (removed)

# new (Phase 5, comments adapter only)
FIGMA_TOKEN=
```

---

## Files — add / modify / delete

| Action | Path | Why |
|--------|------|-----|
| add | `api/_lib/db.ts` | Postgres KV + memory queries |
| delete | `api/_lib/redis.ts` | replaced by db.ts |
| modify | `api/azure/poll.ts`, `callback.ts`, `refresh.ts` | swap redis import for db |
| add | `migrations/001_init.sql` | schema from Phase 1 |
| add | `api/_lib/sources/types.ts` | adapter interface |
| add | `api/_lib/sources/{frames,delta,readme,comments}.ts` | the four adapters |
| modify | `api/_lib/claude.ts` | extract `callClaudeJSON`, adapters consume units |
| modify | `api/generate.ts` | accept `GenerationInput`, keep frames path |
| add | `api/_lib/fingerprint.ts` | normalize + hash + diff |
| add | `api/extract.ts` | README extraction (port from tasky) |
| add | `api/sources/comments.ts` | resolved-comment ingest |
| modify | `plugin/src/ui/services/api.ts` | new calls: delta, extract, comments |
| modify | `plugin/src/ui/screens/*` | entry points for the new sources + feedback on submit |
| modify | `plugin/src/main.ts` | reuse existing frame extraction for the delta source |

---

## Build order

1. Phase 0 + 1 — Postgres in, Redis out, schema live. Nothing user-facing changes; verify OAuth still works.
2. Adapter A refactor — prove the source layer with zero behavior change.
3. Adapter C (README) — lowest effort, mostly a port, no new auth.
4. Phase 4 feedback — small, and every later source inherits it.
5. Adapter D (comments) — budget for the Figma-token work.
6. Phase 3 + Adapter B (design-delta) — last, since it pulls in fingerprint/diff and is the most involved. This is also the memory feature.

---

## Non-goals / open decisions

- Not moving to Supabase. devops authenticates through Azure, so Supabase's auth/RLS/storage would be dead weight. Plain Neon Postgres.
- Not changing the Azure push, hierarchy, or process-template handling.
- Open: whether "doing work" should ever pull from in-progress Azure items rather than Figma deltas. Current plan assumes Figma deltas only.
- Open: README output type — stories vs epics/features. Let the user choose at generate time.
