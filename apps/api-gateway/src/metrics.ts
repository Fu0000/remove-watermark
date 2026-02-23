export interface ApiMetricsState {
  startedAtMs: number;
  requestsInFlight: number;
  requestCount: Map<string, number>;
  requestDurationMsSum: Map<string, number>;
  requestDurationMsCount: Map<string, number>;
  request5xxCount: Map<string, number>;
}

export interface ApiRequestObservation {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

function escapeLabelValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function normalizeMethod(method: string) {
  const trimmed = method.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : "UNKNOWN";
}

function normalizeRoute(route: string) {
  const trimmed = route.trim();
  return trimmed.length > 0 ? trimmed : "/";
}

function normalizeStatusCode(statusCode: number) {
  if (!Number.isFinite(statusCode) || statusCode <= 0) {
    return 0;
  }
  return Math.floor(statusCode);
}

function statusClass(statusCode: number) {
  if (statusCode >= 100 && statusCode < 600) {
    return `${Math.floor(statusCode / 100)}xx`;
  }
  return "unknown";
}

function requestKey(method: string, route: string, normalizedStatusClass: string) {
  return `${method}|${route}|${normalizedStatusClass}`;
}

function request5xxKey(method: string, route: string, statusCode: number) {
  return `${method}|${route}|${statusCode}`;
}

export function createApiMetricsState(nowMs = Date.now()): ApiMetricsState {
  return {
    startedAtMs: nowMs,
    requestsInFlight: 0,
    requestCount: new Map(),
    requestDurationMsSum: new Map(),
    requestDurationMsCount: new Map(),
    request5xxCount: new Map()
  };
}

export function beginApiRequest(state: ApiMetricsState) {
  state.requestsInFlight += 1;
}

export function endApiRequest(state: ApiMetricsState) {
  state.requestsInFlight = Math.max(0, state.requestsInFlight - 1);
}

export function observeApiRequest(state: ApiMetricsState, observation: ApiRequestObservation) {
  const method = normalizeMethod(observation.method);
  const route = normalizeRoute(observation.route);
  const code = normalizeStatusCode(observation.statusCode);
  const klass = statusClass(code);
  const key = requestKey(method, route, klass);
  const durationMs = Math.max(0, observation.durationMs);

  state.requestCount.set(key, (state.requestCount.get(key) || 0) + 1);
  state.requestDurationMsSum.set(key, (state.requestDurationMsSum.get(key) || 0) + durationMs);
  state.requestDurationMsCount.set(key, (state.requestDurationMsCount.get(key) || 0) + 1);

  if (code >= 500 && code < 600) {
    const errorKey = request5xxKey(method, route, code);
    state.request5xxCount.set(errorKey, (state.request5xxCount.get(errorKey) || 0) + 1);
  }
}

export function renderPrometheusMetrics(state: ApiMetricsState, nowMs = Date.now()) {
  const lines: string[] = [];

  lines.push("# HELP api_gateway_http_requests_total Total HTTP requests grouped by method, route and status class.");
  lines.push("# TYPE api_gateway_http_requests_total counter");
  for (const [key, value] of state.requestCount.entries()) {
    const [method, route, klass] = key.split("|");
    lines.push(
      `api_gateway_http_requests_total{method="${escapeLabelValue(method)}",route="${escapeLabelValue(route)}",status_class="${escapeLabelValue(klass)}"} ${value}`
    );
  }

  lines.push("# HELP api_gateway_http_request_duration_ms_sum Sum of request durations in milliseconds.");
  lines.push("# TYPE api_gateway_http_request_duration_ms_sum counter");
  for (const [key, value] of state.requestDurationMsSum.entries()) {
    const [method, route, klass] = key.split("|");
    lines.push(
      `api_gateway_http_request_duration_ms_sum{method="${escapeLabelValue(method)}",route="${escapeLabelValue(route)}",status_class="${escapeLabelValue(klass)}"} ${value}`
    );
  }

  lines.push("# HELP api_gateway_http_request_duration_ms_count Number of request duration observations.");
  lines.push("# TYPE api_gateway_http_request_duration_ms_count counter");
  for (const [key, value] of state.requestDurationMsCount.entries()) {
    const [method, route, klass] = key.split("|");
    lines.push(
      `api_gateway_http_request_duration_ms_count{method="${escapeLabelValue(method)}",route="${escapeLabelValue(route)}",status_class="${escapeLabelValue(klass)}"} ${value}`
    );
  }

  lines.push("# HELP api_gateway_http_requests_5xx_total Total HTTP 5xx responses grouped by method, route and status code.");
  lines.push("# TYPE api_gateway_http_requests_5xx_total counter");
  for (const [key, value] of state.request5xxCount.entries()) {
    const [method, route, code] = key.split("|");
    lines.push(
      `api_gateway_http_requests_5xx_total{method="${escapeLabelValue(method)}",route="${escapeLabelValue(route)}",status_code="${escapeLabelValue(code)}"} ${value}`
    );
  }

  lines.push("# HELP api_gateway_http_requests_in_flight Current in-flight HTTP requests.");
  lines.push("# TYPE api_gateway_http_requests_in_flight gauge");
  lines.push(`api_gateway_http_requests_in_flight ${state.requestsInFlight}`);

  lines.push("# HELP api_gateway_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE api_gateway_uptime_seconds gauge");
  lines.push(`api_gateway_uptime_seconds ${Math.max(0, Math.floor((nowMs - state.startedAtMs) / 1000))}`);

  return `${lines.join("\n")}\n`;
}
