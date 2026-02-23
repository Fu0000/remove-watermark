import { createHmac } from "node:crypto";

const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 7200;
const DEFAULT_DEV_JWT_SECRET = "dev-jwt-secret-change-me";

interface IssueAccessTokenInput {
  userId: string;
  tenantId: string;
  expiresInSeconds?: number;
}

export function resolveJwtSecret() {
  const configured = normalizeOptionalString(process.env.AUTH_JWT_SECRET);
  if (configured) {
    return configured;
  }

  const allowDevFallback = parseBoolEnv(process.env.AUTH_ALLOW_DEV_JWT_SECRET, process.env.NODE_ENV !== "production");
  if (!allowDevFallback) {
    return undefined;
  }

  return normalizeOptionalString(process.env.AUTH_DEV_JWT_SECRET) || DEFAULT_DEV_JWT_SECRET;
}

export function issueAccessToken(input: IssueAccessTokenInput) {
  const secret = resolveJwtSecret();
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is required when AUTH_ALLOW_DEV_JWT_SECRET is disabled");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS;
  const payload: Record<string, unknown> = {
    sub: input.userId,
    userId: input.userId,
    tenantId: input.tenantId,
    iat: nowSeconds,
    exp: nowSeconds + expiresInSeconds
  };

  const issuer = normalizeOptionalString(process.env.AUTH_JWT_ISSUER);
  if (issuer) {
    payload.iss = issuer;
  }
  const audience = normalizeOptionalString(process.env.AUTH_JWT_AUDIENCE);
  if (audience) {
    payload.aud = audience;
  }

  return signJwtHs256(payload, secret);
}

function signJwtHs256(payload: Record<string, unknown>, secret: string) {
  const encodedHeader = base64ToBase64Url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64"));
  const encodedPayload = base64ToBase64Url(Buffer.from(JSON.stringify(payload)).toString("base64"));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64ToBase64Url(createHmac("sha256", secret).update(signingInput).digest("base64"));
  return `${signingInput}.${signature}`;
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

function normalizeOptionalString(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function base64ToBase64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
