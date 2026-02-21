import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict, notFound } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { ComplianceService } from "./compliance.service";

interface AccountDeleteRequestBody {
  reason?: string;
  confirm?: boolean;
}

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
    @Body() body: AccountDeleteRequestBody
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }
    if (!body.confirm) {
      badRequest(40001, "confirm must be true", requestIdHeader);
    }

    const reason = (body.reason || "").trim();
    if (!reason) {
      badRequest(40001, "reason is required", requestIdHeader);
    }

    const result = await this.complianceService.createAccountDeleteRequest("u_1001", reason, idempotencyKey, {
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
    ensureAuthorization(authorization, requestIdHeader);
    const page = parsePositiveInt(pageRaw, 1);
    const pageSize = parsePositiveInt(pageSizeRaw, 20);
    const normalizedStatus = normalizeDeleteStatus(status);
    if (status && !normalizedStatus) {
      badRequest(40001, "status must be one of PENDING/PROCESSING/DONE/FAILED", requestIdHeader);
    }

    const result = await this.complianceService.listAccountDeleteRequests("u_1001", {
      status: normalizedStatus,
      page,
      pageSize
    });

    return ok(result, requestIdHeader);
  }

  @Get("delete-requests/:requestId")
  async getDeleteRequest(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("requestId") requestId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    const result = await this.complianceService.getAccountDeleteRequest("u_1001", requestId);
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
    ensureAuthorization(authorization, requestIdHeader);
    const page = parsePositiveInt(pageRaw, 1);
    const pageSize = parsePositiveInt(pageSizeRaw, 20);

    if (from && Number.isNaN(new Date(from).getTime())) {
      badRequest(40001, "from is invalid datetime", requestIdHeader);
    }
    if (to && Number.isNaN(new Date(to).getTime())) {
      badRequest(40001, "to is invalid datetime", requestIdHeader);
    }

    const result = await this.complianceService.listAuditLogs("u_1001", {
      action,
      resourceType,
      from,
      to,
      page,
      pageSize
    });
    return ok(result, requestIdHeader);
  }
}

function parseForwardedIp(forwardedFor: string | undefined): string | undefined {
  if (!forwardedFor) {
    return undefined;
  }

  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeDeleteStatus(status: string | undefined): "PENDING" | "PROCESSING" | "DONE" | "FAILED" | undefined {
  if (!status) {
    return undefined;
  }

  if (status === "PENDING" || status === "PROCESSING" || status === "DONE" || status === "FAILED") {
    return status;
  }

  return undefined;
}
