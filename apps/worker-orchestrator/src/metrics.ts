import type { TaskStatus } from "@packages/contracts";

export interface QueueDepthSnapshot {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface OutboxBatchSnapshot {
  scanned: number;
  published: number;
  failed: number;
  deadlettered: number;
}

export interface WorkerMetricsState {
  transitionCount: Map<string, number>;
  transitionDurationMsSum: Map<string, number>;
  transitionDurationMsCount: Map<string, number>;
  failureCountByCode: Map<string, number>;
  queueDepth: QueueDepthSnapshot;
  outbox: OutboxBatchSnapshot & { updatedAtMs: number };
}

function transitionKey(fromStatus: TaskStatus, toStatus: TaskStatus) {
  return `${fromStatus}->${toStatus}`;
}

function escapeLabelValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function createWorkerMetricsState(nowMs = Date.now()): WorkerMetricsState {
  return {
    transitionCount: new Map(),
    transitionDurationMsSum: new Map(),
    transitionDurationMsCount: new Map(),
    failureCountByCode: new Map(),
    queueDepth: {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0
    },
    outbox: {
      scanned: 0,
      published: 0,
      failed: 0,
      deadlettered: 0,
      updatedAtMs: nowMs
    }
  };
}

export function observeTaskTransition(
  state: WorkerMetricsState,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  durationMs: number
) {
  const key = transitionKey(fromStatus, toStatus);
  state.transitionCount.set(key, (state.transitionCount.get(key) || 0) + 1);
  state.transitionDurationMsCount.set(key, (state.transitionDurationMsCount.get(key) || 0) + 1);
  state.transitionDurationMsSum.set(key, (state.transitionDurationMsSum.get(key) || 0) + Math.max(0, durationMs));
}

export function observeTaskFailure(state: WorkerMetricsState, errorCode: string) {
  const normalized = errorCode.trim().length > 0 ? errorCode : "UNKNOWN";
  state.failureCountByCode.set(normalized, (state.failureCountByCode.get(normalized) || 0) + 1);
}

export function setQueueDepth(state: WorkerMetricsState, snapshot: QueueDepthSnapshot) {
  state.queueDepth = {
    waiting: Math.max(0, snapshot.waiting),
    active: Math.max(0, snapshot.active),
    delayed: Math.max(0, snapshot.delayed),
    failed: Math.max(0, snapshot.failed)
  };
}

export function setOutboxBatch(state: WorkerMetricsState, batch: OutboxBatchSnapshot, nowMs = Date.now()) {
  state.outbox = {
    scanned: Math.max(0, batch.scanned),
    published: Math.max(0, batch.published),
    failed: Math.max(0, batch.failed),
    deadlettered: Math.max(0, batch.deadlettered),
    updatedAtMs: nowMs
  };
}

export function renderPrometheusMetrics(state: WorkerMetricsState): string {
  const lines: string[] = [];

  lines.push("# HELP orchestrator_task_transition_total Total number of task status transitions.");
  lines.push("# TYPE orchestrator_task_transition_total counter");
  for (const [key, value] of state.transitionCount.entries()) {
    const [fromStatus, toStatus] = key.split("->");
    lines.push(
      `orchestrator_task_transition_total{from_status="${escapeLabelValue(fromStatus)}",to_status="${escapeLabelValue(toStatus)}"} ${value}`
    );
  }

  lines.push("# HELP orchestrator_task_transition_duration_ms_sum Sum of transition execution time in milliseconds.");
  lines.push("# TYPE orchestrator_task_transition_duration_ms_sum counter");
  for (const [key, value] of state.transitionDurationMsSum.entries()) {
    const [fromStatus, toStatus] = key.split("->");
    lines.push(
      `orchestrator_task_transition_duration_ms_sum{from_status="${escapeLabelValue(fromStatus)}",to_status="${escapeLabelValue(toStatus)}"} ${value}`
    );
  }

  lines.push("# HELP orchestrator_task_transition_duration_ms_count Number of transition duration observations.");
  lines.push("# TYPE orchestrator_task_transition_duration_ms_count counter");
  for (const [key, value] of state.transitionDurationMsCount.entries()) {
    const [fromStatus, toStatus] = key.split("->");
    lines.push(
      `orchestrator_task_transition_duration_ms_count{from_status="${escapeLabelValue(fromStatus)}",to_status="${escapeLabelValue(toStatus)}"} ${value}`
    );
  }

  lines.push("# HELP orchestrator_task_failed_total Number of tasks moved to FAILED grouped by error code.");
  lines.push("# TYPE orchestrator_task_failed_total counter");
  for (const [errorCode, value] of state.failureCountByCode.entries()) {
    lines.push(`orchestrator_task_failed_total{error_code="${escapeLabelValue(errorCode)}"} ${value}`);
  }

  lines.push("# HELP orchestrator_queue_jobs Current job counts in BullMQ queue by state.");
  lines.push("# TYPE orchestrator_queue_jobs gauge");
  lines.push(`orchestrator_queue_jobs{state="waiting"} ${state.queueDepth.waiting}`);
  lines.push(`orchestrator_queue_jobs{state="active"} ${state.queueDepth.active}`);
  lines.push(`orchestrator_queue_jobs{state="delayed"} ${state.queueDepth.delayed}`);
  lines.push(`orchestrator_queue_jobs{state="failed"} ${state.queueDepth.failed}`);

  lines.push("# HELP orchestrator_outbox_last_batch Last outbox dispatch batch stats.");
  lines.push("# TYPE orchestrator_outbox_last_batch gauge");
  lines.push(`orchestrator_outbox_last_batch{field="scanned"} ${state.outbox.scanned}`);
  lines.push(`orchestrator_outbox_last_batch{field="published"} ${state.outbox.published}`);
  lines.push(`orchestrator_outbox_last_batch{field="failed"} ${state.outbox.failed}`);
  lines.push(`orchestrator_outbox_last_batch{field="deadlettered"} ${state.outbox.deadlettered}`);
  lines.push(`orchestrator_outbox_last_batch{field="updated_at_ms"} ${state.outbox.updatedAtMs}`);

  return `${lines.join("\n")}\n`;
}
