interface ApiEnvelope<T> {
  code: number;
  message: string;
  requestId?: string;
  data: T;
}

interface LoginResponse {
  accessToken: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  data?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
  requireAuth?: boolean;
}

const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000");
const SHARED_AUTH_CODE = process.env.NEXT_PUBLIC_SHARED_AUTH_CODE || "admin";
const SHARED_USERNAME = process.env.NEXT_PUBLIC_SHARED_USERNAME || "admin";
const SHARED_PASSWORD = process.env.NEXT_PUBLIC_SHARED_PASSWORD || "admin123";

let accessTokenCache: string | undefined;
let accessTokenInFlight: Promise<string> | undefined;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: number,
    public readonly requestId?: string
  ) {
    super(message);
  }
}

export function buildRequestId(prefix = "adm_req") {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

export function buildIdempotencyKey(prefix = "adm_idem") {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || "GET";
  const requestId = buildRequestId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    ...(options.headers || {})
  };
  const useAdminProxy = isAdminPath(path);

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  if (!useAdminProxy && options.requireAuth !== false) {
    const accessToken = await ensureAccessToken();
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    useAdminProxy ? buildAdminProxyUrl(path, options.query) : buildRequestUrl(path, options.query),
    {
      method,
      headers,
      body: options.data === undefined ? undefined : JSON.stringify(options.data)
    }
  );

  const envelope = (await safeJson(response)) as ApiEnvelope<T> | undefined;
  const code = envelope?.code ?? 50001;
  const message = envelope?.message || `request failed: ${response.status}`;
  const responseRequestId = envelope?.requestId || requestId;

  if (!response.ok || code !== 0 || envelope?.data === undefined) {
    throw new ApiError(message, response.status, code, responseRequestId);
  }

  return envelope.data;
}

async function ensureAccessToken(): Promise<string> {
  if (accessTokenCache) {
    return accessTokenCache;
  }

  if (accessTokenInFlight) {
    return accessTokenInFlight;
  }

  accessTokenInFlight = fetchAccessToken();
  try {
    accessTokenCache = await accessTokenInFlight;
    return accessTokenCache;
  } finally {
    accessTokenInFlight = undefined;
  }
}

async function fetchAccessToken() {
  const requestId = buildRequestId("adm_login");
  const response = await fetch(`${API_BASE_URL}/v1/auth/wechat-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId
    },
    body: JSON.stringify({
      code: SHARED_AUTH_CODE,
      username: SHARED_USERNAME,
      password: SHARED_PASSWORD,
      deviceId: "admin_console",
      clientVersion: "0.1.0"
    })
  });
  const envelope = (await safeJson(response)) as ApiEnvelope<LoginResponse> | undefined;
  const code = envelope?.code ?? 50001;
  if (!response.ok || code !== 0 || !envelope?.data?.accessToken) {
    throw new ApiError(
      envelope?.message || `login failed: ${response.status}`,
      response.status,
      code,
      envelope?.requestId || requestId
    );
  }

  return envelope.data.accessToken;
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

function buildRequestUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(path, `${API_BASE_URL}/`);
  appendQuery(url, query);
  return url.toString();
}

function buildAdminProxyUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(`/api${path}`, "http://localhost");
  appendQuery(url, query);
  return `${url.pathname}${url.search}`;
}

function appendQuery(url: URL, query?: Record<string, string | number | undefined>) {
  if (!query) {
    return;
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
}

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}
