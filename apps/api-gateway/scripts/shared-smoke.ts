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

type TaskStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PREPROCESSING"
  | "DETECTING"
  | "INPAINTING"
  | "PACKAGING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

const STATUS_ORDER: TaskStatus[] = [
  "UPLOADED",
  "QUEUED",
  "PREPROCESSING",
  "DETECTING",
  "INPAINTING",
  "PACKAGING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED"
];

const baseUrl = normalizeBaseUrl(process.env.SHARED_BASE_URL || "http://127.0.0.1:3000");
const username = process.env.SHARED_USERNAME || "admin";
const password = process.env.SHARED_PASSWORD || "admin123";
const authCode = process.env.SHARED_AUTH_CODE || username;

function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }

  return `https://${url.replace(/\/+$/, "")}`;
}

function buildRequestId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  path: string,
  options: {
    method: "GET" | "POST";
    token?: string;
    withRequestId?: boolean;
    idempotencyKey?: string;
    body?: unknown;
  }
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.withRequestId !== false) {
    headers["X-Request-Id"] = buildRequestId("shared");
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function login() {
  const loginResp = await request<{
    accessToken: string;
    refreshToken: string;
    user?: { userId?: string };
  }>("/v1/auth/wechat-login", {
    method: "POST",
    body: {
      code: authCode,
      username,
      password,
      deviceId: "shared_smoke",
      clientVersion: "0.1.0"
    }
  });

  assert(loginResp.status < 500, `登录接口异常，status=${loginResp.status}`);
  const body = loginResp.body as ApiEnvelope<{ accessToken: string }>;
  assert(body.code === 0, `登录失败，code=${body.code} message=${body.message}`);
  assert(body.data?.accessToken, "登录返回缺少 accessToken");

  return body.data.accessToken;
}

async function main() {
  console.log(`[shared-smoke] baseUrl=${baseUrl}`);
  const token = await login();
  console.log("[shared-smoke] login passed");

  const unauthUpload = await request("/v1/assets/upload-policy", {
    method: "POST",
    withRequestId: true,
    body: {
      fileName: "header-check.png",
      fileSize: 1024,
      mediaType: "image",
      mimeType: "image/png"
    }
  });

  assert(unauthUpload.status === 401 || unauthUpload.status === 403, "未鉴权请求未被拦截");
  console.log("[shared-smoke] authorization guard passed");

  const uploadResp = await request<{
    assetId: string;
  }>("/v1/assets/upload-policy", {
    method: "POST",
    token,
    body: {
      fileName: "header-check.png",
      fileSize: 1024,
      mediaType: "image",
      mimeType: "image/png"
    }
  });

  assert(uploadResp.status < 500, `upload-policy 异常，status=${uploadResp.status}`);
  const uploadBody = uploadResp.body as ApiEnvelope<{ assetId: string }>;
  assert(uploadBody.code === 0, `upload-policy 失败，code=${uploadBody.code} message=${uploadBody.message}`);
  assert(uploadBody.requestId, "upload-policy 响应缺少 requestId");
  assert(uploadBody.data?.assetId, "upload-policy 响应缺少 assetId");
  console.log("[shared-smoke] upload-policy passed");

  const createMissingIdem = await request("/v1/tasks", {
    method: "POST",
    token,
    withRequestId: true,
    body: {
      assetId: uploadBody.data.assetId,
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  assert(createMissingIdem.status >= 400, "缺少 Idempotency-Key 未触发错误");
  console.log("[shared-smoke] idempotency required check passed");

  const idemKey = buildRequestId("idem");
  const createTask = await request<{ taskId: string; status: string }>("/v1/tasks", {
    method: "POST",
    token,
    withRequestId: true,
    idempotencyKey: idemKey,
    body: {
      assetId: uploadBody.data.assetId,
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  assert(createTask.status < 500, `create-task 异常，status=${createTask.status}`);
  const createTaskBody = createTask.body as ApiEnvelope<{ taskId: string; status: string }>;
  assert(createTaskBody.code === 0, `create-task 失败，code=${createTaskBody.code} message=${createTaskBody.message}`);
  assert(createTaskBody.requestId, "create-task 响应缺少 requestId");
  assert(createTaskBody.data?.taskId, "create-task 响应缺少 taskId");
  console.log("[shared-smoke] create-task passed");

  const createTaskAgain = await request<{ taskId: string; status: string }>("/v1/tasks", {
    method: "POST",
    token,
    withRequestId: true,
    idempotencyKey: idemKey,
    body: {
      assetId: uploadBody.data.assetId,
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  const createTaskAgainBody = createTaskAgain.body as ApiEnvelope<{ taskId: string }>;
  assert(
    createTaskAgainBody.code === 0 && createTaskAgainBody.data?.taskId === createTaskBody.data.taskId,
    "幂等重复请求未返回同一 taskId"
  );
  console.log("[shared-smoke] idempotent replay passed");

  const listTasks = await request<{ items: Array<{ taskId: string }> }>("/v1/tasks", {
    method: "GET",
    token,
    withRequestId: false
  });

  const listTasksBody = listTasks.body as ApiEnvelope<{ items: Array<{ taskId: string }> }>;
  assert(listTasksBody.code === 0, `list-tasks 失败，code=${listTasksBody.code} message=${listTasksBody.message}`);
  assert(listTasksBody.requestId, "list-tasks 在缺少 X-Request-Id 时未返回服务端 requestId");
  assert(
    Array.isArray(listTasksBody.data?.items) &&
      listTasksBody.data.items.some((item) => item.taskId === createTaskBody.data.taskId),
    "list-tasks 未包含刚创建任务"
  );
  console.log("[shared-smoke] list-tasks and requestId fallback passed");

  const taskFlowIdempotencyKey = buildRequestId("idem_task_flow");
  const createTaskForFlow = await request<{ taskId: string; status: TaskStatus }>("/v1/tasks", {
    method: "POST",
    token,
    idempotencyKey: taskFlowIdempotencyKey,
    body: {
      assetId: uploadBody.data.assetId,
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  assert(createTaskForFlow.status < 500, `create-task(flow) 异常，status=${createTaskForFlow.status}`);
  const createTaskForFlowBody = createTaskForFlow.body as ApiEnvelope<{ taskId: string; status: TaskStatus }>;
  assert(
    createTaskForFlowBody.code === 0 && !!createTaskForFlowBody.data?.taskId,
    `create-task(flow) 失败，code=${createTaskForFlowBody.code} message=${createTaskForFlowBody.message}`
  );
  const flowTaskId = createTaskForFlowBody.data.taskId;

  const resultBeforeMask = await request(`/v1/tasks/${flowTaskId}/result`, {
    method: "GET",
    token
  });
  const resultBeforeMaskBody = resultBeforeMask.body as ApiEnvelope<Record<string, unknown>>;
  assert(
    resultBeforeMask.status === 422 && resultBeforeMaskBody.code === 42201,
    "result 接口在任务未成功前未返回 42201"
  );

  const upsertMaskResp = await request<{ taskId: string; maskId: string; version: number }>(`/v1/tasks/${flowTaskId}/mask`, {
    method: "POST",
    token,
    idempotencyKey: buildRequestId("idem_mask"),
    body: {
      imageWidth: 1920,
      imageHeight: 1080,
      polygons: [
        [
          [120, 120],
          [280, 120],
          [280, 280],
          [120, 280]
        ]
      ],
      brushStrokes: [
        [
          [320, 300],
          [350, 320],
          [380, 340]
        ]
      ],
      version: 0
    }
  });
  const upsertMaskBody = upsertMaskResp.body as ApiEnvelope<{ version: number }>;
  assert(upsertMaskResp.status === 200 && upsertMaskBody.code === 0, "mask 提交失败");
  assert(upsertMaskBody.data.version === 1, `mask 版本异常，期望 v1 实际 v${upsertMaskBody.data.version}`);

  let finalStatus: TaskStatus | undefined;
  let previousStatusOrder = -1;
  let previousProgress = -1;
  const observedStatus: TaskStatus[] = [];
  const pollIntervalMs = Number.parseInt(process.env.SHARED_SMOKE_POLL_INTERVAL_MS || "250", 10);
  const maxPollAttempts = Number.parseInt(process.env.SHARED_SMOKE_MAX_POLL_ATTEMPTS || "20", 10);

  for (let index = 0; index < (Number.isFinite(maxPollAttempts) && maxPollAttempts > 0 ? maxPollAttempts : 20); index += 1) {
    const detailResp = await request<{
      taskId: string;
      status: TaskStatus;
      progress: number;
    }>(`/v1/tasks/${flowTaskId}`, {
      method: "GET",
      token
    });
    const detailBody = detailResp.body as ApiEnvelope<{
      taskId: string;
      status: TaskStatus;
      progress: number;
    }>;
    assert(detailResp.status === 200 && detailBody.code === 0, "task detail 查询失败");

    const currentStatus = detailBody.data.status;
    const currentProgress = detailBody.data.progress;
    const currentOrder = STATUS_ORDER.indexOf(currentStatus);

    assert(currentOrder >= 0, `未知状态字面量: ${currentStatus}`);
    assert(currentOrder >= previousStatusOrder, `状态倒退: ${STATUS_ORDER[previousStatusOrder]} -> ${currentStatus}`);
    assert(currentProgress >= previousProgress, `进度倒退: ${previousProgress} -> ${currentProgress}`);

    observedStatus.push(currentStatus);
    previousStatusOrder = currentOrder;
    previousProgress = currentProgress;

    if (currentStatus === "SUCCEEDED") {
      finalStatus = currentStatus;
      break;
    }

    await sleep(Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : 250);
  }

  assert(finalStatus === "SUCCEEDED", `任务未在预期轮次内成功，状态轨迹=${observedStatus.join(" -> ")}`);

  const resultResp = await request<{
    taskId: string;
    status: TaskStatus;
    resultUrl: string;
    expireAt: string;
  }>(`/v1/tasks/${flowTaskId}/result`, {
    method: "GET",
    token
  });
  const resultBody = resultResp.body as ApiEnvelope<{
    taskId: string;
    status: TaskStatus;
    resultUrl: string;
    expireAt: string;
  }>;
  assert(resultResp.status === 200 && resultBody.code === 0, "result 查询失败");
  assert(resultBody.data.status === "SUCCEEDED", `result 状态错误: ${resultBody.data.status}`);
  assert(typeof resultBody.data.resultUrl === "string" && resultBody.data.resultUrl.length > 0, "resultUrl 为空");

  const expireAtMs = Date.parse(resultBody.data.expireAt);
  assert(Number.isFinite(expireAtMs), "expireAt 非合法时间");
  assert(expireAtMs > Date.now(), "expireAt 未大于当前时间");

  const cancelAfterSuccessResp = await request(`/v1/tasks/${flowTaskId}/cancel`, {
    method: "POST",
    token,
    idempotencyKey: buildRequestId("idem_cancel_after_success")
  });
  const cancelAfterSuccessBody = cancelAfterSuccessResp.body as ApiEnvelope<Record<string, unknown>>;
  assert(
    cancelAfterSuccessResp.status === 422 && cancelAfterSuccessBody.code === 42201,
    `成功态取消未按预期返回 42201，status=${cancelAfterSuccessResp.status} code=${cancelAfterSuccessBody.code} message=${cancelAfterSuccessBody.message}`
  );

  const checkoutResp = await request<{
    orderId: string;
    paymentPayload: { nonceStr: string; timeStamp: string; sign: string };
  }>("/v1/subscriptions/checkout", {
    method: "POST",
    token,
    body: {
      planId: "pro_month",
      channel: "wechat_pay",
      clientReturnUrl: `${baseUrl}/pay/result`
    }
  });
  const checkoutBody = checkoutResp.body as ApiEnvelope<{
    orderId: string;
    paymentPayload: { nonceStr: string; timeStamp: string; sign: string };
  }>;
  assert(checkoutResp.status === 200 && checkoutBody.code === 0, "subscriptions checkout 失败");
  assert(typeof checkoutBody.data?.orderId === "string" && checkoutBody.data.orderId.length > 0, "checkout 缺少 orderId");

  const confirmResp = await request<{
    status: string;
    planId: string;
    effectiveAt: string | null;
    expireAt: string | null;
    autoRenew: boolean;
  }>("/v1/subscriptions/mock-confirm", {
    method: "POST",
    token,
    body: {
      orderId: checkoutBody.data.orderId
    }
  });
  const confirmBody = confirmResp.body as ApiEnvelope<{
    status: string;
    planId: string;
    effectiveAt: string | null;
  }>;
  assert(confirmResp.status === 200 && confirmBody.code === 0, "subscriptions mock-confirm 失败");
  assert(confirmBody.data.status === "ACTIVE", `订阅未生效，status=${confirmBody.data.status}`);

  const usageBeforeResp = await request<{
    quotaTotal: number;
    quotaLeft: number;
    ledgerItems: Array<{ status: string; source: string }>;
  }>("/v1/usage/me", {
    method: "GET",
    token
  });
  const usageBeforeBody = usageBeforeResp.body as ApiEnvelope<{
    quotaTotal: number;
    quotaLeft: number;
    ledgerItems: Array<{ status: string; source: string }>;
  }>;
  assert(usageBeforeResp.status === 200 && usageBeforeBody.code === 0, "usage 查询失败");
  assert(usageBeforeBody.data.quotaTotal >= 300, `订阅配额异常，quotaTotal=${usageBeforeBody.data.quotaTotal}`);

  const quotaTaskResp = await request<{ taskId: string; status: TaskStatus }>("/v1/tasks", {
    method: "POST",
    token,
    idempotencyKey: buildRequestId("idem_quota"),
    body: {
      assetId: uploadBody.data.assetId,
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });
  const quotaTaskBody = quotaTaskResp.body as ApiEnvelope<{ taskId: string }>;
  assert(quotaTaskResp.status === 200 && quotaTaskBody.code === 0, "订阅生效后创建任务失败");
  const quotaTaskId = quotaTaskBody.data.taskId;

  const usageAfterHoldResp = await request<{
    quotaTotal: number;
    quotaLeft: number;
    ledgerItems: Array<{ status: string; source: string }>;
  }>("/v1/usage/me", {
    method: "GET",
    token
  });
  const usageAfterHoldBody = usageAfterHoldResp.body as ApiEnvelope<{
    quotaLeft: number;
    ledgerItems: Array<{ status: string; source: string }>;
  }>;
  assert(usageAfterHoldResp.status === 200 && usageAfterHoldBody.code === 0, "预扣后 usage 查询失败");
  assert(
    usageAfterHoldBody.data.quotaLeft <= usageBeforeBody.data.quotaLeft - 1,
    `预扣后 quotaLeft 未下降，before=${usageBeforeBody.data.quotaLeft} after=${usageAfterHoldBody.data.quotaLeft}`
  );

  const quotaCancelResp = await request<{ taskId: string; status: TaskStatus }>(`/v1/tasks/${quotaTaskId}/cancel`, {
    method: "POST",
    token,
    idempotencyKey: buildRequestId("idem_quota_cancel")
  });
  const quotaCancelBody = quotaCancelResp.body as ApiEnvelope<{ status: TaskStatus }>;
  assert(quotaCancelResp.status === 200 && quotaCancelBody.code === 0, "预扣任务取消失败");

  const usageAfterCancelResp = await request<{
    quotaTotal: number;
    quotaLeft: number;
    ledgerItems: Array<{ status: string; source: string }>;
  }>("/v1/usage/me", {
    method: "GET",
    token
  });
  const usageAfterCancelBody = usageAfterCancelResp.body as ApiEnvelope<{
    quotaLeft: number;
    ledgerItems: Array<{ status: string; source: string }>;
  }>;
  assert(usageAfterCancelResp.status === 200 && usageAfterCancelBody.code === 0, "取消后 usage 查询失败");
  assert(
    usageAfterCancelBody.data.quotaLeft >= usageAfterHoldBody.data.quotaLeft,
    `取消后 quotaLeft 未回升，hold=${usageAfterHoldBody.data.quotaLeft} cancel=${usageAfterCancelBody.data.quotaLeft}`
  );

  console.log("[shared-smoke] INT-006 checks passed");
  console.log("[shared-smoke] INT-004/INT-005 checks passed");
  console.log("[shared-smoke] INT-002/INT-005 checks passed");
}

main().catch((error) => {
  if (error instanceof Error) {
    const details =
      typeof error.cause === "object" && error.cause !== null
        ? JSON.stringify(error.cause)
        : String(error.cause || "");
    console.error("[shared-smoke] failed:", error.message, details);
  } else {
    console.error("[shared-smoke] failed:", error);
  }
  process.exitCode = 1;
});
