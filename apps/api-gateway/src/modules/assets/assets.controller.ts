import { Body, Controller, Post } from "@nestjs/common";

interface UploadPolicyRequest {
  fileName: string;
  fileSize: number;
  mediaType: "image" | "video";
  mimeType: string;
}

@Controller("v1/assets")
export class AssetsController {
  @Post("upload-policy")
  createUploadPolicy(@Body() body: UploadPolicyRequest) {
    return {
      code: 0,
      message: "ok",
      requestId: crypto.randomUUID(),
      data: {
        assetId: `ast_${Date.now()}`,
        uploadUrl: "https://minio.local/signed-upload-url",
        headers: {
          "x-amz-meta-file-name": body.fileName,
          "x-amz-meta-media-type": body.mediaType,
          "x-amz-meta-mime-type": body.mimeType,
          "x-amz-meta-file-size": String(body.fileSize)
        },
        expireAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      }
    };
  }
}
