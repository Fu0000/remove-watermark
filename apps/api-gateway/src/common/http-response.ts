export interface ApiEnvelope<T> {
  code: number;
  message: string;
  requestId: string;
  data: T;
}

export function resolveRequestId(requestIdHeader?: string): string {
  return requestIdHeader && requestIdHeader.trim().length > 0
    ? requestIdHeader
    : crypto.randomUUID();
}

export function ok<T>(data: T, requestIdHeader?: string): ApiEnvelope<T> {
  return {
    code: 0,
    message: "ok",
    requestId: resolveRequestId(requestIdHeader),
    data
  };
}
