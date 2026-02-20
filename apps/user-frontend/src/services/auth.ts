import { request } from "./http";

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

export function wechatLogin(code: string) {
  return request<WechatLoginResponse>("/v1/auth/wechat-login", {
    method: "POST",
    requireAuth: false,
    data: {
      code,
      deviceId: "dev_user_frontend",
      clientVersion: "0.1.0"
    }
  });
}
