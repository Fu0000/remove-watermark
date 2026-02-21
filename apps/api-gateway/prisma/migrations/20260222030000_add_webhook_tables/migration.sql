CREATE TABLE IF NOT EXISTS webhook_endpoints (
  endpoint_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  url TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  events_json JSONB NOT NULL,
  timeout_ms INTEGER NOT NULL,
  max_retries INTEGER NOT NULL,
  active_key_id VARCHAR(32) NOT NULL,
  secret_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user_status_created
  ON webhook_endpoints(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_status_updated
  ON webhook_endpoints(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  endpoint_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  attempt INTEGER NOT NULL,
  request_headers JSONB NOT NULL,
  payload_sha256 VARCHAR(64) NOT NULL,
  signature_validated BOOLEAN NOT NULL,
  failure_code VARCHAR(64),
  error_message TEXT,
  response_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_webhook_deliveries_endpoint_id
    FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(endpoint_id) ON DELETE CASCADE,
  CONSTRAINT uk_webhook_endpoint_event_attempt UNIQUE (endpoint_id, event_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_status_created
  ON webhook_deliveries(endpoint_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_attempt
  ON webhook_deliveries(event_id, attempt);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_created
  ON webhook_deliveries(status, created_at DESC);
