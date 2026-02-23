import { badRequest } from "./http-errors";

export function requireIdempotencyKey(raw: string | undefined, requestId?: string) {
  const value = raw?.trim();
  if (!value) {
    badRequest(40001, "Idempotency-Key is required", requestId);
  }
  return value;
}
