ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);

UPDATE webhook_endpoints
SET tenant_id = user_id
WHERE tenant_id IS NULL;

ALTER TABLE webhook_endpoints
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_status_created
  ON webhook_endpoints(tenant_id, status, created_at DESC);

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);

UPDATE webhook_deliveries AS d
SET tenant_id = COALESCE(e.tenant_id, d.user_id)
FROM webhook_endpoints AS e
WHERE d.tenant_id IS NULL
  AND d.endpoint_id = e.endpoint_id;

UPDATE webhook_deliveries
SET tenant_id = user_id
WHERE tenant_id IS NULL;

ALTER TABLE webhook_deliveries
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_status_created
  ON webhook_deliveries(tenant_id, status, created_at DESC);
