ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS result_json JSONB;

CREATE TABLE IF NOT EXISTS task_regions (
  task_id VARCHAR(64) PRIMARY KEY,
  region_id VARCHAR(64) NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  schema_version VARCHAR(32) NOT NULL,
  version INT NOT NULL,
  regions_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_task_regions_task_id
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);
