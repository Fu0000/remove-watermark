import { expect, test } from "@playwright/test";

type ApiEnvelope<T> = {
  code: number;
  message: string;
  requestId?: string;
  data: T;
};

const apiBaseUrl = process.env.ADMIN_E2E_API_BASE_URL || "http://127.0.0.1:3000";
const username = process.env.ADMIN_E2E_USERNAME || "admin";
const password = process.env.ADMIN_E2E_PASSWORD || "admin123";
const authCode = process.env.ADMIN_E2E_AUTH_CODE || "admin";

interface SeededDelivery {
  userId: string;
  endpointId: string;
  deliveryId: string;
}

test("webhook page should enforce context and support retry interaction", async ({ page }) => {
  const seeded = await seedFailedDelivery();

  await page.goto("/webhooks");
  await expect(page.getByText("Webhook 运维（投递查询 + 重试）")).toBeVisible();
  await expect(page.getByText("请先选择运营上下文（用户或租户）并填写上下文 ID。")).toBeVisible();

  await page.getByPlaceholder("userId").fill(seeded.userId);
  await page.getByPlaceholder("endpointId").fill(seeded.endpointId);
  await page.getByRole("button", { name: /查\s*询/ }).click();

  const row = page.locator("tr", { hasText: seeded.deliveryId });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "重试投递" }).click();

  await expect(page.locator(".ant-modal-confirm-title", { hasText: "确认重试投递" })).toBeVisible();
  await page.getByRole("button", { name: "确认重试" }).click();

  await expect(page.getByText("已触发重试：")).toBeVisible();
});

async function seedFailedDelivery(): Promise<SeededDelivery> {
  const login = await apiRequest<{ accessToken: string; user: { userId: string } }>("/v1/auth/wechat-login", {
    method: "POST",
    body: {
      code: authCode,
      username,
      password,
      deviceId: "pw_fe008",
      clientVersion: "0.1.0"
    }
  });

  if (login.status >= 300 || login.body.code !== 0) {
    throw new Error(`login failed: status=${login.status} code=${login.body.code}`);
  }
  const token = login.body.data.accessToken;
  const userId = login.body.data.user.userId;
  const tenantId = `t_pw_fe008_${Date.now()}`;

  const createEndpoint = await apiRequest<{ endpointId: string }>("/v1/webhooks/endpoints", {
    method: "POST",
    token,
    headers: {
      "X-Tenant-Id": tenantId
    },
    body: {
      name: `pw-fe008-${Date.now()}`,
      url: "https://client.example.com/fail",
      events: ["task.succeeded", "task.failed"],
      timeoutMs: 5000,
      maxRetries: 2
    }
  });
  if (createEndpoint.status >= 300 || createEndpoint.body.code !== 0) {
    throw new Error("create webhook endpoint failed");
  }

  const endpointId = createEndpoint.body.data.endpointId;
  const testDelivery = await apiRequest<{ deliveryId: string }>(`/v1/webhooks/endpoints/${endpointId}/test`, {
    method: "POST",
    token
  });
  if (testDelivery.status >= 300 || testDelivery.body.code !== 0) {
    throw new Error("create test delivery failed");
  }

  const patchEndpoint = await apiRequest<{ endpointId: string }>(`/v1/webhooks/endpoints/${endpointId}`, {
    method: "PATCH",
    token,
    body: {
      url: "https://client.example.com/callback",
      status: "ACTIVE"
    }
  });
  if (patchEndpoint.status >= 300 || patchEndpoint.body.code !== 0) {
    throw new Error("patch webhook endpoint failed");
  }

  return {
    userId,
    endpointId,
    deliveryId: testDelivery.body.data.deliveryId
  };
}

async function apiRequest<T>(
  path: string,
  input: {
    method: "GET" | "POST" | "PATCH";
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<{ status: number; body: ApiEnvelope<T> }> {
  const headers: Record<string, string> = {
    "X-Request-Id": `pw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  };

  if (input.token) {
    headers.Authorization = `Bearer ${input.token}`;
  }
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (input.headers) {
    Object.assign(headers, input.headers);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });

  const json = (await response.json()) as ApiEnvelope<T>;
  return {
    status: response.status,
    body: json
  };
}
