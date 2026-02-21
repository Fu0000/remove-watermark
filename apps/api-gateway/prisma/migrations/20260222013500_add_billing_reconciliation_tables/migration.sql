CREATE TABLE IF NOT EXISTS billing_reconcile_monthly (
  month_key CHAR(7) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  committed_units INTEGER NOT NULL DEFAULT 0 CHECK (committed_units >= 0),
  held_units INTEGER NOT NULL DEFAULT 0 CHECK (held_units >= 0),
  released_units INTEGER NOT NULL DEFAULT 0 CHECK (released_units >= 0),
  ledger_count INTEGER NOT NULL DEFAULT 0 CHECK (ledger_count >= 0),
  first_consume_at TIMESTAMPTZ,
  last_consume_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_reconcile_monthly_updated_at
ON billing_reconcile_monthly(updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_reconcile_checkpoints (
  checkpoint_key VARCHAR(64) PRIMARY KEY,
  watermark_at TIMESTAMPTZ,
  last_run_id VARCHAR(64),
  last_mode VARCHAR(32),
  meta_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_reconcile_runs (
  run_id VARCHAR(64) PRIMARY KEY,
  mode VARCHAR(32) NOT NULL CHECK (mode IN ('HOURLY_INCREMENTAL', 'DAILY_FULL')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED', 'MISMATCH')),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  scanned_rows INTEGER NOT NULL DEFAULT 0 CHECK (scanned_rows >= 0),
  impacted_users INTEGER NOT NULL DEFAULT 0 CHECK (impacted_users >= 0),
  impacted_months INTEGER NOT NULL DEFAULT 0 CHECK (impacted_months >= 0),
  mismatch_count INTEGER NOT NULL DEFAULT 0 CHECK (mismatch_count >= 0),
  summary_json JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_reconcile_runs_started_at
ON billing_reconcile_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_reconcile_runs_status_started
ON billing_reconcile_runs(status, started_at DESC);
