import assert from "node:assert/strict";
import test from "node:test";
import { createWebhookMetricsState, recordDispatchMetrics } from "./metrics";

test("metrics should trigger success-rate alert once per window", () => {
  const state = createWebhookMetricsState(0);
  const options = {
    windowMs: 600_000,
    minSamples: 2,
    minSuccessRate: 0.9,
    maxRetryRate: 0.5
  };

  const first = recordDispatchMetrics(
    state,
    options,
    {
      scanned: 1,
      published: 0,
      pending: 1,
      dead: 0,
      deliveriesCreated: 2,
      deliverySuccesses: 0,
      deliveryFailures: 2,
      retryDeliveries: 0
    },
    1
  );
  assert.equal(first.successRateAlertTriggered, true);
  assert.equal(first.retryRateAlertTriggered, false);

  const second = recordDispatchMetrics(
    state,
    options,
    {
      scanned: 1,
      published: 0,
      pending: 1,
      dead: 0,
      deliveriesCreated: 1,
      deliverySuccesses: 0,
      deliveryFailures: 1,
      retryDeliveries: 0
    },
    2
  );
  assert.equal(second.successRateAlertTriggered, false);
});

test("metrics should trigger retry-rate alert", () => {
  const state = createWebhookMetricsState(0);
  const options = {
    windowMs: 600_000,
    minSamples: 2,
    minSuccessRate: 0.1,
    maxRetryRate: 0.3
  };

  const result = recordDispatchMetrics(
    state,
    options,
    {
      scanned: 1,
      published: 1,
      pending: 0,
      dead: 0,
      deliveriesCreated: 2,
      deliverySuccesses: 1,
      deliveryFailures: 1,
      retryDeliveries: 2
    },
    1
  );

  assert.equal(result.retryRateAlertTriggered, true);
  assert.equal(result.snapshot.webhook_retry_total, 2);
  assert.equal(result.snapshot.webhook_retry_rate, 1);
});

test("metrics window should reset after ttl", () => {
  const state = createWebhookMetricsState(0);
  const options = {
    windowMs: 10,
    minSamples: 2,
    minSuccessRate: 0.9,
    maxRetryRate: 0.2
  };

  recordDispatchMetrics(
    state,
    options,
    {
      scanned: 1,
      published: 0,
      pending: 1,
      dead: 0,
      deliveriesCreated: 2,
      deliverySuccesses: 0,
      deliveryFailures: 2,
      retryDeliveries: 0
    },
    1
  );
  const reset = recordDispatchMetrics(
    state,
    options,
    {
      scanned: 1,
      published: 1,
      pending: 0,
      dead: 0,
      deliveriesCreated: 1,
      deliverySuccesses: 1,
      deliveryFailures: 0,
      retryDeliveries: 0
    },
    30
  );

  assert.equal(reset.snapshot.attempts, 1);
  assert.equal(reset.snapshot.webhook_success_rate, 1);
  assert.equal(reset.successRateAlertTriggered, false);
});
