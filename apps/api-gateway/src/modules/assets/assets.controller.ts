import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest } from "../../common/http-errors";
import { ok } from "../../common/http-response";

interface UploadPolicyRequest {
  fileName: string;
  fileSize: number;
  mediaType: "image" | "video";
  mimeType: string;
  sha256?: string;
}

@Controller("v1/assets")
export class AssetsController {
  @Post("upload-policy")
  createUploadPolicy(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() body: UploadPolicyRequest
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    if (!body.fileName || !body.fileSize || body.fileSize <= 0) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    return ok(
      {
        assetId: `ast_${Date.now()}`,
        uploadUrl: "https://minio.local/signed-upload-url",
        headers: {
          "x-amz-meta-user-id": "u_1001",
          "x-amz-meta-file-name": body.fileName,
          "x-amz-meta-media-type": body.mediaType,
          "x-amz-meta-mime-type": body.mimeType,
          "x-amz-meta-file-size": String(body.fileSize),
          "x-amz-meta-sha256": body.sha256 || ""
        },
        expireAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      },
      requestIdHeader
    );
  }
}
