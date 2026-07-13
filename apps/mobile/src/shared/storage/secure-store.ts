import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "shoply.access-token";
const REFRESH_TOKEN_KEY = "shoply.refresh-token";

type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function getWebStorage(): WebStorageLike | null {
  if (Platform.OS !== "web") return null;
  const globalWithStorage = globalThis as typeof globalThis & { localStorage?: WebStorageLike };
  return globalWithStorage.localStorage ?? null;
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    webStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    return;
  }

  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken)
  ]);
}

export async function readAccessToken() {
  const webStorage = getWebStorage();
  if (webStorage) return webStorage.getItem(ACCESS_TOKEN_KEY);

  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function readRefreshToken() {
  const webStorage = getWebStorage();
  if (webStorage) return webStorage.getItem(REFRESH_TOKEN_KEY);

  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens() {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.removeItem(ACCESS_TOKEN_KEY);
    webStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
  ]);
}
