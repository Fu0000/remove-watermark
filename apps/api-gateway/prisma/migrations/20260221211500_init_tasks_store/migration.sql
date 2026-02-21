CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  asset_id VARCHAR(64) NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  task_policy VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  error_code VARCHAR(16),
  error_message TEXT,
  result_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_created_at ON tasks(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS task_masks (
  task_id VARCHAR(64) PRIMARY KEY,
  mask_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  polygons JSONB NOT NULL DEFAULT '[]'::jsonb,
  brush_strokes JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_task_masks_task_id FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_hash TEXT NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_idempotency_keys_user_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_task_id ON idempotency_keys(task_id);

CREATE TABLE IF NOT EXISTS task_action_idempotency (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_task_action_idem_user_key UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS usage_ledger (
  ledger_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  source VARCHAR(64) NOT NULL,
  consume_unit INTEGER NOT NULL DEFAULT 1,
  consume_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_consume_at ON usage_ledger(user_id, consume_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_task_id ON usage_ledger(task_id);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(32) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created_at ON outbox_events(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
