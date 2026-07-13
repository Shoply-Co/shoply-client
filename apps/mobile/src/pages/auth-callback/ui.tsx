import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert, View } from "react-native";
import { useShoplyTheme } from "@shoply/design-system";
import { env } from "@/app/config/env";
import { useSession } from "@/app/providers/session-provider";
import type { AuthCompletionResult } from "@/app/providers/session-provider";
import { ApiError, userFacingErrorMessage } from "@/shared/api/errors";

export function AuthCallbackPage() {
  const theme = useShoplyTheme();
  const params = useLocalSearchParams<{
    provider?: string;
    code?: string;
    state?: string;
    handoffCode?: string;
    error?: string;
    errorDescription?: string;
  }>();
  const { completeOAuth, completeOAuthHandoff, reactivateDeactivatedAccount } = useSession();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    if (params.error) {
      handledRef.current = true;
      Alert.alert(
        "로그인 실패",
        params.errorDescription ?? "OAuth 로그인이 취소되었거나 실패했습니다."
      );
      router.replace("/login");
      return;
    }

    if (params.handoffCode) {
      handledRef.current = true;
      void completeOAuthHandoff(params.handoffCode)
        .then((result) => {
          handleAuthCompletion(result, reactivateDeactivatedAccount);
        })
        .catch((error) => {
          Alert.alert("로그인 실패", callbackErrorMessage(error));
          router.replace("/login");
        });
      return;
    }

    if (!params.provider || !params.code) return;

    handledRef.current = true;
    void completeOAuth(params.provider, params.code, params.state, undefined, env.oauthRedirectUri)
      .then((result) => {
        handleAuthCompletion(result, reactivateDeactivatedAccount);
      })
      .catch((error) => {
        Alert.alert("로그인 실패", callbackErrorMessage(error));
        router.replace("/login");
      });
  }, [
    completeOAuth,
    completeOAuthHandoff,
    reactivateDeactivatedAccount,
    params.code,
    params.error,
    params.errorDescription,
    params.handoffCode,
    params.provider,
    params.state
  ]);

  return <View style={{ flex: 1, backgroundColor: theme.semantic.color.background }} />;
}

function handleAuthCompletion(
  result: AuthCompletionResult,
  reactivateDeactivatedAccount: (reactivationToken: string) => Promise<void>
) {
  if (result.status === "authenticated") {
    router.replace("/");
    return;
  }

  Alert.alert("비활성화된 사용자입니다.", "비활성화를 해제하겠습니까?", [
    {
      text: "취소",
      style: "cancel",
      onPress: () => {
        router.replace("/login");
      }
    },
    {
      text: "확인",
      onPress: () => {
        void reactivateDeactivatedAccount(result.challenge.reactivationToken)
          .then(() => {
            router.replace("/");
          })
          .catch((error) => {
            Alert.alert("비활성화 해제 실패", callbackErrorMessage(error));
            router.replace("/login");
          });
      }
    }
  ]);
}

function callbackErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof ApiError
      ? (error.rawMessage ?? error.message)
      : error instanceof Error
        ? error.message
        : "";
  if (/handoff code/i.test(rawMessage)) {
    return "로그인 세션이 이미 처리되었거나 만료됐어요. 다시 로그인해주세요.";
  }
  return userFacingErrorMessage(error, "세션 교환에 실패했습니다.");
}
