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

function readBrowserApiBaseOverride() {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("apiBase")?.trim();
    if (fromQuery) {
      window.localStorage?.setItem("rw_api_base_url", fromQuery);
      return fromQuery;
    }

    const fromStorage = window.localStorage?.getItem("rw_api_base_url")?.trim();
    if (fromStorage) {
      return fromStorage;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3000";
  }

  const host = window.location.hostname;
  const isLocalHost =
    host === "127.0.0.1" || host === "localhost" || /^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host);

  return isLocalHost ? "http://127.0.0.1:13000" : "http://127.0.0.1:3000";
}

const runtimeEnv: Record<string, string | undefined> =
  typeof process !== "undefined" ? process.env : {};

export const API_BASE_URL = normalizeBaseUrl(
  readBrowserApiBaseOverride() || runtimeEnv.TARO_APP_API_BASE_URL || resolveDefaultApiBaseUrl()
);

export const SHARED_AUTH_CODE = runtimeEnv.TARO_APP_SHARED_AUTH_CODE || "admin";
export const SHARED_USERNAME = runtimeEnv.TARO_APP_SHARED_USERNAME || "admin";
export const SHARED_PASSWORD = runtimeEnv.TARO_APP_SHARED_PASSWORD || "admin123";
export const SUBSCRIPTION_RETURN_URL = normalizeReturnUrl(runtimeEnv.TARO_APP_SUBSCRIPTION_RETURN_URL);
