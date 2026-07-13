import { router, type Href } from "expo-router";

export function goBackOrReplace(fallback: Href = "/(tabs)/my") {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallback);
}
