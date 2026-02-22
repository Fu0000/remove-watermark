function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url}`;
}

function normalizeReturnUrl(url: string | undefined) {
  if (!url) {
    return "https://app.remove-watermark.local/subscription/result";
  }

  try {
    new URL(url);
    return url;
  } catch {
    return "https://app.remove-watermark.local/subscription/result";
  }
}

const runtimeEnv: Record<string, string | undefined> =
  typeof process !== "undefined" ? process.env : {};

export const API_BASE_URL = normalizeBaseUrl(
  runtimeEnv.TARO_APP_API_BASE_URL || "http://127.0.0.1:3000"
);

export const SHARED_AUTH_CODE = runtimeEnv.TARO_APP_SHARED_AUTH_CODE || "admin";
export const SHARED_USERNAME = runtimeEnv.TARO_APP_SHARED_USERNAME || "admin";
export const SHARED_PASSWORD = runtimeEnv.TARO_APP_SHARED_PASSWORD || "admin123";
export const SUBSCRIPTION_RETURN_URL = normalizeReturnUrl(runtimeEnv.TARO_APP_SUBSCRIPTION_RETURN_URL);
