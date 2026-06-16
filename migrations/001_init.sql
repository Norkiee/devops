-- Tasklist — initial schema
-- Single key/value table backing the OAuth handoff (replaces Redis): the
-- callback stores the access token + sessionId under the OAuth state, and the
-- poll endpoint atomically reads-and-deletes it. Rows carry a short TTL.

create table kv_store (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on kv_store (expires_at);
