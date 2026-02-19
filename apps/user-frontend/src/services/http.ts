import type { ApiResponse } from "@packages/contracts";

export async function request<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const requestId = crypto.randomUUID();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(init?.headers || {})
    }
  });

  return response.json() as Promise<ApiResponse<T>>;
}
