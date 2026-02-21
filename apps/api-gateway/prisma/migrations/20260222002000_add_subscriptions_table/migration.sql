CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'REFUNDED')),
  channel VARCHAR(16) NOT NULL CHECK (channel IN ('WECHAT_PAY')),
  external_order_id VARCHAR(128),
  started_at TIMESTAMPTZ,
  effective_at TIMESTAMPTZ,
  expire_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  meta_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_subscriptions_external_order_id UNIQUE (external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_created_at
ON subscriptions(user_id, created_at DESC);
