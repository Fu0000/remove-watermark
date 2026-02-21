CREATE UNIQUE INDEX IF NOT EXISTS uk_usage_ledger_task_status_source
ON usage_ledger(user_id, task_id, status, source);
