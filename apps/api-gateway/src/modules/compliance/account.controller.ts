import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict, notFound } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { parseForwardedIp } from "../../common/network";
import { requireIdempotencyKey } from "../../common/request-headers";
import { parseRequestBody, parseRequestParams, parseRequestQuery } from "../../common/request-validation";
import { ComplianceService } from "./compliance.service";
import { z } from "zod";

interface AccountDeleteRequestBody {
  reason?: string;
  confirm?: boolean;
}

const AccountDeleteRequestBodySchema = z.object({
  reason: z.string().trim().min(1),
  confirm: z.literal(true)
});
const AccountDeleteRequestParamSchema = z.object({
  requestId: z.string().trim().min(1)
});
const AccountDeleteStatusSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.enum(["PENDING", "PROCESSING", "DONE", "FAILED"]).optional()
);
const PositiveIntWithFallbackSchema = (fallback: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      return fallback;
    }
    return fallback;
  }, z.number().int().positive());
const DeleteRequestListQuerySchema = z.object({
  status: AccountDeleteStatusSchema,
  page: PositiveIntWithFallbackSchema(1),
  pageSize: PositiveIntWithFallbackSchema(20)
});
const OptionalDateTimeStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z
    .string()
    .refine((raw) => !Number.isNaN(new Date(raw).getTime()))
    .optional()
);
const AuditLogsQuerySchema = z.object({
  action: z.preprocess((value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value), z.string().optional()),
  resourceType: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().optional()
  ),
  from: OptionalDateTimeStringSchema,
  to: OptionalDateTimeStringSchema,
  page: PositiveIntWithFallbackSchema(1),
  pageSize: PositiveIntWithFallbackSchema(20)
});

@Controller("v1/account")
export class AccountController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  @Post("delete-request")
  @HttpCode(200)
  async createDeleteRequest(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Body() rawBody: AccountDeleteRequestBody
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const body = parseRequestBody(AccountDeleteRequestBodySchema, rawBody, requestIdHeader);
    const idempotency = requireIdempotencyKey(idempotencyKey, requestIdHeader);
    const reason = body.reason.trim();

    const result = await this.complianceService.createAccountDeleteRequest(auth.userId, reason, idempotency, {
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent
    });
    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    return ok(result.data, requestIdHeader);
  }

  @Get("delete-requests")
  async listDeleteRequests(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Query("status") status: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const query = parseRequestQuery(
      DeleteRequestListQuerySchema,
      {
        status,
        page: pageRaw,
        pageSize: pageSizeRaw
      },
      requestIdHeader
    );

    const result = await this.complianceService.listAccountDeleteRequests(auth.userId, {
      status: query.status,
      page: query.page,
      pageSize: query.pageSize
    });

    return ok(result, requestIdHeader);
  }

  @Get("delete-requests/:requestId")
  async getDeleteRequest(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("requestId") requestId: string
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const params = parseRequestParams(AccountDeleteRequestParamSchema, { requestId }, requestIdHeader);
    const result = await this.complianceService.getAccountDeleteRequest(auth.userId, params.requestId);
    if (!result) {
      notFound(40401, "资源不存在", requestIdHeader);
    }
    return ok(result, requestIdHeader);
  }

  @Get("audit-logs")
  async listAuditLogs(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Query("action") action: string | undefined,
    @Query("resourceType") resourceType: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const query = parseRequestQuery(
      AuditLogsQuerySchema,
      {
        action,
        resourceType,
        from,
        to,
        page: pageRaw,
        pageSize: pageSizeRaw
      },
      requestIdHeader
    );

    const result = await this.complianceService.listAuditLogs(auth.userId, {
      action: query.action,
      resourceType: query.resourceType,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize
    });
    return ok(result, requestIdHeader);
  }
}
