CREATE TABLE IF NOT EXISTS input_inbox (
  delivery_id text PRIMARY KEY, raw_sha256 text NOT NULL, received_at timestamptz NOT NULL,
  source_id text NOT NULL, raw jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS input_event_keys (
  event_key text PRIMARY KEY, semantic_sha256 text NOT NULL, known_at timestamptz NOT NULL
);
-- Global event-key uniqueness is above, outside the time-partitioned table.
CREATE TABLE IF NOT EXISTS input_events (
  known_at timestamptz NOT NULL, event_key text NOT NULL, type text NOT NULL,
  subject text NOT NULL, source_id text NOT NULL, event_time timestamptz,
  event jsonb NOT NULL, PRIMARY KEY (known_at,event_key)
);
CREATE INDEX IF NOT EXISTS input_events_subject_time ON input_events(subject,known_at DESC);
CREATE TABLE IF NOT EXISTS input_quarantine (
  delivery_id text PRIMARY KEY, recorded_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL, raw jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS input_outbox (
  id bigserial PRIMARY KEY, effect_key text UNIQUE NOT NULL, topic text NOT NULL,
  stream_key text NOT NULL, body jsonb NOT NULL, sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS input_outbox_pending ON input_outbox(id) WHERE sent_at IS NULL;
CREATE TABLE IF NOT EXISTS input_chain_current (
  network text NOT NULL, height bigint NOT NULL, block_hash text NOT NULL,
  canonical boolean NOT NULL, finalized boolean NOT NULL, known_at timestamptz NOT NULL,
  PRIMARY KEY(network,height)
);
CREATE TABLE IF NOT EXISTS input_nlp_inbox (event_key text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS input_registry_imports (
  registry_sha256 text PRIMARY KEY, imported_at timestamptz NOT NULL DEFAULT now(),
  source_known_at timestamptz NOT NULL, summary jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS input_entity_versions (
  entity_id text NOT NULL, registry_sha256 text NOT NULL, entity jsonb NOT NULL,
  PRIMARY KEY(entity_id,registry_sha256)
);
CREATE TABLE IF NOT EXISTS input_institution_assertions (
  assertion_id text PRIMARY KEY, known_at timestamptz NOT NULL, assertion jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS input_institution_sources (
  source_id text PRIMARY KEY, source jsonb NOT NULL
);
