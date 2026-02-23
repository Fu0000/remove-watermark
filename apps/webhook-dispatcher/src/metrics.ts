import type { DispatchBatchResult } from "./dispatcher";

export interface WebhookMetricsAlertOptions {
  windowMs: number;
  minSamples: number;
  minSuccessRate: number;
  maxRetryRate: number;
}

export interface WebhookMetricsState {
  windowStartedAtMs: number;
  windowAttempts: number;
  windowSuccesses: number;
  windowFailures: number;
  windowRetryDeliveries: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  totalRetryDeliveries: number;
  successRateAlerted: boolean;
  retryRateAlerted: boolean;
}

export interface WebhookMetricsSnapshot {
  webhook_success_rate: number;
  webhook_retry_total: number;
  webhook_retry_rate: number;
  attempts: number;
  successes: number;
  failures: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  totalRetryDeliveries: number;
}

export interface WebhookMetricsRecordResult {
  snapshot: WebhookMetricsSnapshot;
  successRateAlertTriggered: boolean;
  retryRateAlertTriggered: boolean;
}

export function createWebhookMetricsState(nowMs = Date.now()): WebhookMetricsState {
  return {
    windowStartedAtMs: nowMs,
    windowAttempts: 0,
    windowSuccesses: 0,
    windowFailures: 0,
    windowRetryDeliveries: 0,
    totalAttempts: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    totalRetryDeliveries: 0,
    successRateAlerted: false,
    retryRateAlerted: false
  };
}

export function parseRatio(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

export function recordDispatchMetrics(
  state: WebhookMetricsState,
  options: WebhookMetricsAlertOptions,
  batch: DispatchBatchResult,
  nowMs = Date.now()
): WebhookMetricsRecordResult {
  ensureWindowFresh(state, options, nowMs);

  const attempts = batch.deliverySuccesses + batch.deliveryFailures;
  state.windowAttempts += attempts;
  state.windowSuccesses += batch.deliverySuccesses;
  state.windowFailures += batch.deliveryFailures;
  state.windowRetryDeliveries += batch.retryDeliveries;
  state.totalAttempts += attempts;
  state.totalSuccesses += batch.deliverySuccesses;
  state.totalFailures += batch.deliveryFailures;
  state.totalRetryDeliveries += batch.retryDeliveries;

  const snapshot = snapshotMetrics(state);
  const successRateAlertTriggered =
    !state.successRateAlerted &&
    state.windowAttempts >= options.minSamples &&
    snapshot.webhook_success_rate < options.minSuccessRate;
  const retryRateAlertTriggered =
    !state.retryRateAlerted &&
    state.windowAttempts >= options.minSamples &&
    snapshot.webhook_retry_rate > options.maxRetryRate;

  if (successRateAlertTriggered) {
    state.successRateAlerted = true;
  }
  if (retryRateAlertTriggered) {
    state.retryRateAlerted = true;
  }

  return {
    snapshot,
    successRateAlertTriggered,
    retryRateAlertTriggered
  };
}

export function renderPrometheusMetrics(state: WebhookMetricsState): string {
  const snapshot = snapshotMetrics(state);
  const lines: string[] = [];
  lines.push("# HELP webhook_success_rate Current success rate in the active metrics window.");
  lines.push("# TYPE webhook_success_rate gauge");
  lines.push(`webhook_success_rate ${snapshot.webhook_success_rate}`);

  lines.push("# HELP webhook_retry_total Retry deliveries in the active metrics window.");
  lines.push("# TYPE webhook_retry_total gauge");
  lines.push(`webhook_retry_total ${snapshot.webhook_retry_total}`);

  lines.push("# HELP webhook_retry_rate Current retry rate in the active metrics window.");
  lines.push("# TYPE webhook_retry_rate gauge");
  lines.push(`webhook_retry_rate ${snapshot.webhook_retry_rate}`);

  lines.push("# HELP webhook_dispatch_attempts_total Total delivery attempts since process start.");
  lines.push("# TYPE webhook_dispatch_attempts_total counter");
  lines.push(`webhook_dispatch_attempts_total ${snapshot.totalAttempts}`);

  lines.push("# HELP webhook_dispatch_success_total Total successful deliveries since process start.");
  lines.push("# TYPE webhook_dispatch_success_total counter");
  lines.push(`webhook_dispatch_success_total ${snapshot.totalSuccesses}`);

  lines.push("# HELP webhook_dispatch_failure_total Total failed deliveries since process start.");
  lines.push("# TYPE webhook_dispatch_failure_total counter");
  lines.push(`webhook_dispatch_failure_total ${snapshot.totalFailures}`);

  lines.push("# HELP webhook_dispatch_retry_total Total retry deliveries since process start.");
  lines.push("# TYPE webhook_dispatch_retry_total counter");
  lines.push(`webhook_dispatch_retry_total ${snapshot.totalRetryDeliveries}`);

  lines.push("# HELP webhook_dispatch_window_attempts Current window attempts.");
  lines.push("# TYPE webhook_dispatch_window_attempts gauge");
  lines.push(`webhook_dispatch_window_attempts ${snapshot.attempts}`);
  lines.push(`webhook_dispatch_window_successes ${snapshot.successes}`);
  lines.push(`webhook_dispatch_window_failures ${snapshot.failures}`);
  return `${lines.join("\n")}\n`;
}

function ensureWindowFresh(
  state: WebhookMetricsState,
  options: WebhookMetricsAlertOptions,
  nowMs: number
) {
  if (nowMs - state.windowStartedAtMs < options.windowMs) {
    return;
  }

  state.windowStartedAtMs = nowMs;
  state.windowAttempts = 0;
  state.windowSuccesses = 0;
  state.windowFailures = 0;
  state.windowRetryDeliveries = 0;
  state.successRateAlerted = false;
  state.retryRateAlerted = false;
}

function snapshotMetrics(state: WebhookMetricsState): WebhookMetricsSnapshot {
  const attempts = state.windowAttempts;
  return {
    webhook_success_rate: attempts === 0 ? 1 : state.windowSuccesses / attempts,
    webhook_retry_total: state.windowRetryDeliveries,
    webhook_retry_rate: attempts === 0 ? 0 : state.windowRetryDeliveries / attempts,
    attempts,
    successes: state.windowSuccesses,
    failures: state.windowFailures,
    totalAttempts: state.totalAttempts,
    totalSuccesses: state.totalSuccesses,
    totalFailures: state.totalFailures,
    totalRetryDeliveries: state.totalRetryDeliveries
  };
}
