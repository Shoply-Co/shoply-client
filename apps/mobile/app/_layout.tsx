import "react-native-gesture-handler";
import { PropsWithChildren, useCallback, useEffect, useRef } from "react";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AlertTriangle, RotateCcw } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { AppProviders } from "@/app/providers/app-providers";
import { useSession } from "@/app/providers/session-provider";
import { prefetchInitialSearchReviews } from "@/entities/review";
import { useEnsureAutomaticMagazinesOnVisit } from "@/features/magazine-ensure";
import { userFacingErrorMessage } from "@/shared/api/errors";
import { queryClient } from "@/shared/api/query-client";
import { darkTheme, lightTheme, useShoplyTheme } from "@shoply/design-system";

WebBrowser.maybeCompleteAuthSession();
SplashScreen.setOptions({ duration: 0, fade: false });
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const LIGHT_SPLASH_BACKGROUND_COLOR = "#FFFFFF";
const DARK_SPLASH_BACKGROUND_COLOR = "#17181D";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? darkTheme : lightTheme;

  return (
    <View style={[styles.errorScreen, { backgroundColor: theme.semantic.color.background }]}>
      <View style={[styles.errorIcon, { backgroundColor: theme.semantic.color.primarySoft }]}>
        <AlertTriangle size={30} color={theme.semantic.color.primary} />
      </View>
      <Text style={[styles.errorTitle, { color: theme.semantic.color.text }]}>
        필수 데이터를 불러오지 못했어요
      </Text>
      <Text style={[styles.errorBody, { color: theme.semantic.color.textMuted }]}>
        {userFacingErrorMessage(error, "잠시 후 다시 시도해주세요.")}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다시 시도"
        onPress={() => {
          void queryClient.resetQueries();
          retry();
        }}
        style={[styles.retryButton, { backgroundColor: theme.component.button.primary.background }]}
      >
        <RotateCcw size={17} color={theme.component.button.primary.text} />
        <Text style={[styles.retryLabel, { color: theme.component.button.primary.text }]}>
          다시 시도
        </Text>
      </Pressable>
    </View>
  );
}

function RootStack() {
  const theme = useShoplyTheme();
  const { user, initializing, policyStateLoaded } = useSession();
  const appReady = !initializing && (!user || policyStateLoaded);
  const splashBackgroundColor =
    theme.semantic.mode === "dark" ? DARK_SPLASH_BACKGROUND_COLOR : LIGHT_SPLASH_BACKGROUND_COLOR;
  const prefetchedSearchKeyRef = useRef<string | null>(null);
  const splashHiddenRef = useRef(false);

  useEnsureAutomaticMagazinesOnVisit({
    enabled: appReady && Boolean(user),
    userId: user?.id
  });

  const hideSplashScreen = useCallback(() => {
    if (!appReady || splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    SplashScreen.hide();
  }, [appReady]);

  useEffect(() => {
    if (!appReady) return;
    const prefetchKey = user?.id ?? "anonymous";
    if (prefetchedSearchKeyRef.current === prefetchKey) return;
    prefetchedSearchKeyRef.current = prefetchKey;
    void prefetchInitialSearchReviews(queryClient, user?.id).catch(() => undefined);
  }, [appReady, user?.id]);

  if (!appReady) {
    return <View style={[styles.launchScreen, { backgroundColor: splashBackgroundColor }]} />;
  }

  return (
    <View
      onLayout={hideSplashScreen}
      style={[styles.rootContainer, { backgroundColor: theme.semantic.color.background }]}
    >
      <StatusBar style={theme.semantic.mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.semantic.color.background
          }
        }}
      >
        <Stack.Screen name="index" options={{ animation: "none" }} />
        <Stack.Screen name="login" options={{ animation: "none" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
        <Stack.Screen name="onboarding" options={{ animation: "none" }} />
        <Stack.Screen name="policies/consents" options={{ animation: "none" }} />
        <Stack.Screen
          name="review/[reviewId]"
          options={{ animation: "fade", animationDuration: 220 }}
        />
        <Stack.Screen
          name="magazine/[issueId]/review/[reviewId]"
          options={{ animation: "fade", animationDuration: 220 }}
        />
      </Stack>
    </View>
  );
}

function WebViewportShell({ children }: PropsWithChildren) {
  const theme = useShoplyTheme();

  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <View
      style={[
        styles.webViewportOuter,
        {
          backgroundColor:
            theme.semantic.mode === "dark"
              ? theme.semantic.color.background
              : theme.semantic.color.surfaceMuted
        }
      ]}
    >
      <View
        style={[
          styles.webViewportInner,
          {
            backgroundColor: theme.semantic.color.background,
            borderColor: theme.semantic.color.border
          }
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <WebViewportShell>
        <RootStack />
      </WebViewportShell>
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  errorBody: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 310,
    textAlign: "center"
  },
  errorIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  errorScreen: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 29,
    textAlign: "center"
  },
  retryButton: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18
  },
  launchScreen: {
    flex: 1
  },
  rootContainer: {
    flex: 1
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  webViewportInner: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    flex: 1,
    maxWidth: 520,
    overflow: "hidden",
    width: "100%"
  },
  webViewportOuter: {
    alignItems: "center",
    flex: 1,
    width: "100%"
  }
});
