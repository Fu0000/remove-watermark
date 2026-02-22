import type { NextApiRequest, NextApiResponse } from "next";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  requestId?: string;
  data: T;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
}

const DEFAULT_ADMIN_SECRET = "admin123";
const PROTECTED_RUNTIME_ENV = new Set(["shared", "staging", "prod", "production"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000");
const ADMIN_PROXY_ROLE = process.env.ADMIN_PROXY_ROLE || "admin";
const ADMIN_PROXY_SECRET = process.env.ADMIN_PROXY_SECRET || process.env.ADMIN_RBAC_SECRET || "";
const ADMIN_PROXY_AUTH_CODE = process.env.ADMIN_PROXY_AUTH_CODE || process.env.NEXT_PUBLIC_SHARED_AUTH_CODE || "admin";
const ADMIN_PROXY_USERNAME = process.env.ADMIN_PROXY_USERNAME || process.env.NEXT_PUBLIC_SHARED_USERNAME || "admin";
const ADMIN_PROXY_PASSWORD = process.env.ADMIN_PROXY_PASSWORD || process.env.NEXT_PUBLIC_SHARED_PASSWORD || "admin123";

let accessTokenCache: { token: string; expiresAt: number } | undefined;
let accessTokenInFlight: Promise<string> | undefined;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.method || !ALLOWED_METHODS.has(req.method)) {
    res.status(405).json({
      code: 40501,
      message: "method not allowed",
      requestId: buildRequestId("adm_proxy"),
      data: null
    });
    return;
  }

  try {
    assertAdminProxyConfig();
  } catch (error) {
    res.status(500).json({
      code: 50001,
      message: error instanceof Error ? error.message : "admin proxy configuration invalid",
      requestId: buildRequestId("adm_proxy"),
      data: null
    });
    return;
  }

  const upstreamUrl = buildUpstreamAdminUrl(req);
  const requestId = readHeader(req.headers["x-request-id"]) || buildRequestId("adm_proxy");
  const idempotencyKey = readHeader(req.headers["idempotency-key"]);

  try {
    const accessToken = await ensureAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Request-Id": requestId,
      "X-Admin-Role": ADMIN_PROXY_ROLE,
      "X-Admin-Secret": ADMIN_PROXY_SECRET
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: hasBody(req.method) ? JSON.stringify(req.body || {}) : undefined
    });

    const payload = (await safeJson(upstream)) as ApiEnvelope<unknown> | undefined;
    if (!payload) {
      res.status(upstream.status).json({
        code: 50001,
        message: "upstream response is not json",
        requestId,
        data: null
      });
      return;
    }

    res.status(upstream.status).json(payload);
  } catch (error) {
    res.status(502).json({
      code: 50001,
      message: error instanceof Error ? error.message : "admin proxy request failed",
      requestId,
      data: null
    });
  }
}

function assertAdminProxyConfig() {
  const runtimeEnv = resolveRuntimeEnv();
  const apiHost = new URL(API_BASE_URL).hostname;
  const isLocalTarget = apiHost === "127.0.0.1" || apiHost === "localhost";

  if (!isLocalTarget && (!ADMIN_PROXY_SECRET || ADMIN_PROXY_SECRET === DEFAULT_ADMIN_SECRET)) {
    throw new Error("ADMIN_PROXY_SECRET must be configured with a non-default value for non-local API targets");
  }

  if (PROTECTED_RUNTIME_ENV.has(runtimeEnv) && (!ADMIN_PROXY_SECRET || ADMIN_PROXY_SECRET === DEFAULT_ADMIN_SECRET)) {
    throw new Error(`ADMIN_PROXY_SECRET must be non-default in ${runtimeEnv} environment`);
  }
}

async function ensureAccessToken() {
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now + 10_000) {
    return accessTokenCache.token;
  }

  if (accessTokenInFlight) {
    return accessTokenInFlight;
  }

  accessTokenInFlight = fetchAccessToken();
  try {
    const token = await accessTokenInFlight;
    return token;
  } finally {
    accessTokenInFlight = undefined;
  }
}

async function fetchAccessToken() {
  const requestId = buildRequestId("adm_login_proxy");
  const response = await fetch(`${API_BASE_URL}/v1/auth/wechat-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId
    },
    body: JSON.stringify({
      code: ADMIN_PROXY_AUTH_CODE,
      username: ADMIN_PROXY_USERNAME,
      password: ADMIN_PROXY_PASSWORD,
      deviceId: "admin_console_proxy",
      clientVersion: "0.1.0"
    })
  });

  const envelope = (await safeJson(response)) as ApiEnvelope<LoginResponse> | undefined;
  if (!response.ok || !envelope || envelope.code !== 0 || !envelope.data.accessToken) {
    throw new Error(`admin proxy login failed: status=${response.status}`);
  }

  accessTokenCache = {
    token: envelope.data.accessToken,
    expiresAt: Date.now() + Math.max(30, envelope.data.expiresIn - 30) * 1000
  };
  return envelope.data.accessToken;
}

function buildUpstreamAdminUrl(req: NextApiRequest) {
  const pathSegments = normalizePathSegments(req.query.path);
  const url = new URL(`/admin/${pathSegments.join("/")}`, `${API_BASE_URL}/`);

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === "path") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
      return;
    }
    if (typeof value === "string") {
      url.searchParams.append(key, value);
    }
  });

  return url.toString();
}

function normalizePathSegments(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item.length > 0).map((item) => encodeURIComponent(item));
  }
  return [encodeURIComponent(value)];
}

function buildRequestId(prefix = "adm_proxy") {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

function resolveRuntimeEnv() {
  return (process.env.APP_ENV || process.env.NODE_ENV || "dev").toLowerCase();
}

function hasBody(method: string) {
  return method === "POST" || method === "PATCH" || method === "DELETE";
}

function readHeader(header: string | string[] | undefined) {
  if (!header) {
    return undefined;
  }
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }

  return `https://${url.replace(/\/+$/, "")}`;
}
