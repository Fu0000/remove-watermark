type ApiEnvelope<T> = {
  code: number;
  message: string;
  requestId?: string;
  data: T;
};

interface HttpResult<T> {
  status: number;
  body: ApiEnvelope<T> | Record<string, unknown>;
}

const baseUrl = normalizeBaseUrl(process.env.SHARED_BASE_URL || "http://127.0.0.1:3000");
const username = process.env.SHARED_USERNAME || "admin";
const password = process.env.SHARED_PASSWORD || "admin123";
const authCode = process.env.SHARED_AUTH_CODE || username;
const adminRole = normalizeAdminRole(process.env.SHARED_ADMIN_ROLE || "admin");
const adminRetryRole = normalizeAdminRole(process.env.SHARED_ADMIN_RETRY_ROLE || "operator");
const adminSecret = process.env.SHARED_ADMIN_SECRET || "admin123";

function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }
  return `https://${url.replace(/\/+$/, "")}`;
}

function buildRequestId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeAdminRole(value: string): "admin" | "operator" | "auditor" {
  const role = value.trim().toLowerCase();
  if (role === "admin" || role === "operator" || role === "auditor") {
    return role;
  }
  throw new Error(`invalid admin role: ${value}`);
}

function buildAdminHeaders(role: "admin" | "operator" | "auditor") {
  return {
    "X-Admin-Role": role,
    "X-Admin-Secret": adminSecret
  };
}

async function request<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "PATCH";
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {
    "X-Request-Id": buildRequestId("fe008")
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      headers[key] = value;
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return {
    status: response.status,
    body: body as ApiEnvelope<T> | Record<string, unknown>
  };
}

async function login() {
  const response = await request<{
    accessToken: string;
  }>("/v1/auth/wechat-login", {
    method: "POST",
    body: {
      code: authCode,
      username,
      password,
      deviceId: "fe008_admin_smoke",
      clientVersion: "0.1.0"
    }
  });
  const body = response.body as ApiEnvelope<{ accessToken: string }>;
  assert(response.status < 500, `login status=${response.status}`);
  assert(body.code === 0, `login failed code=${body.code} message=${body.message}`);
  assert(typeof body.data?.accessToken === "string" && body.data.accessToken.length > 0, "missing accessToken");
  return body.data.accessToken;
}

function buildQuery(params: Record<string, string>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }
  return query.toString();
}

