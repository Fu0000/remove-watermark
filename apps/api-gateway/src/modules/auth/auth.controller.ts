import { Body, Controller, Headers, HttpException, HttpStatus, Post } from "@nestjs/common";
import { ok } from "../../common/http-response";
import { unauthorized, badRequest, conflict, forbidden } from "../../common/http-errors";
import { issueAccessToken } from "../../common/jwt";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as bcrypt from "bcryptjs";

// Module-level singleton — bypasses tsx/esbuild lack of emitDecoratorMetadata
const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────

const WechatLoginRequestSchema = z.object({
  code: z.string().min(1),
  deviceId: z.string().optional(),
  clientVersion: z.string().optional()
});

const LoginRequestSchema = z.object({
  phone: z.string().min(6).max(20),
  password: z.string().min(6).max(64)
});

const RegisterRequestSchema = z.object({
  inviteCode: z.string().min(1).max(32),
  phone: z.string().min(6).max(20),
  password: z.string().min(6).max(64),
  displayName: z.string().max(64).optional()
});

const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

// ────────────────────────────────────────────────────────────
// Helper: Zod safe parse with proper error throwing
// ────────────────────────────────────────────────────────────

function parseBody<T extends z.ZodTypeAny>(schema: T, body: any, requestId?: string): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpException(
      { code: 40001, message: "参数非法：" + result.error.issues.map(i => i.message).join(", "), requestId },
      HttpStatus.BAD_REQUEST
    );
  }
  return result.data;
}

// ────────────────────────────────────────────────────────────
// Controller
// ────────────────────────────────────────────────────────────

@Controller("v1/auth")
export class AuthController {

  /** 手机号 + 密码 登录 */
  @Post("login")
  async login(@Body() rawBody: any, @Headers("x-request-id") requestId?: string) {
    const body = parseBody(LoginRequestSchema, rawBody, requestId);

    const user = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user) {
      unauthorized(401, "手机号或密码不正确", requestId);
    }

    const passwordMatch = await bcrypt.compare(body.password, user!.passwordHash);
    if (!passwordMatch) {
      unauthorized(401, "手机号或密码不正确", requestId);
    }

    if (user!.status !== "ACTIVE") {
      forbidden(403, "账号已被停用", requestId);
    }

    const accessToken = issueAccessToken({ userId: user!.userId, tenantId: user!.userId });
    return ok(
      {
        accessToken,
        refreshToken: `rft_${crypto.randomUUID()}`,
        expiresIn: 7200,
        user: {
          userId: user!.userId,
          phone: user!.phone,
          displayName: user!.displayName,
          planId: user!.planId,
          quotaLeft: user!.quotaLeft
        }
      },
      requestId
    );
  }

  /** 邀请码 + 手机号 + 密码 注册 */
  @Post("register")
  async register(@Body() rawBody: any, @Headers("x-request-id") requestId?: string) {
    const body = parseBody(RegisterRequestSchema, rawBody, requestId);

    // 验证邀请码
    const invite = await prisma.inviteCode.findUnique({ where: { code: body.inviteCode } });
    if (!invite) {
      badRequest(400, "邀请码无效", requestId);
    }
    if (invite!.usedCount >= invite!.maxUses) {
      badRequest(400, "邀请码已达使用上限", requestId);
    }
    if (invite!.expireAt && invite!.expireAt < new Date()) {
      badRequest(400, "邀请码已过期", requestId);
    }

    // 手机号唯一性检查
    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing) {
      conflict(409, "该手机号已注册", requestId);
    }

    // 创建用户
    const passwordHash = await bcrypt.hash(body.password, 10);
    const userId = `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const user = await prisma.user.create({
      data: {
        userId,
        phone: body.phone,
        passwordHash,
        displayName: body.displayName || null,
        planId: "free",
        quotaLeft: 20,
        status: "ACTIVE"
      }
    });

    // 消耗邀请码使用次数
    await prisma.inviteCode.update({
      where: { codeId: invite!.codeId },
      data: { usedCount: { increment: 1 } }
    });

    const accessToken = issueAccessToken({ userId: user.userId, tenantId: user.userId });
    return ok(
      {
        accessToken,
        refreshToken: `rft_${crypto.randomUUID()}`,
        expiresIn: 7200,
        user: {
          userId: user.userId,
          phone: user.phone,
          displayName: user.displayName,
          planId: user.planId,
          quotaLeft: user.quotaLeft
        }
      },
      requestId
    );
  }

  /** 微信登录 (mock，保留接口待后续接入真实微信) */
  @Post("wechat-login")
  wechatLogin(@Body() rawBody: any, @Headers("x-request-id") requestId?: string) {
    const body = parseBody(WechatLoginRequestSchema, rawBody, requestId);
    const userId = `u_wx_${body.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20)}`;
    const accessToken = issueAccessToken({ userId, tenantId: userId });
    return ok(
      {
        accessToken,
        refreshToken: `rft_${crypto.randomUUID()}`,
        expiresIn: 7200,
        user: { userId, planId: "free", quotaLeft: 20 }
      },
      requestId
    );
  }

  /** 刷新 token */
  @Post("refresh")
  refreshToken(@Body() rawBody: any, @Headers("x-request-id") requestId?: string) {
    parseBody(RefreshRequestSchema, rawBody, requestId);
    const userId = process.env.AUTH_LEGACY_DEFAULT_USER_ID || "u_refresh";
    const accessToken = issueAccessToken({ userId, tenantId: userId });
    return ok({ accessToken, expiresIn: 7200 }, requestId);
  }
}
