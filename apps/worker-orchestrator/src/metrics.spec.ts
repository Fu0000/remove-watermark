import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkerMetricsState,
  observeTaskFailure,
  observeTaskTransition,
  renderPrometheusMetrics,
  setOutboxBatch,
  setQueueDepth
} from "./metrics";

test("worker metrics should render transition/failure/backlog fields", () => {
  const metrics = createWorkerMetricsState(1700000000000);
  observeTaskTransition(metrics, "QUEUED", "PREPROCESSING", 25);
  observeTaskFailure(metrics, "50023");
  setQueueDepth(metrics, {
    waiting: 4,
    active: 2,
    delayed: 1,
    failed: 3
  });
  setOutboxBatch(
    metrics,
    {
      scanned: 8,
      published: 7,
      failed: 1,
      deadlettered: 0
    },
    1700000001234
  );

  const text = renderPrometheusMetrics(metrics);
  assert.match(text, /orchestrator_task_transition_total\{from_status="QUEUED",to_status="PREPROCESSING"\} 1/);
  assert.match(text, /orchestrator_task_failed_total\{error_code="50023"\} 1/);
  assert.match(text, /orchestrator_queue_jobs\{state="waiting"\} 4/);
  assert.match(text, /orchestrator_outbox_last_batch\{field="published"\} 7/);
});