async function main() {
  console.log(`[fe008-admin-smoke] baseUrl=${baseUrl}`);
  const token = await login();
  console.log("[fe008-admin-smoke] login passed");

  const tenantA = `t_fe008_a_${Date.now()}`;
  const tenantB = `t_fe008_b_${Date.now()}`;

  const createTenantA = await request<{ endpointId: string }>("/v1/webhooks/endpoints", {
    method: "POST",
    token,
    headers: {
      "X-Tenant-Id": tenantA
    },
    body: {
      name: `fe008-tenant-a-${Date.now()}`,
      url: "https://client.example.com/fail",
      events: ["task.succeeded", "task.failed"],
      timeoutMs: 5000,
      maxRetries: 2
    }
  });
  const createTenantABody = createTenantA.body as ApiEnvelope<{ endpointId: string }>;
  assert(createTenantA.status === 200 && createTenantABody.code === 0, "create tenantA endpoint failed");
  const tenantAEndpointId = createTenantABody.data.endpointId;

  const createTenantB = await request<{ endpointId: string }>("/v1/webhooks/endpoints", {
    method: "POST",
    token,
    headers: {
      "X-Tenant-Id": tenantB
    },
    body: {
      name: `fe008-tenant-b-${Date.now()}`,
      url: "https://client.example.com/fail",
      events: ["task.succeeded", "task.failed"],
      timeoutMs: 5000,
      maxRetries: 2
    }
  });
  const createTenantBBody = createTenantB.body as ApiEnvelope<{ endpointId: string }>;
  assert(createTenantB.status === 200 && createTenantBBody.code === 0, "create tenantB endpoint failed");
  const tenantBEndpointId = createTenantBBody.data.endpointId;
  console.log("[fe008-admin-smoke] endpoint create passed");

  const testTenantA = await request<{ deliveryId: string }>(`/v1/webhooks/endpoints/${tenantAEndpointId}/test`, {
    method: "POST",
    token
  });
  const testTenantABody = testTenantA.body as ApiEnvelope<{ deliveryId: string }>;
  assert(testTenantA.status === 200 && testTenantABody.code === 0, "tenantA test delivery failed");
  const tenantADeliveryId = testTenantABody.data.deliveryId;

  const testTenantB = await request<{ deliveryId: string }>(`/v1/webhooks/endpoints/${tenantBEndpointId}/test`, {
    method: "POST",
    token
  });
  const testTenantBBody = testTenantB.body as ApiEnvelope<{ deliveryId: string }>;
  assert(testTenantB.status === 200 && testTenantBBody.code === 0, "tenantB test delivery failed");
  const tenantBDeliveryId = testTenantBBody.data.deliveryId;
  console.log("[fe008-admin-smoke] test delivery passed");

  const missingScopeListResp = await request("/admin/webhooks/deliveries?page=1&pageSize=10", {
    method: "GET",
    token,
    headers: buildAdminHeaders(adminRole)
  });
  const missingScopeListBody = missingScopeListResp.body as ApiEnvelope<Record<string, unknown>>;
  assert(missingScopeListResp.status === 400 && missingScopeListBody.code === 40001, "missing scope list should be 40001");

  const tenantAListQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantA,
    status: "FAILED",
    page: "1",
    pageSize: "50"
  });
  const tenantAFailedResp = await request<{
    items: Array<{ deliveryId: string }>;
  }>(`/admin/webhooks/deliveries?${tenantAListQuery}`, {
    method: "GET",
    token,
    headers: buildAdminHeaders(adminRole)
  });
  const tenantAFailedBody = tenantAFailedResp.body as ApiEnvelope<{
    items: Array<{ deliveryId: string }>;
  }>;
  assert(tenantAFailedResp.status === 200 && tenantAFailedBody.code === 0, "tenantA list failed");
  assert(tenantAFailedBody.data.items.some((item) => item.deliveryId === tenantADeliveryId), "tenantA delivery not found");
  assert(!tenantAFailedBody.data.items.some((item) => item.deliveryId === tenantBDeliveryId), "tenantB delivery leaked");

  const missingScopeRetryResp = await request(`/admin/webhooks/deliveries/${tenantADeliveryId}/retry`, {
    method: "POST",
    token,
    headers: buildAdminHeaders(adminRetryRole)
  });
  const missingScopeRetryBody = missingScopeRetryResp.body as ApiEnvelope<Record<string, unknown>>;
  assert(
    missingScopeRetryResp.status === 400 && missingScopeRetryBody.code === 40001,
    "missing scope retry should be 40001"
  );

  const patchTenantA = await request<{ endpointId: string; status: string }>(`/v1/webhooks/endpoints/${tenantAEndpointId}`, {
    method: "PATCH",
    token,
    body: {
      url: "https://client.example.com/callback",
      status: "ACTIVE"
    }
  });
  const patchTenantABody = patchTenantA.body as ApiEnvelope<{ endpointId: string; status: string }>;
  assert(patchTenantA.status === 200 && patchTenantABody.code === 0, "patch tenantA endpoint failed");

  const retryTenantAQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantA
  });
  const retryTenantAResp = await request<{ deliveryId: string }>(
    `/admin/webhooks/deliveries/${tenantADeliveryId}/retry?${retryTenantAQuery}`,
    {
      method: "POST",
      token,
      headers: buildAdminHeaders(adminRetryRole)
    }
  );
  const retryTenantABody = retryTenantAResp.body as ApiEnvelope<{ deliveryId: string }>;
  assert(retryTenantAResp.status === 200 && retryTenantABody.code === 0, "tenantA retry failed");
  assert(retryTenantABody.data.deliveryId !== tenantADeliveryId, "retry should return new delivery");

  const retryWrongScopeQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantB
  });
  const retryWrongScopeResp = await request(`/admin/webhooks/deliveries/${tenantADeliveryId}/retry?${retryWrongScopeQuery}`, {
    method: "POST",
    token,
    headers: buildAdminHeaders(adminRetryRole)
  });
  const retryWrongScopeBody = retryWrongScopeResp.body as ApiEnvelope<Record<string, unknown>>;
  assert(retryWrongScopeResp.status === 404 && retryWrongScopeBody.code === 40401, "cross-tenant retry should be 40401");

  const tenantASuccessQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantA,
    status: "SUCCESS",
    page: "1",
    pageSize: "50"
  });
  const tenantASuccessResp = await request<{
    items: Array<{ deliveryId: string }>;
  }>(`/admin/webhooks/deliveries?${tenantASuccessQuery}`, {
    method: "GET",
    token,
    headers: buildAdminHeaders(adminRole)
  });
  const tenantASuccessBody = tenantASuccessResp.body as ApiEnvelope<{
    items: Array<{ deliveryId: string }>;
  }>;
  assert(tenantASuccessResp.status === 200 && tenantASuccessBody.code === 0, "tenantA success list failed");
  assert(
    tenantASuccessBody.data.items.some((item) => item.deliveryId === retryTenantABody.data.deliveryId),
    "tenantA retry delivery not found in success list"
  );

  console.log("[fe008-admin-smoke] checks passed");
  console.log(
    JSON.stringify(
      {
        tenantA,
        tenantB,
        tenantAEndpointId,
        tenantBEndpointId,
        tenantADeliveryId,
        tenantBDeliveryId,
        retriedDeliveryId: retryTenantABody.data.deliveryId
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[fe008-admin-smoke] failed:", error.message);
  } else {
    console.error("[fe008-admin-smoke] failed:", String(error));
  }
  process.exitCode = 1;
});
