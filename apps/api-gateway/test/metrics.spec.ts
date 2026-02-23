import assert from "node:assert/strict";
import test from "node:test";
import {
  beginApiRequest,
  createApiMetricsState,
  endApiRequest,
  observeApiRequest,
  renderPrometheusMetrics
} from "../src/metrics";

test("api metrics should record request counters and durations", () => {
  const state = createApiMetricsState(0);
  beginApiRequest(state);
  observeApiRequest(state, {
    method: "get",
    route: "/v1/tasks/:taskId",
    statusCode: 200,
    durationMs: 12
  });
  endApiRequest(state);

  assert.equal(state.requestsInFlight, 0);

  const text = renderPrometheusMetrics(state, 2000);
  assert.match(
    text,
    /api_gateway_http_requests_total\{method="GET",route="\/v1\/tasks\/:taskId",status_class="2xx"\} 1/
  );
  assert.match(
    text,
    /api_gateway_http_request_duration_ms_sum\{method="GET",route="\/v1\/tasks\/:taskId",status_class="2xx"\} 12/
  );
  assert.match(text, /api_gateway_uptime_seconds 2/);
});

test("api metrics should record 5xx counters and never go below zero in-flight", () => {
  const state = createApiMetricsState(0);
  endApiRequest(state);
  observeApiRequest(state, {
    method: "POST",
    route: "/v1/tasks",
    statusCode: 504,
    durationMs: 33
  });

  assert.equal(state.requestsInFlight, 0);
  const text = renderPrometheusMetrics(state, 5000);
  assert.match(
    text,
    /api_gateway_http_requests_5xx_total\{method="POST",route="\/v1\/tasks",status_code="504"\} 1/
  );
});
