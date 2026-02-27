import { request } from "./http";

export interface AuthUser {
  userId: string;
  phone?: string;
  displayName?: string | null;
  planId: string;
  quotaLeft: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** 手机号 + 密码 登录 */
export function login(phone: string, password: string) {
  return request<AuthResponse>("/v1/auth/login", {
    method: "POST",
    requireAuth: false,
    data: { phone, password }
  });
}

/** 邀请码 + 手机号 + 密码 注册 */
export function register(inviteCode: string, phone: string, password: string, displayName?: string) {
  return request<AuthResponse>("/v1/auth/register", {
    method: "POST",
    requireAuth: false,
    data: { inviteCode, phone, password, displayName }
  });
}

/** 微信登录 (mock，预留接口) */
export function wechatLogin(payload: { code: string; deviceId?: string; clientVersion?: string }) {
  return request<AuthResponse>("/v1/auth/wechat-login", {
    method: "POST",
    requireAuth: false,
    data: {
      code: payload.code,
      deviceId: payload.deviceId || "dev_user_frontend",
      clientVersion: payload.clientVersion || "0.1.0"
    }
  });
}
