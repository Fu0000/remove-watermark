import { createHmac } from "node:crypto";

type ApiEnvelope<T> = {
  code: number;
  message: string;
  requestId?: string;
  data: T;
};

const baseUrl = normalizeBaseUrl(process.env.INT006_BASE_URL || process.env.SHARED_BASE_URL || "http://127.0.0.1:3000");
const username = process.env.INT006_USERNAME || process.env.SHARED_USERNAME || "admin";
const password = process.env.INT006_PASSWORD || process.env.SHARED_PASSWORD || "admin123";
const authCode = process.env.INT006_AUTH_CODE || process.env.SHARED_AUTH_CODE || username;
const paymentCallbackSecret =
  process.env.INT006_PAYMENT_CALLBACK_SECRET || process.env.SHARED_PAYMENT_CALLBACK_SECRET || "payment-local-secret";

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

async function request<T>(
  path: string,
  options: {
    method: "GET" | "POST";
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
) {
  const headers: Record<string, string> = {
    "X-Request-Id": buildRequestId("int006")
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
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
    body: body as ApiEnvelope<T>
  };
}

function signPaymentCallback(input: {
  timestamp: string;
  eventId: string;
  orderId: string;
  paymentStatus: "PAID" | "REFUNDED";
}) {
  const payload = `${input.timestamp}.${input.eventId}.${input.orderId}.${input.paymentStatus}`;
  const digest = createHmac("sha256", paymentCallbackSecret).update(payload).digest("hex");
  return `v1=${digest}`;
}

async function triggerPaymentCallback(
  orderId: string,
  paymentStatus: "PAID" | "REFUNDED",
  extra?: { paidAt?: string; refundedAt?: string; refundReason?: string; providerTradeNo?: string }
) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const eventId = buildRequestId(`gateway_${paymentStatus.toLowerCase()}`);

  const response = await request<{
    status: string;
    planId: string;
    paymentStatus: "PAID" | "REFUNDED";
    applied: boolean;
  }>("/v1/subscriptions/payment-callback", {
    method: "POST",
    headers: {
      "X-Payment-Timestamp": timestamp,
      "X-Payment-Signature": signPaymentCallback({
        timestamp,
        eventId,
        orderId,
        paymentStatus
      })
    },
    body: {
      eventId,
      orderId,
      paymentStatus,
      providerTradeNo: extra?.providerTradeNo,
      paidAt: extra?.paidAt,
      refundedAt: extra?.refundedAt,
      refundReason: extra?.refundReason
    }
  });

  return response;
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
      deviceId: "int006_local_callback",
      clientVersion: "0.1.0"
    }
  });

  assert(response.status < 500, `登录失败 status=${response.status}`);
  assert(response.body.code === 0, `登录失败 code=${response.body.code}`);
  assert(typeof response.body.data.accessToken === "string", "登录返回缺少 accessToken");
  return response.body.data.accessToken;
}

async function main() {
  console.log(`[int006-local] baseUrl=${baseUrl}`);

  const token = await login();
  console.log("[int006-local] login passed");

  const checkout = await request<{
    orderId: string;
  }>("/v1/subscriptions/checkout", {
    method: "POST",
    token,
    body: {
      planId: "pro_month",
      channel: "wechat_pay",
      clientReturnUrl: `${baseUrl}/pay/result`
    }
  });
  assert(checkout.status === 200 && checkout.body.code === 0, "checkout failed");
  const orderId = checkout.body.data.orderId;
  assert(typeof orderId === "string" && orderId.length > 0, "checkout missing orderId");
  console.log(`[int006-local] checkout passed orderId=${orderId}`);

  const paid = await triggerPaymentCallback(orderId, "PAID", {
    paidAt: new Date().toISOString(),
    providerTradeNo: buildRequestId("trade_paid")
  });
  assert(paid.status === 200 && paid.body.code === 0, "payment callback(PAID) failed");
  assert(paid.body.data.status === "ACTIVE", `payment callback(PAID) expected ACTIVE got ${paid.body.data.status}`);
  assert(paid.body.data.applied === true, "payment callback(PAID) should apply transition");
  console.log("[int006-local] payment callback(PAID) passed");

  const usageBeforeRefund = await request<{
    quotaTotal: number;
    quotaLeft: number;
  }>("/v1/usage/me", {
    method: "GET",
    token
  });
  assert(usageBeforeRefund.status === 200 && usageBeforeRefund.body.code === 0, "usage before refund failed");
  const quotaTotalBeforeRefund = usageBeforeRefund.body.data.quotaTotal;
  assert(quotaTotalBeforeRefund >= 300, `unexpected quota before refund=${quotaTotalBeforeRefund}`);
  console.log(`[int006-local] usage before refund quotaTotal=${quotaTotalBeforeRefund}`);

  const refunded = await triggerPaymentCallback(orderId, "REFUNDED", {
    refundedAt: new Date().toISOString(),
    refundReason: "local_gateway_smoke",
    providerTradeNo: buildRequestId("trade_refund")
  });
  assert(refunded.status === 200 && refunded.body.code === 0, "payment callback(REFUNDED) failed");
  assert(refunded.body.data.status === "REFUNDED", `refund expected REFUNDED got ${refunded.body.data.status}`);
  console.log("[int006-local] payment callback(REFUNDED) passed");

  const refundedDuplicate = await triggerPaymentCallback(orderId, "REFUNDED", {
    refundedAt: new Date().toISOString(),
    refundReason: "duplicate_refund_callback"
  });
  assert(refundedDuplicate.status === 200 && refundedDuplicate.body.code === 0, "duplicate refund callback failed");
  assert(refundedDuplicate.body.data.applied === false, "duplicate refund callback should be idempotent(applied=false)");
  console.log("[int006-local] duplicate refund callback idempotency passed");

  const mine = await request<{
    status: string;
    planId: string;
  }>("/v1/subscriptions/me", {
    method: "GET",
    token
  });
  assert(mine.status === 200 && mine.body.code === 0, "subscriptions/me failed");
  assert(mine.body.data.status === "REFUNDED", `subscriptions/me expected REFUNDED got ${mine.body.data.status}`);

  const usageAfterRefund = await request<{
    quotaTotal: number;
    quotaLeft: number;
  }>("/v1/usage/me", {
    method: "GET",
    token
  });
  assert(usageAfterRefund.status === 200 && usageAfterRefund.body.code === 0, "usage after refund failed");
  assert(
    usageAfterRefund.body.data.quotaTotal < quotaTotalBeforeRefund,
    `quota rollback failed before=${quotaTotalBeforeRefund} after=${usageAfterRefund.body.data.quotaTotal}`
  );
  console.log(
    `[int006-local] usage rollback passed quotaTotal=${usageAfterRefund.body.data.quotaTotal} quotaLeft=${usageAfterRefund.body.data.quotaLeft}`
  );

  console.log("[int006-local] payment callback + refund rollback checks passed");
}

main().catch((error) => {
  console.error("[int006-local] failed", error);
  process.exit(1);
});
