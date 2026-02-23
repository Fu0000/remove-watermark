export type UploadMediaType = "image" | "video" | "pdf" | "ppt";

export const MEDIA_MIME_ALLOWLIST: Record<UploadMediaType, string[]> = {
  image: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  pdf: ["application/pdf"],
  ppt: [
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ]
};

export function isSupportedMime(mediaType: UploadMediaType, mimeType: string) {
  const list = MEDIA_MIME_ALLOWLIST[mediaType] || [];
  return list.includes(mimeType.toLowerCase());
}
