import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ok } from "../../common/http-response";
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

    return ok(
      {
        accessToken: `jwt_${crypto.randomUUID()}`,
        refreshToken: `rft_${crypto.randomUUID()}`,
        expiresIn: 7200,
        user: {
          userId: "u_1001",
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
    const body = parseRequestBody(RefreshRequestSchema, rawBody, requestIdHeader);

    return ok(
      {
        accessToken: `jwt_${crypto.randomUUID()}`,
        expiresIn: 7200
      },
      requestIdHeader
    );
  }
}
