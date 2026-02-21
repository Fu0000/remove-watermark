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

export interface DeleteAssetResponse {
  assetId: string;
  status: "DELETED";
  deletedAt: string;
  cleanupStatus: "PENDING" | "DONE";
}

export function deleteAsset(assetId: string, idempotencyKey: string) {
  return request<DeleteAssetResponse>(`/v1/assets/${assetId}`, {
    method: "DELETE",
    idempotencyKey
  });
}
