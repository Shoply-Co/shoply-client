import { useEffect, useState } from "react";
import { router } from "expo-router";
import { UserRound } from "lucide-react-native";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import { useAccountOverview } from "@/entities/user";
import { saveOnboarding } from "@/features/onboarding-update";
import { queryClient } from "@/shared/api/query-client";

export function OnboardingPage() {
  const theme = useShoplyTheme();
  const { user, refreshSessionState } = useSession();
  const { data: account } = useAccountOverview(Boolean(user));
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nicknameReady = nickname.trim().length >= 2;

  useEffect(() => {
    if (!nickname && account?.profile?.nickname) {
      setNickname(account.profile.nickname);
    }
  }, [account?.profile?.nickname, nickname]);

  const complete = async () => {
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 2) {
      Alert.alert("닉네임 확인", "2자 이상 닉네임을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await saveOnboarding({
        nickname: trimmedNickname
      });
      await queryClient.invalidateQueries({ queryKey: ["account", "overview"] });
      await refreshSessionState();
      router.replace("/");
    } catch (error) {
      Alert.alert(
        "저장 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
        edges={["top"]}
      >
        <View style={styles.centerPanel}>
          <UserRound size={34} color={theme.semantic.color.primary} />
          <ShoplyText variant="titleLg" align="center">
            로그인이 필요해요
          </ShoplyText>
          <ShoplyText variant="bodyMd" color="textMuted" align="center">
            로그인 후 시작할 수 있어요.
          </ShoplyText>
          <Button label="로그인으로 이동" size="lg" onPress={() => router.replace("/login")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.iconMark, { backgroundColor: theme.semantic.color.primarySoft }]}>
              <UserRound size={28} color={theme.semantic.color.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <ShoplyText variant="titleLg">닉네임 설정</ShoplyText>
              <ShoplyText variant="bodyMd" color="textMuted">
                Shoply에서 사용할 이름을 입력해주세요.
              </ShoplyText>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <UserRound size={18} color={theme.semantic.color.primary} />
              <ShoplyText variant="titleMd">닉네임</ShoplyText>
            </View>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              placeholder="Shoply에서 사용할 이름"
              placeholderTextColor={theme.component.input.placeholder}
              style={[
                styles.input,
                {
                  backgroundColor: theme.component.input.background,
                  borderColor: theme.component.input.border,
                  color: theme.component.input.text
                }
              ]}
            />
          </View>

          <View style={styles.actions}>
            <Button
              label="완료"
              size="lg"
              loading={submitting}
              disabled={!nicknameReady || submitting}
              onPress={() => complete()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    paddingTop: 4
  },
  centerPanel: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  content: {
    gap: 18,
    padding: 16,
    paddingBottom: 36
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    paddingTop: 10
  },
  iconMark: {
    alignItems: "center",
    borderRadius: 8,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12
  },
  section: {
    gap: 10
  },
  sectionTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  }
});
