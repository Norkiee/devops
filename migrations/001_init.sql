-- Tasklist — initial schema
-- Covers the OAuth handoff (replacing Redis) plus the memory layer:
-- durable flow identity, design fingerprints, generated-item history, and a
-- dedup ledger for resolved comments.

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
