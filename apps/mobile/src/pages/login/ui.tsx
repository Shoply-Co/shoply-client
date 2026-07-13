import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import type { ShoplyTheme } from "@shoply/design-system";
import { env } from "@/app/config/env";
import { useSession } from "@/app/providers/session-provider";
import type { AuthCompletionResult } from "@/app/providers/session-provider";
import { ApiError, userFacingErrorMessage } from "@/shared/api/errors";
import { ShoplyBagMark } from "@/shared/ui/brand";

type BrowserOAuthProvider = "google" | "kakao";
type DirectOAuthProvider = "apple";
type LoginProvider = BrowserOAuthProvider | DirectOAuthProvider;

export function LoginPage() {
  const theme = useShoplyTheme();
  const { user, completeOAuth, completeOAuthHandoff, reactivateDeactivatedAccount } = useSession();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider | null>(null);
  const visibleProviders: LoginProvider[] =
    Platform.OS === "ios" ? ["kakao", "apple", "google"] : ["kakao", "google"];
  const transitioning = Boolean(user || loadingProvider);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      router.replace("/");
    }, theme.semantic.motion.quick);

    return () => {
      clearTimeout(timer);
    };
  }, [theme.semantic.motion.quick, user]);

  const startOAuth = async (provider: LoginProvider) => {
    if (provider === "kakao" || provider === "google") {
      await startBrowserOAuth(provider);
      return;
    }
    await startAppleOAuth();
  };

  const startAppleOAuth = async () => {
    setLoadingProvider("apple");
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        Alert.alert("로그인 실패", "이 기기에서는 Apple 로그인을 사용할 수 없습니다.");
        return;
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL
        ]
      });

      if (!credential.authorizationCode || !credential.identityToken) {
        Alert.alert("로그인 실패", "Apple 인증 정보를 받지 못했습니다.");
        return;
      }

      const result = await completeOAuth(
        "apple",
        credential.authorizationCode,
        undefined,
        undefined,
        undefined,
        credential.identityToken
      );
      await handleAuthCompletion(result);
    } catch (error) {
      if (isAppleAuthCancel(error)) return;
      Alert.alert("로그인 실패", userFacingErrorMessage(error, "다시 시도해주세요."));
    } finally {
      setLoadingProvider(null);
    }
  };

  const startBrowserOAuth = async (provider: BrowserOAuthProvider) => {
    if (provider === "kakao" && !env.kakaoLoginEnabled) return;

    setLoadingProvider(provider);
    try {
      const startUrl = `${env.apiBaseUrl}/auth/oauth/${provider}/start?returnUri=${encodeURIComponent(env.oauthRedirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(startUrl, env.oauthRedirectUri);

      if (result.type === "success") {
        const callback = parseOAuthCallbackUrl(result.url);
        if (callback.error) {
          Alert.alert(
            "로그인 실패",
            callback.errorDescription ?? `${providerLabel(provider)}이 취소되었거나 실패했습니다.`
          );
          return;
        }
        if (callback.provider && callback.provider !== provider) {
          Alert.alert(
            "로그인 실패",
            `${providerLabel(provider)} 응답이 아니에요. 다시 시도해주세요.`
          );
          return;
        }
        if (callback.handoffCode) {
          const authResult = await completeOAuthHandoff(callback.handoffCode);
          await handleAuthCompletion(authResult);
          return;
        }
      }

      if (result.type !== "cancel" && result.type !== "dismiss") {
        Alert.alert("로그인 실패", `${providerLabel(provider)} 세션 코드를 받지 못했습니다.`);
      }
    } catch (error) {
      Alert.alert("로그인 실패", oauthErrorMessage(error, provider));
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleAuthCompletion = async (result: AuthCompletionResult) => {
    if (result.status === "authenticated") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
      return;
    }

    Alert.alert("비활성화된 사용자입니다.", "비활성화를 해제하겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "확인",
        onPress: () => {
          void reactivateAndLogin(result.challenge.reactivationToken);
        }
      }
    ]);
  };

  const reactivateAndLogin = async (reactivationToken: string) => {
    try {
      await reactivateDeactivatedAccount(reactivationToken);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch (error) {
      Alert.alert("비활성화 해제 실패", userFacingErrorMessage(error, "다시 로그인해주세요."));
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroMark}>
            <ShoplyBagMark size={96} />
          </View>
        </View>

        <View style={styles.socialStack}>
          {visibleProviders.map((provider) => (
            <ProviderButton
              key={provider}
              provider={provider}
              loading={loadingProvider === provider}
              onPress={() => {
                void startOAuth(provider);
              }}
            />
          ))}
        </View>
      </ScrollView>

      {transitioning ? (
        <View
          accessibilityLabel="로그인 처리 중"
          accessibilityLiveRegion="polite"
          pointerEvents="auto"
          style={[styles.loadingDim, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}
        >
          <View
            style={[
              styles.loadingIndicator,
              { backgroundColor: theme.semantic.color.surfaceElevated },
              theme.semantic.shadow.overlay
            ]}
          >
            <ActivityIndicator color={theme.semantic.color.primary} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function providerLabel(provider: BrowserOAuthProvider) {
  return provider === "google" ? "Google 로그인" : "카카오 로그인";
}

function oauthErrorMessage(error: unknown, provider: BrowserOAuthProvider) {
  const rawMessage =
    error instanceof ApiError
      ? (error.rawMessage ?? error.message)
      : error instanceof Error
        ? error.message
        : "";
  if (/handoff code/i.test(rawMessage)) {
    return "로그인 세션이 이미 처리되었거나 만료됐어요. 다시 로그인해주세요.";
  }
  return userFacingErrorMessage(error, `${providerLabel(provider)} 설정을 확인해주세요.`);
}

function parseOAuthCallbackUrl(url: string) {
  const parsed = new URL(url);
  return {
    provider: parsed.searchParams.get("provider") ?? undefined,
    handoffCode: parsed.searchParams.get("handoffCode") ?? undefined,
    error: parsed.searchParams.get("error") ?? undefined,
    errorDescription: parsed.searchParams.get("errorDescription") ?? undefined
  };
}

function ProviderButton({
  provider,
  loading,
  onPress
}: {
  provider: LoginProvider;
  loading: boolean;
  onPress: () => void;
}) {
  const theme = useShoplyTheme();
  const spec = providerButtonSpec(provider, theme);
  const available =
    provider === "kakao"
      ? env.kakaoLoginEnabled
      : provider === "google"
        ? true
        : Platform.OS === "ios";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spec.label}
      onPress={onPress}
      disabled={loading || !available}
      style={({ pressed }) => [
        styles.providerButton,
        {
          backgroundColor: spec.background,
          borderColor: spec.borderColor ?? spec.background,
          borderWidth: spec.borderWidth ?? 1,
          opacity: loading ? 0.62 : pressed ? 0.86 : 1
        }
      ]}
    >
      <View style={styles.iconSlot}>{spec.icon}</View>
      <ShoplyText variant="labelLg" style={[styles.providerLabel, { color: spec.textColor }]}>
        {spec.label}
      </ShoplyText>
      <View style={styles.iconSlot} />
    </Pressable>
  );
}

function isAppleAuthCancel(error: unknown) {
  return (
    error && typeof error === "object" && "code" in error && error.code === "ERR_REQUEST_CANCELED"
  );
}

function providerButtonSpec(
  provider: LoginProvider,
  theme: ShoplyTheme
): {
  label: string;
  icon: ReactNode;
  background: string;
  textColor: string;
  borderColor?: string;
  borderWidth?: number;
} {
  if (provider === "kakao") {
    return {
      label: "카카오 로그인",
      icon: <KakaoLogo />,
      background: "#FEE500",
      textColor: "rgba(0, 0, 0, 0.85)"
    };
  }
  if (provider === "apple") {
    return {
      label: "Apple로 로그인",
      icon: <AppleLogo color="white" />,
      background: "#000000",
      textColor: "#FFFFFF"
    };
  }
  return {
    label: "Google로 로그인",
    icon: <GoogleLogo />,
    background: theme.semantic.color.surface,
    textColor: theme.semantic.color.text,
    borderColor: theme.semantic.color.borderStrong,
    borderWidth: StyleSheet.hairlineWidth
  };
}

function KakaoLogo() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityLabel="Kakao">
      <Path
        fill="#000000"
        d="M12 4.1c-5.2 0-9.4 3.28-9.4 7.32 0 2.58 1.72 4.84 4.31 6.15l-.79 2.86c-.09.34.29.61.59.43l3.45-2.28c.59.1 1.2.15 1.84.15 5.2 0 9.4-3.28 9.4-7.31S17.2 4.1 12 4.1z"
      />
    </Svg>
  );
}

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h6.47a5.53 5.53 0 0 1-2.4 3.63v2.96h3.88c2.27-2.09 3.54-5.17 3.54-8.61z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.88-2.96c-1.08.72-2.45 1.14-4.05 1.14-3.11 0-5.74-2.1-6.69-4.92H1.3v3.06A11.99 11.99 0 0 0 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.31 14.35A7.22 7.22 0 0 1 4.94 12c0-.82.13-1.61.37-2.35V6.59H1.3A11.99 11.99 0 0 0 0 12c0 1.94.47 3.77 1.3 5.41l4.01-3.06z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.73c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.94 1.17 15.23 0 12 0A11.99 11.99 0 0 0 1.3 6.59l4.01 3.06C6.26 6.83 8.89 4.73 12 4.73z"
      />
    </Svg>
  );
}

function AppleLogo({ color }: { color: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" accessibilityLabel="Apple">
      <Path
        fill={color}
        d="M16.39 1.62c0 1.14-.47 2.25-1.23 3.07-.79.86-2.11 1.53-3.19 1.44-.14-1.1.46-2.28 1.19-3.05.8-.84 2.18-1.46 3.23-1.46zM20.7 17.3c-.55 1.27-.82 1.84-1.54 2.96-.99 1.53-2.39 3.43-4.12 3.45-1.54.02-1.94-1.01-4.03-1-2.09.01-2.53 1.02-4.07 1-1.73-.02-3.06-1.74-4.05-3.27C.11 16.2-.19 11.23 1.52 8.58c1.22-1.88 3.15-2.99 4.96-3.02 1.85-.03 3.58 1.02 4.52 1.02.9 0 2.61-1.25 4.4-1.06.75.03 2.84.3 4.19 2.27-3.68 2.02-3.07 7.28 1.11 9.51z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 10,
    justifyContent: "center",
    padding: 16,
    paddingTop: 36,
    paddingBottom: 72
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8
  },
  heroMark: {
    alignItems: "center",
    height: 104,
    justifyContent: "center",
    width: 104
  },
  socialStack: {
    gap: 10
  },
  providerButton: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 16
  },
  providerLabel: {
    flex: 1,
    textAlign: "center"
  },
  iconSlot: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24
  },
  loadingDim: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  loadingIndicator: {
    alignItems: "center",
    borderRadius: 16,
    height: 64,
    justifyContent: "center",
    width: 64
  }
});
