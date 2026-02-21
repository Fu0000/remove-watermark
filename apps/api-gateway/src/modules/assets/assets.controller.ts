import { Body, Controller, Delete, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict, notFound } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { ComplianceService } from "../compliance/compliance.service";

interface UploadPolicyRequest {
  fileName: string;
  fileSize: number;
  mediaType: "image" | "video";
  mimeType: string;
  sha256?: string;
}

@Controller("v1/assets")
export class AssetsController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  @Post("upload-policy")
  async createUploadPolicy(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Body() body: UploadPolicyRequest
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    if (!body.fileName || !body.fileSize || body.fileSize <= 0) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    const payload = await this.complianceService.createUploadPolicy("u_1001", body, {
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent
    });

    return ok(payload, requestIdHeader);
  }

  @Delete(":assetId")
  @HttpCode(200)
  async deleteAsset(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Param("assetId") assetId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    const result = await this.complianceService.deleteAsset("u_1001", assetId, idempotencyKey, {
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent
    });
    if (result.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在", requestIdHeader);
    }
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
