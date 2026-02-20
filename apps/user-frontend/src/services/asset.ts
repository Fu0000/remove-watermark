import { request } from "./http";

export interface UploadPolicyRequest {
  fileName: string;
  fileSize: number;
  mediaType: "image" | "video";
  mimeType: string;
  sha256?: string;
}

interface UploadPolicyResponse {
  assetId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expireAt: string;
}

export function getUploadPolicy(payload: UploadPolicyRequest) {
  return request<UploadPolicyResponse>("/v1/assets/upload-policy", {
    method: "POST",
    data: payload
  });
}
