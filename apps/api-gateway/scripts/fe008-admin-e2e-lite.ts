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

function buildIdempotencyKey(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildAdminHeaders(role: "admin" | "operator" | "auditor") {
  return {
    "X-Admin-Role": role,
    "X-Admin-Secret": adminSecret
  };
}

function toEnvelope<T>(body: ApiEnvelope<T> | Record<string, unknown>) {
  return body as ApiEnvelope<T>;
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) {
      continue;
    }
    query.set(key, value);
  }
  return query.toString();
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
    "X-Request-Id": buildRequestId("fe008_e2e")
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
    user: { userId: string };
  }>("/v1/auth/wechat-login", {
    method: "POST",
    body: {
      code: authCode,
      username,
      password,
      deviceId: "fe008_admin_e2e_lite",
      clientVersion: "0.1.0"
    }
  });

  const body = toEnvelope<{ accessToken: string; user: { userId: string } }>(response.body);
  assert(response.status < 500, `login status=${response.status}`);
  assert(body.code === 0, `login failed code=${body.code} message=${body.message}`);
  assert(typeof body.data?.accessToken === "string" && body.data.accessToken.length > 0, "missing accessToken");
  assert(typeof body.data?.user?.userId === "string", "missing userId");
  return body.data;
}

async function main() {
  console.log(`[fe008-admin-e2e-lite] baseUrl=${baseUrl}`);
  const auth = await login();
  const token = auth.accessToken;
  const userId = auth.user.userId;
  console.log("[fe008-admin-e2e-lite] login passed");

  const taskCreate = await request<{ taskId: string }>("/v1/tasks", {
    method: "POST",
    token,
    headers: {
      "Idempotency-Key": buildIdempotencyKey("fe008_task")
    },
    body: {
      assetId: `ast_fe008_${Date.now()}`,
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });
  const taskCreateBody = toEnvelope<{ taskId: string }>(taskCreate.body);
  assert(taskCreate.status === 200 && taskCreateBody.code === 0, "create task failed");
  const taskId = taskCreateBody.data.taskId;

  const listTasksQuery = buildQuery({
    taskId,
    userId,
    page: "1",
    pageSize: "20"
  });
  const listTasks = await request<{
    items: Array<{ taskId: string; userId: string }>;
  }>(`/admin/tasks?${listTasksQuery}`, {
    method: "GET",
    token,
    headers: buildAdminHeaders("operator")
  });
  const listTasksBody = toEnvelope<{ items: Array<{ taskId: string; userId: string }> }>(listTasks.body);
  assert(listTasks.status === 200 && listTasksBody.code === 0, "admin list tasks failed");
  assert(listTasksBody.data.items.some((item) => item.taskId === taskId), "admin tasks missing created task");
  console.log("[fe008-admin-e2e-lite] admin tasks read passed");

  const replayAuditor = await request(`/admin/tasks/${taskId}/replay`, {
    method: "POST",
    token,
    headers: {
      ...buildAdminHeaders("auditor"),
      "Idempotency-Key": buildIdempotencyKey("fe008_replay_forbidden")
    },
    body: {
      reason: "auditor permission check"
    }
  });
  const replayAuditorBody = toEnvelope<Record<string, unknown>>(replayAuditor.body);
  assert(replayAuditor.status === 403 && replayAuditorBody.code === 40301, "auditor replay should be 40301");

  const replayOperator = await request(`/admin/tasks/${taskId}/replay`, {
    method: "POST",
    token,
    headers: {
      ...buildAdminHeaders("operator"),
      "Idempotency-Key": buildIdempotencyKey("fe008_replay_invalid")
    },
    body: {
      reason: "replay only allowed for failed tasks"
    }
  });
  const replayOperatorBody = toEnvelope<Record<string, unknown>>(replayOperator.body);
  assert(replayOperator.status === 422 && replayOperatorBody.code === 42201, "non-failed replay should be 42201");
  console.log("[fe008-admin-e2e-lite] admin task replay boundary passed");

  const planId = `pro_fe008_${Date.now()}`;
  const createPlan = await request<{ planId: string; isActive: boolean; price: number }>("/admin/plans", {
    method: "POST",
    token,
    headers: buildAdminHeaders("admin"),
    body: {
      planId,
      name: "FE008 Pro Lite",
      price: 4990,
      monthlyQuota: 120,
      sortOrder: 77,
      features: ["image.hd", "video.standard"],
      isActive: true
    }
  });
  const createPlanBody = toEnvelope<{ planId: string; isActive: boolean; price: number }>(createPlan.body);
  assert(createPlan.status === 200 && createPlanBody.code === 0, "admin create plan failed");
  assert(createPlanBody.data.planId === planId, "created planId mismatch");

  const updatePlan = await request<{ planId: string; isActive: boolean; price: number }>(`/admin/plans/${planId}`, {
    method: "PATCH",
    token,
    headers: buildAdminHeaders("admin"),
    body: {
      price: 5990,
      isActive: false
    }
  });
  const updatePlanBody = toEnvelope<{ planId: string; isActive: boolean; price: number }>(updatePlan.body);
  assert(updatePlan.status === 200 && updatePlanBody.code === 0, "admin update plan failed");
  assert(updatePlanBody.data.price === 5990 && updatePlanBody.data.isActive === false, "updated plan fields mismatch");

  const listPlansQuery = buildQuery({
    keyword: planId,
    page: "1",
    pageSize: "20"
  });
  const listPlans = await request<{
    items: Array<{ planId: string; isActive: boolean; price: number }>;
  }>(`/admin/plans?${listPlansQuery}`, {
    method: "GET",
    token,
    headers: buildAdminHeaders("operator")
  });
  const listPlansBody = toEnvelope<{ items: Array<{ planId: string; isActive: boolean; price: number }> }>(listPlans.body);
  assert(listPlans.status === 200 && listPlansBody.code === 0, "admin list plans failed");
  const listedPlan = listPlansBody.data.items.find((item) => item.planId === planId);
  assert(listedPlan, "plan not found after update");
  assert(listedPlan.isActive === false && listedPlan.price === 5990, "plan list view not updated");
  console.log("[fe008-admin-e2e-lite] admin plans rw passed");

  const tenantA = `t_fe008_lite_a_${Date.now()}`;
  const tenantB = `t_fe008_lite_b_${Date.now()}`;
  const createEndpoint = await request<{ endpointId: string }>("/v1/webhooks/endpoints", {
    method: "POST",
    token,
    headers: {
      "X-Tenant-Id": tenantA
    },
    body: {
      name: `fe008-lite-${Date.now()}`,
      url: "https://client.example.com/fail",
      events: ["task.succeeded", "task.failed"],
      timeoutMs: 5000,
      maxRetries: 2
    }
  });
  const createEndpointBody = toEnvelope<{ endpointId: string }>(createEndpoint.body);
  assert(createEndpoint.status === 200 && createEndpointBody.code === 0, "create webhook endpoint failed");
  const endpointId = createEndpointBody.data.endpointId;

  const testDelivery = await request<{ deliveryId: string }>(`/v1/webhooks/endpoints/${endpointId}/test`, {
    method: "POST",
    token
  });
  const testDeliveryBody = toEnvelope<{ deliveryId: string }>(testDelivery.body);
  assert(testDelivery.status === 200 && testDeliveryBody.code === 0, "webhook test delivery failed");
  const deliveryId = testDeliveryBody.data.deliveryId;

  const listMissingScope = await request("/admin/webhooks/deliveries?page=1&pageSize=10", {
    method: "GET",
    token,
    headers: buildAdminHeaders("admin")
  });
  const listMissingScopeBody = toEnvelope<Record<string, unknown>>(listMissingScope.body);
  assert(listMissingScope.status === 400 && listMissingScopeBody.code === 40001, "missing scope should be 40001");

  const listWebhookQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantA,
    endpointId,
    status: "FAILED",
    page: "1",
    pageSize: "50"
  });
  const listWebhook = await request<{
    items: Array<{ deliveryId: string }>;
  }>(`/admin/webhooks/deliveries?${listWebhookQuery}`, {
    method: "GET",
    token,
    headers: buildAdminHeaders("operator")
  });
  const listWebhookBody = toEnvelope<{ items: Array<{ deliveryId: string }> }>(listWebhook.body);
  assert(listWebhook.status === 200 && listWebhookBody.code === 0, "admin list webhook deliveries failed");
  assert(listWebhookBody.data.items.some((item) => item.deliveryId === deliveryId), "delivery not found in tenant scope");

  const patchEndpoint = await request<{ endpointId: string }>(`/v1/webhooks/endpoints/${endpointId}`, {
    method: "PATCH",
    token,
    body: {
      url: "https://client.example.com/callback",
      status: "ACTIVE"
    }
  });
  const patchEndpointBody = toEnvelope<{ endpointId: string }>(patchEndpoint.body);
  assert(patchEndpoint.status === 200 && patchEndpointBody.code === 0, "patch webhook endpoint failed");

  const retryQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantA
  });
  const retryWebhook = await request<{ deliveryId: string }>(`/admin/webhooks/deliveries/${deliveryId}/retry?${retryQuery}`, {
    method: "POST",
    token,
    headers: buildAdminHeaders("operator")
  });
  const retryWebhookBody = toEnvelope<{ deliveryId: string }>(retryWebhook.body);
  assert(retryWebhook.status === 200 && retryWebhookBody.code === 0, "retry webhook failed");
  assert(retryWebhookBody.data.deliveryId !== deliveryId, "retry should return new delivery id");

  const crossRetryQuery = buildQuery({
    scopeType: "tenant",
    scopeId: tenantB
  });
  const retryCrossTenant = await request(`/admin/webhooks/deliveries/${deliveryId}/retry?${crossRetryQuery}`, {
    method: "POST",
    token,
    headers: buildAdminHeaders("operator")
  });
  const retryCrossTenantBody = toEnvelope<Record<string, unknown>>(retryCrossTenant.body);
  assert(retryCrossTenant.status === 404 && retryCrossTenantBody.code === 40401, "cross-tenant retry should be 40401");
  console.log("[fe008-admin-e2e-lite] admin webhooks passed");

  console.log("[fe008-admin-e2e-lite] checks passed");
  console.log(
    JSON.stringify(
      {
        userId,
        taskId,
        planId,
        tenantA,
        endpointId,
        deliveryId,
        retriedDeliveryId: retryWebhookBody.data.deliveryId
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[fe008-admin-e2e-lite] failed:", error.message);
  } else {
    console.error("[fe008-admin-e2e-lite] failed:", String(error));
  }
  process.exitCode = 1;
});
