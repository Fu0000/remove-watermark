CREATE TABLE IF NOT EXISTS assets (
  asset_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  sha256 VARCHAR(64),
  status VARCHAR(16) NOT NULL,
  cleanup_status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assets_user_status_created
  ON assets(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_status_updated
  ON assets(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS task_view_deletions (
  deletion_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_task_view_deletions_user_task UNIQUE (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_view_deletions_user_deleted
  ON task_view_deletions(user_id, deleted_at DESC);

CREATE TABLE IF NOT EXISTS account_delete_requests (
  request_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  eta_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_delete_requests_user_created
  ON account_delete_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_delete_requests_status_eta
  ON account_delete_requests(status, eta_at ASC);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  trace_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  ip VARCHAR(128) NOT NULL,
  user_agent TEXT NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_id VARCHAR(64),
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS compliance_idempotency (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_compliance_idempotency_user_key UNIQUE (user_id, idempotency_key)
);
