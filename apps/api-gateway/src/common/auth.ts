import { createHmac, timingSafeEqual } from "node:crypto";
import { unauthorized } from "./http-errors";
import { resolveJwtSecret } from "./jwt";

export interface AuthContext {
  userId: string;
  tenantId: string;
  token: string;
}

interface JwtPayload {
  sub?: string;
  userId?: string;
  uid?: string;
  tenantId?: string;
  tid?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
}

const JWT_SEGMENT_SIZE = 3;

export function ensureAuthorization(authHeader: string | undefined, requestId?: string): AuthContext {
  const token = extractBearerToken(authHeader, requestId);
  const parsedJwt = parseJwtPayload(token);

  if (parsedJwt) {
    validateJwt(token, parsedJwt, requestId);
    const userId = normalizeUserId(parsedJwt.payload.sub || parsedJwt.payload.userId || parsedJwt.payload.uid);
    if (!userId) {
      unauthorized(40101, "鉴权失败", requestId);
    }
    const tenantId = normalizeUserId(parsedJwt.payload.tenantId || parsedJwt.payload.tid) || userId;
    return {
      userId,
      tenantId,
      token
    };
  }

  const allowLegacy = parseBoolEnv(process.env.AUTH_ALLOW_LEGACY_BEARER, false);
  if (!allowLegacy) {
    unauthorized(40101, "鉴权失败", requestId);
  }

  return {
    userId: resolveLegacyUserId(token, requestId),
    tenantId: resolveLegacyTenantId(token, requestId),
    token
  };
}

function extractBearerToken(authHeader: string | undefined, requestId?: string): string {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    unauthorized(40101, "鉴权失败", requestId);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    unauthorized(40101, "鉴权失败", requestId);
  }
  return token;
}

function parseJwtPayload(token: string): { header: Record<string, unknown>; payload: JwtPayload } | undefined {
  const segments = token.split(".");
  if (segments.length !== JWT_SEGMENT_SIZE) {
    return undefined;
  }

  try {
    const headerRaw = Buffer.from(base64UrlToBase64(segments[0]), "base64").toString("utf8");
    const payloadRaw = Buffer.from(base64UrlToBase64(segments[1]), "base64").toString("utf8");
    const header = JSON.parse(headerRaw) as Record<string, unknown>;
    const payload = JSON.parse(payloadRaw) as JwtPayload;
    return { header, payload };
  } catch {
    return undefined;
  }
}

function validateJwt(token: string, parsed: { header: Record<string, unknown>; payload: JwtPayload }, requestId?: string) {
  const tokenSegments = token.split(".");
  if (tokenSegments.length !== JWT_SEGMENT_SIZE) {
    unauthorized(40101, "鉴权失败", requestId);
  }

  const algorithm = typeof parsed.header.alg === "string" ? parsed.header.alg : "";
  const allowedAlgorithms = (process.env.AUTH_JWT_ALGORITHMS || "HS256")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowedAlgorithms.includes(algorithm)) {
    unauthorized(40101, "鉴权失败", requestId);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof parsed.payload.nbf === "number" && nowSeconds < parsed.payload.nbf) {
    unauthorized(40101, "鉴权失败", requestId);
  }
  if (typeof parsed.payload.exp === "number" && nowSeconds >= parsed.payload.exp) {
    unauthorized(40101, "鉴权失败", requestId);
  }

  const requiredIssuer = (process.env.AUTH_JWT_ISSUER || "").trim();
  if (requiredIssuer && parsed.payload.iss !== requiredIssuer) {
    unauthorized(40101, "鉴权失败", requestId);
  }

  const requiredAudience = (process.env.AUTH_JWT_AUDIENCE || "").trim();
  if (requiredAudience) {
    const audiences = Array.isArray(parsed.payload.aud)
      ? parsed.payload.aud
      : parsed.payload.aud
        ? [parsed.payload.aud]
        : [];
    if (!audiences.includes(requiredAudience)) {
      unauthorized(40101, "鉴权失败", requestId);
    }
  }

  const secret = resolveJwtSecret();
  if (!secret) {
    const allowUnsigned = parseBoolEnv(process.env.AUTH_ALLOW_UNSIGNED_JWT, false);
    if (!allowUnsigned) {
      unauthorized(40101, "鉴权失败", requestId);
    }
    return;
  }

  if (algorithm !== "HS256") {
    unauthorized(40101, "鉴权失败", requestId);
  }

  const signingInput = `${tokenSegments[0]}.${tokenSegments[1]}`;
  const expectedSignature = base64ToBase64Url(createHmac("sha256", secret).update(signingInput).digest("base64"));
  const actualSignature = tokenSegments[2] || "";
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(actualSignature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    unauthorized(40101, "鉴权失败", requestId);
  }
}

function resolveLegacyUserId(token: string, requestId?: string): string {
  if (token.startsWith("user:")) {
    const userId = normalizeUserId(token.slice("user:".length));
    if (userId) {
      return userId;
    }
  }

  if (token.startsWith("tenant:")) {
    const parts = token.split(":");
    const userId = normalizeUserId(parts[2]);
    if (userId) {
      return userId;
    }
  }

  const fallbackUserId = normalizeUserId(process.env.AUTH_LEGACY_DEFAULT_USER_ID);
  if (fallbackUserId) {
    return fallbackUserId;
  }

  unauthorized(40101, "鉴权失败", requestId);
}

function resolveLegacyTenantId(token: string, requestId?: string): string {
  if (token.startsWith("tenant:")) {
    const parts = token.split(":");
    const normalized = normalizeUserId(parts[1]);
    if (normalized) {
      return normalized;
    }
  }

  const fallbackTenantId = normalizeUserId(process.env.AUTH_LEGACY_DEFAULT_TENANT_ID);
  if (fallbackTenantId) {
    return fallbackTenantId;
  }

  return resolveLegacyUserId(token, requestId);
}

function normalizeUserId(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function base64UrlToBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 0) {
    return normalized;
  }
  return normalized + "=".repeat(4 - remainder);
}

function base64ToBase64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
