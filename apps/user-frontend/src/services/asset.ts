import { request } from "./http";
import Taro from "@tarojs/taro";

export interface UploadPolicyRequest {
  fileName: string;
  fileSize: number;
  mediaType: "image" | "video" | "pdf" | "ppt";
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

/**
 * Upload a file to COS/MinIO using a presigned URL obtained from `getUploadPolicy`.
 * In H5 mode pass a File object; in Mini Program mode pass a local temp file path string.
 */
export async function uploadFileToCOS(
  uploadUrl: string,
  headers: Record<string, string>,
  file: File | string
): Promise<void> {
  if (typeof file === "string") {
    // Mini Program mode: file is a local temp path
    return new Promise<void>((resolve, reject) => {
      Taro.uploadFile({
        url: uploadUrl,
        filePath: file,
        name: "file",
        header: headers,
        success: (res: { statusCode: number }) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`upload failed: ${res.statusCode}`));
          }
        },
        fail: (err: { errMsg?: string }) => reject(new Error(err.errMsg || "upload failed"))
      });
    });
  }

  // H5 mode: file is a File object
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: file
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `upload failed: ${response.status}`);
  }
}
