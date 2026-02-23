import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ok } from "../../common/http-response";
import { issueAccessToken } from "../../common/jwt";
import { parseRequestBody } from "../../common/request-validation";
import { z } from "zod";

interface WechatLoginRequest {
  code: string;
  deviceId?: string;
  clientVersion?: string;
}

interface RefreshRequest {
  refreshToken: string;
}

const WechatLoginRequestSchema = z.object({
  code: z.string().min(1),
  deviceId: z.string().optional(),
  clientVersion: z.string().optional()
});

const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

@Controller("v1/auth")
export class AuthController {
  @Post("wechat-login")
  wechatLogin(@Body() rawBody: WechatLoginRequest, @Headers("x-request-id") requestIdHeader?: string) {
    const body = parseRequestBody(WechatLoginRequestSchema, rawBody, requestIdHeader);
    const userId = resolveMockUserId(body.code);
    const tenantId = resolveMockTenantId(userId);
    const accessToken = issueAccessToken({
      userId,
      tenantId
    });

    return ok(
      {
        accessToken,
        refreshToken: `rft_${crypto.randomUUID()}`,
        expiresIn: 7200,
        user: {
          userId,
          planId: "free",
          quotaLeft: 20,
          deviceId: body.deviceId || "",
          clientVersion: body.clientVersion || ""
        }
      },
      requestIdHeader
    );
  }

  @Post("refresh")
  refreshToken(@Body() rawBody: RefreshRequest, @Headers("x-request-id") requestIdHeader?: string) {
    parseRequestBody(RefreshRequestSchema, rawBody, requestIdHeader);
    const userId = normalizeFallbackId(process.env.AUTH_LEGACY_DEFAULT_USER_ID) || "u_refresh";
    const tenantId = normalizeFallbackId(process.env.AUTH_LEGACY_DEFAULT_TENANT_ID) || userId;
    const accessToken = issueAccessToken({
      userId,
      tenantId
    });

    return ok(
      {
        accessToken,
        expiresIn: 7200
      },
      requestIdHeader
    );
  }
}

function resolveMockUserId(code: string) {
  const normalized = code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!normalized) {
    return `u_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `u_${normalized.slice(0, 24)}`;
}

function resolveMockTenantId(userId: string) {
  return normalizeFallbackId(process.env.AUTH_LEGACY_DEFAULT_TENANT_ID) || userId;
}

function normalizeFallbackId(raw: string | undefined) {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : undefined;
}
