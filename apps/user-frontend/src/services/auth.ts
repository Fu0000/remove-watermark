import { request } from "./http";

interface WechatLoginRequest {
  code: string;
  username?: string;
  password?: string;
  deviceId?: string;
  clientVersion?: string;
}

interface WechatLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    userId: string;
    planId: string;
    quotaLeft: number;
  };
}

export function wechatLogin(payload: WechatLoginRequest) {
  return request<WechatLoginResponse>("/v1/auth/wechat-login", {
    method: "POST",
    requireAuth: false,
    data: {
      code: payload.code,
      username: payload.username,
      password: payload.password,
      deviceId: payload.deviceId || "dev_user_frontend",
      clientVersion: payload.clientVersion || "0.1.0"
    }
  });
}
