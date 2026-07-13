import { API_BASE_URL, APP_ENV, OAUTH_REDIRECT_URI, RELEASE_PROFILE } from "@/shared/config/constants";

export const env = {
  appEnv: APP_ENV,
  apiBaseUrl: API_BASE_URL,
  oauthRedirectUri: OAUTH_REDIRECT_URI,
  releaseProfile: RELEASE_PROFILE,
  kakaoLoginEnabled: process.env.EXPO_PUBLIC_KAKAO_LOGIN_ENABLED !== "false"
};
