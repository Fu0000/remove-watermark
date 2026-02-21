import { Body, Controller, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict } from "../../common/http-errors";
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
}

function parseForwardedIp(forwardedFor: string | undefined): string | undefined {
  if (!forwardedFor) {
    return undefined;
  }

  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}
