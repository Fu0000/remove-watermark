import assert from "node:assert/strict";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  requestId: string;
  data: T;
}

interface LoginPayload {
  accessToken: string;
}

interface CreateTaskData {
  taskId: string;
  status: string;
}

interface TaskDetailData {
  taskId: string;
  status: string;
  progress: number;
  waitReason?: string;
}

const baseUrl = process.env.SHARED_BASE_URL || "http://127.0.0.1:3000";
const pollAttempts = Number.parseInt(process.env.SHARED_SMOKE_MAX_POLL_ATTEMPTS || "60", 10);
const pollIntervalMs = Number.parseInt(process.env.SHARED_SMOKE_POLL_INTERVAL_MS || "500", 10);

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-request-id", `req_media_smoke_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);
  if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });

  const body = (await response.json()) as ApiEnvelope<T>;
  return {
    status: response.status,
    body
  };
}

async function login() {
  const response = await request<LoginPayload>("/v1/auth/wechat-login", {
    method: "POST",
    body: JSON.stringify({
      code: process.env.SHARED_AUTH_CODE || "admin",
      username: process.env.SHARED_USERNAME || "admin",
      password: process.env.SHARED_PASSWORD || "admin123"
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.code, 0);
  return response.body.data.accessToken;
}

async function createTask(token: string, mediaType: "IMAGE" | "VIDEO" | "PDF" | "PPT", assetId: string, idem: string) {
  const response = await request<CreateTaskData>("/v1/tasks", {
    method: "POST",
    token,
    headers: {
      "idempotency-key": idem
    },
    body: JSON.stringify({
      assetId,
      mediaType,
      taskPolicy: "FAST"
    })
  });

  assert.equal(response.status, 200, `create task failed for ${mediaType}`);
  assert.equal(response.body.code, 0, `create task code failed for ${mediaType}`);
  return response.body.data.taskId;
}

async function submitMask(token: string, taskId: string, idem: string) {
  const response = await request<{ version: number }>(`/v1/tasks/${taskId}/mask`, {
    method: "POST",
    token,
    headers: {
      "idempotency-key": idem
    },
    body: JSON.stringify({
      imageWidth: 1280,
      imageHeight: 720,
      polygons: [
        [
          [10, 10],
          [120, 10],
          [120, 80],
          [10, 80]
        ]
      ],
      brushStrokes: [],
      version: 0
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.code, 0);
}

async function submitRegions(token: string, taskId: string, mediaType: "VIDEO" | "PDF" | "PPT", idem: string) {
  const region =
    mediaType === "VIDEO"
      ? {
          frameIndex: 0,
          box_2d: [20, 20, 180, 90]
        }
      : {
          pageIndex: 0,
          box_2d: [20, 20, 180, 90]
        };

  const response = await request<{ version: number }>(`/v1/tasks/${taskId}/regions`, {
    method: "POST",
    token,
    headers: {
      "idempotency-key": idem
    },
    body: JSON.stringify({
      version: 0,
      mediaType,
      schemaVersion: "gemini-box-2d/v1",
      regions: [region]
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.code, 0);
}

async function waitUntilDone(token: string, taskId: string) {
  let status = "QUEUED";
  for (let i = 0; i < pollAttempts; i += 1) {
    const detail = await request<TaskDetailData>(`/v1/tasks/${taskId}`, {
      method: "GET",
      token
    });
    assert.equal(detail.status, 200);
    status = detail.body.data.status;

    if (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED") {
      return status;
    }

    await sleep(pollIntervalMs);
  }

  return status;
}

async function readResult(token: string, taskId: string) {
  const response = await request<{ resultUrl: string; artifacts?: unknown[] }>(`/v1/tasks/${taskId}/result`, {
    method: "GET",
    token
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.code, 0);
  assert.equal(typeof response.body.data.resultUrl, "string");
}

async function main() {
  const token = await login();
  const mediaCases: Array<{ mediaType: "IMAGE" | "VIDEO" | "PDF" | "PPT"; assetId: string }> = [
    { mediaType: "IMAGE", assetId: "ast_smoke_img_1001" },
    { mediaType: "VIDEO", assetId: "ast_smoke_video_1001" },
    { mediaType: "PDF", assetId: "ast_smoke_pdf_1001" },
    { mediaType: "PPT", assetId: "ast_smoke_ppt_1001" }
  ];

  for (const item of mediaCases) {
    const prefix = item.mediaType.toLowerCase();
    const taskId = await createTask(token, item.mediaType, item.assetId, `idem_media_smoke_create_${prefix}`);
    if (item.mediaType === "IMAGE") {
      await submitMask(token, taskId, `idem_media_smoke_mask_${prefix}`);
    } else {
      await submitRegions(token, taskId, item.mediaType, `idem_media_smoke_regions_${prefix}`);
    }

    const status = await waitUntilDone(token, taskId);
    assert.equal(status, "SUCCEEDED", `${item.mediaType} task should succeed, got ${status}`);
    await readResult(token, taskId);
  }

  console.log("[shared-smoke-media-matrix] all media smoke checks passed");
}

main().catch((error) => {
  console.error("[shared-smoke-media-matrix] failed", error);
  process.exit(1);
});
