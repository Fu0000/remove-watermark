import { Body, Controller, Delete, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { isSupportedMime, type UploadMediaType } from "../../common/media-mime";
import { badRequest, conflict, notFound } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { parseForwardedIp } from "../../common/network";
import { requireIdempotencyKey } from "../../common/request-headers";
import { parseRequestBody, parseRequestParams } from "../../common/request-validation";
import { ComplianceService } from "../compliance/compliance.service";
import { z } from "zod";

interface UploadPolicyRequest {
  fileName: string;
  fileSize: number;
  mediaType: UploadMediaType;
  mimeType: string;
  sha256?: string;
}

const UploadPolicyRequestSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mediaType: z.enum(["image", "video", "pdf", "ppt"]),
  mimeType: z.string().min(1),
  sha256: z.string().optional()
});

const AssetIdParamSchema = z.object({
  assetId: z.string().trim().min(1)
});

@Controller("v1/assets")
export class AssetsController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  @Post("upload-policy")
  async createUploadPolicy(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Body() rawBody: UploadPolicyRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const body = parseRequestBody(UploadPolicyRequestSchema, rawBody, requestIdHeader);

    if (!isSupportedMime(body.mediaType, body.mimeType)) {
      badRequest(40001, "不支持的媒体类型或 MIME", requestIdHeader);
    }

    const payload = await this.complianceService.createUploadPolicy(auth.userId, body, {
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
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const idempotency = requireIdempotencyKey(idempotencyKey, requestIdHeader);
    const params = parseRequestParams(AssetIdParamSchema, { assetId }, requestIdHeader);

    const result = await this.complianceService.deleteAsset(auth.userId, params.assetId, idempotency, {
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
