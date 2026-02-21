import Taro from "@tarojs/taro";
import type { ApiResponse } from "@packages/contracts";
import { buildRequestId } from "@/utils/request-id";
import { API_BASE_URL } from "@/config/runtime";

type TokenAccessor = () => string | undefined;
let tokenAccessor: TokenAccessor = () => undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  requireAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: number
  ) {
    super(message);
  }
}

export function setTokenAccessor(accessor: TokenAccessor) {
  tokenAccessor = accessor;
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const requestId = buildRequestId();
  const method = options.method || "GET";
  const needAuth = options.requireAuth !== false;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    ...(options.headers || {})
  };

  if (needAuth) {
    const token = tokenAccessor();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await Taro.request<ApiResponse<T>>({
    url: `${API_BASE_URL}${url}`,
    method,
    data: options.data,
    header: headers
  });

  const body = response.data;
  if (response.statusCode >= 400) {
    throw new ApiError(body?.message || "request failed", response.statusCode, body?.code || 50001);
  }

  return body;
}
