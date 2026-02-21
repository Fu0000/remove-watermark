CREATE TABLE IF NOT EXISTS plans (
  plan_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  monthly_quota INTEGER NOT NULL CHECK (monthly_quota >= 0),
  features_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_plans_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_plans_active_sort ON plans(is_active, sort_order ASC);

INSERT INTO plans (plan_id, name, price, currency, monthly_quota, features_json, sort_order, is_active)
VALUES
  ('free', 'Free', 0, 'CNY', 20, '["standard_quality", "basic_queue"]'::jsonb, 10, true),
  ('pro_month', 'Pro 月付', 39, 'CNY', 300, '["high_quality", "priority_queue"]'::jsonb, 20, true),
  ('pro_year', 'Pro 年付', 299, 'CNY', 3600, '["high_quality", "priority_queue"]'::jsonb, 30, true)
ON CONFLICT (plan_id) DO UPDATE
SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  monthly_quota = EXCLUDED.monthly_quota,
  features_json = EXCLUDED.features_json,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();
