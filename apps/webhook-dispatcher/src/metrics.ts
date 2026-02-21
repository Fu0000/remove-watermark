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
