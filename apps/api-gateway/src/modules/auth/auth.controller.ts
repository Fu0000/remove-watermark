import { Body, Controller, Headers, Post } from "@nestjs/common";
import { badRequest } from "../../common/http-errors";
import { ok } from "../../common/http-response";

interface WechatLoginRequest {
  code: string;
  deviceId?: string;
  clientVersion?: string;
}

interface RefreshRequest {
  refreshToken: string;
}

@Controller("v1/auth")
export class AuthController {
  @Post("wechat-login")
  wechatLogin(@Body() body: WechatLoginRequest, @Headers("x-request-id") requestIdHeader?: string) {
    if (!body.code) {
      badRequest(40001, "参数非法：code 必填", requestIdHeader);
    }

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
  refreshToken(@Body() body: RefreshRequest, @Headers("x-request-id") requestIdHeader?: string) {
    if (!body.refreshToken) {
      badRequest(40001, "参数非法：refreshToken 必填", requestIdHeader);
    }

    return ok(
      {
        accessToken: `jwt_${crypto.randomUUID()}`,
        expiresIn: 7200
      },
      requestIdHeader
    );
  }
}
