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

const baseUrl = normalizeBaseUrl(process.env.SHARED_BASE_URL || "https://chuhaibox.com");
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

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

  console.log("[shared-smoke] INT-002/INT-003 checks passed");
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
