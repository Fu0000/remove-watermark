function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url}`;
}

export const API_BASE_URL = normalizeBaseUrl(
  process.env.TARO_APP_API_BASE_URL || "http://127.0.0.1:3000"
);

export const SHARED_AUTH_CODE = process.env.TARO_APP_SHARED_AUTH_CODE || "admin";
export const SHARED_USERNAME = process.env.TARO_APP_SHARED_USERNAME || "admin";
export const SHARED_PASSWORD = process.env.TARO_APP_SHARED_PASSWORD || "admin123";
