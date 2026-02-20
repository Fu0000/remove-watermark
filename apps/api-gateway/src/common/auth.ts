import { unauthorized } from "./http-errors";

export function ensureAuthorization(authHeader: string | undefined, requestId?: string): void {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    unauthorized(40101, "鉴权失败", requestId);
  }
}
