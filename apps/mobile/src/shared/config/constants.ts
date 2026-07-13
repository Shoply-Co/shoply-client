import { Platform } from "react-native";

const defaultApiBaseUrl = "http://localhost:4000/v1";
const nativeOAuthRedirectUri = "shoply://auth/callback";

function normalizeApiBaseUrl(value?: string) {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized || undefined;
}

function currentWebOrigin() {
  const runtime = globalThis as typeof globalThis & {
    window?: {
      location?: {
        origin?: string;
      };
    };
  };

  return runtime.window?.location?.origin;
}

function resolveDefaultOAuthRedirectUri() {
  const origin = Platform.OS === "web" ? currentWebOrigin() : undefined;
  if (origin) {
    return `${origin}/auth/callback`;
  }

  return nativeOAuthRedirectUri;
}

const publicApiBaseUrl = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

const explicitApiBaseUrl = Platform.select({
  android:
    normalizeApiBaseUrl(process.env.EXPO_PUBLIC_ANDROID_API_BASE_URL) ??
    publicApiBaseUrl?.replace("http://localhost", "http://10.0.2.2").replace("http://127.0.0.1", "http://10.0.2.2"),
  default: publicApiBaseUrl
});

export const API_BASE_URL = explicitApiBaseUrl ?? defaultApiBaseUrl;

export const OAUTH_REDIRECT_URI = process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URI?.trim() || resolveDefaultOAuthRedirectUri();

export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV?.trim() || "development";

export const RELEASE_PROFILE = process.env.EXPO_PUBLIC_RELEASE_PROFILE?.trim() || APP_ENV;

export const SHOPLY_EXTERNAL_HOST_ALLOWLIST = ["naver.com", "coupang.com", "oliveyoung.co.kr"];
