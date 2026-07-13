import { ReactNode, useState } from "react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  KeyboardAwareBottomSheet,
  ShoplyText,
  useShoplyTheme
} from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import { AccountOverviewSuspenseBoundary, useSuspenseAccountOverview } from "@/entities/user";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deactivateAccount,
  deleteAccount,
  type AccountDeactivationDuration
} from "@/features/account-lifecycle";
import { apiRequest } from "@/shared/api/client";

const accountMenu = [
  { title: "내 계정정보 설정", route: "/account/edit" },
  { title: "맞춤 필터 설정", route: "/account/filters" },
  { title: "프로필", kind: "profile" },
  { title: "방문한 게시글", route: "/activity?type=viewed" },
  { title: "보관한 게시글", route: "/activity?type=saved" },
  { title: "좋아요한 게시글", route: "/activity?type=liked" },
  { title: "리워드 내역", route: "/rewards" },
  { title: "지급정보", route: "/payout/profile" },
  { title: "약관 및 개인정보 동의", route: "/policies/consents" }
] as const;

const deactivationOptions: Array<{
  value: AccountDeactivationDuration;
  label: string;
  description: string;
}> = [
  { value: "7_days", label: "7일", description: "7일 동안 계정을 비활성화합니다." },
  { value: "15_days", label: "15일", description: "15일 동안 계정을 비활성화합니다." },
  { value: "30_days", label: "30일", description: "30일 동안 계정을 비활성화합니다." },
  { value: "permanent", label: "영구", description: "직접 해제하기 전까지 계정을 비활성화합니다." }
];

export function MyProfilePage() {
  const { user } = useSession();

  if (!user) {
    return (
      <MyProfileFrame>
        <View style={styles.empty}>
          <ShoplyText variant="bodyMd" color="textMuted" align="center">
            로그인 후 메뉴를 사용할 수 있어요.
          </ShoplyText>
          <Button label="로그인" size="lg" onPress={() => router.push("/login")} />
        </View>
      </MyProfileFrame>
    );
  }

  return (
    <AccountOverviewSuspenseBoundary
      fallback={
        <MyProfileFrame>
          <AccountLoadingPanel />
        </MyProfileFrame>
      }
      errorFallback={(retry) => (
        <MyProfileFrame>
          <AccountErrorPanel onRetry={retry} />
        </MyProfileFrame>
      )}
    >
      <MyProfileAuthenticated />
    </AccountOverviewSuspenseBoundary>
  );
}

function MyProfileAuthenticated() {
  const theme = useShoplyTheme();
  const { user, logout } = useSession();
  const { data: account } = useSuspenseAccountOverview();
  const publicProfileRoute = account.me.id;
  const [deactivationOpen, setDeactivationOpen] = useState(false);
  const [deactivationDuration, setDeactivationDuration] =
    useState<AccountDeactivationDuration>("7_days");
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionText, setDeletionText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openSupport = async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    try {
      await apiRequest("/users/me/events", {
        method: "POST",
        body: JSON.stringify({
          eventType: "account_support_open",
          targetType: "account_settings",
          targetId: account?.me.id ?? user.id,
          sessionId: `profile-${user.id}`,
          clientEventId: `account-support-${Date.now()}`,
          sourceSurface: "my_profile",
          payload: { title: "문의 및 계정 지원" }
        })
      });
      Alert.alert("문의 및 계정 지원", "요청을 접수했어요.");
    } catch (error) {
      Alert.alert(
        "요청 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    }
  };

  const submitDeactivation = async () => {
    if (!user) return;

    try {
      setSubmitting(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      const result = await deactivateAccount(deactivationDuration);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      setDeactivationOpen(false);
      await logout();
      Alert.alert("계정 비활성화 완료", deactivationCompleteMessage(result.deactivationEndsAt));
    } catch (error) {
      Alert.alert(
        "비활성화 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitDeletion = async () => {
    if (!user) return;
    const confirmation = deletionText.trim();

    if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      Alert.alert("입력 확인", `"${ACCOUNT_DELETION_CONFIRMATION}"를 정확히 입력해주세요.`);
      return;
    }

    try {
      setSubmitting(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      await deleteAccount(confirmation);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      setDeletionOpen(false);
      setDeletionText("");
      await logout();
      Alert.alert("회원 탈퇴 완료", "계정이 탈퇴 처리됐어요.");
    } catch (error) {
      Alert.alert(
        "탈퇴 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <MyProfileFrame>
        <View
          style={[styles.accountSummary, { backgroundColor: theme.semantic.color.surfaceMuted }]}
        >
          <View style={{ flex: 1 }}>
            <ShoplyText variant="titleMd" numberOfLines={1}>
              {account.profile?.nickname ?? "Shoply 사용자"}
            </ShoplyText>
          </View>
        </View>

        <View style={styles.menuList}>
          {accountMenu.map((item) => {
            return (
              <MenuRow
                key={item.title}
                title={item.title}
                onPress={() => {
                  if ("kind" in item) {
                    router.push({
                      pathname: "/profile/[userId]",
                      params: { userId: publicProfileRoute }
                    });
                    return;
                  }
                  router.push(item.route as Parameters<typeof router.push>[0]);
                }}
              />
            );
          })}
          <MenuRow title="문의 및 계정 지원" onPress={() => void openSupport()} />
          <MenuRow title="계정 비활성화" onPress={() => setDeactivationOpen(true)} />
          <MenuRow title="회원 탈퇴" tone="danger" onPress={() => setDeletionOpen(true)} />
          <MenuRow title="로그아웃" tone="danger" onPress={logout} />
        </View>
      </MyProfileFrame>
      <AccountDeactivationModal
        visible={deactivationOpen}
        selectedDuration={deactivationDuration}
        submitting={submitting}
        onClose={() => {
          if (!submitting) setDeactivationOpen(false);
        }}
        onSelect={setDeactivationDuration}
        onSubmit={() => void submitDeactivation()}
      />
      <AccountDeletionModal
        visible={deletionOpen}
        confirmationText={deletionText}
        submitting={submitting}
        onChangeConfirmation={setDeletionText}
        onClose={() => {
          if (!submitting) {
            setDeletionOpen(false);
            setDeletionText("");
          }
        }}
        onSubmit={() => void submitDeletion()}
      />
    </>
  );
}

function MyProfileFrame({ children }: { children: ReactNode }) {
  const theme = useShoplyTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ShoplyText variant="titleLg">개인정보</ShoplyText>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountLoadingPanel() {
  const theme = useShoplyTheme();
  return (
    <View style={styles.accountLoading} accessibilityLabel="계정 정보 불러오는 중">
      <ActivityIndicator color={theme.semantic.color.primary} />
    </View>
  );
}

function AccountErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <ShoplyText variant="bodyMd" color="textMuted" align="center">
        계정 정보를 불러오지 못했어요.
      </ShoplyText>
      <Button label="다시 시도" variant="secondary" onPress={onRetry} />
    </View>
  );
}

function AccountDeactivationModal({
  visible,
  selectedDuration,
  submitting,
  onClose,
  onSelect,
  onSubmit
}: {
  visible: boolean;
  selectedDuration: AccountDeactivationDuration;
  submitting: boolean;
  onClose: () => void;
  onSelect: (duration: AccountDeactivationDuration) => void;
  onSubmit: () => void;
}) {
  const theme = useShoplyTheme();

  return (
    <KeyboardAwareBottomSheet
      visible={visible}
      animationType="fade"
      accessibilityLabel="계정 비활성화 닫기"
      onClose={onClose}
      backdropStyle={{ backgroundColor: theme.semantic.color.mediaScrimStrong }}
      contentStyle={[styles.modalPanel, { backgroundColor: theme.semantic.color.surfaceElevated }]}
    >
      <View style={styles.modalHeader}>
        <ShoplyText variant="titleMd">계정 비활성화</ShoplyText>
        <ShoplyText variant="bodyMd" color="textMuted">
          선택한 기간 동안 로그인과 계정 활동이 중지됩니다.
        </ShoplyText>
      </View>

      <View style={styles.optionList}>
        {deactivationOptions.map((option) => {
          const selected = option.value === selectedDuration;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [
                styles.durationOption,
                {
                  backgroundColor: selected
                    ? theme.semantic.color.primarySoft
                    : pressed
                      ? theme.semantic.color.surfaceMuted
                      : theme.semantic.color.surface,
                  borderColor: selected ? theme.semantic.color.primary : theme.semantic.color.border
                }
              ]}
            >
              <View
                style={[
                  styles.radioDot,
                  {
                    borderColor: selected
                      ? theme.semantic.color.primary
                      : theme.semantic.color.borderStrong,
                    backgroundColor: selected ? theme.semantic.color.primary : "transparent"
                  }
                ]}
              />
              <View style={styles.optionCopy}>
                <ShoplyText variant="labelLg">{option.label}</ShoplyText>
                <ShoplyText variant="caption" color="textMuted">
                  {option.description}
                </ShoplyText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.modalActions}>
        <Button
          label="취소"
          variant="secondary"
          style={styles.modalActionButton}
          disabled={submitting}
          onPress={onClose}
        />
        <Button
          label="비활성화"
          variant="danger"
          style={styles.modalActionButton}
          loading={submitting}
          onPress={onSubmit}
        />
      </View>
    </KeyboardAwareBottomSheet>
  );
}

function AccountDeletionModal({
  visible,
  confirmationText,
  submitting,
  onChangeConfirmation,
  onClose,
  onSubmit
}: {
  visible: boolean;
  confirmationText: string;
  submitting: boolean;
  onChangeConfirmation: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const theme = useShoplyTheme();
  const ready = confirmationText.trim() === ACCOUNT_DELETION_CONFIRMATION;

  return (
    <KeyboardAwareBottomSheet
      visible={visible}
      animationType="fade"
      accessibilityLabel="회원 탈퇴 닫기"
      onClose={onClose}
      backdropStyle={{ backgroundColor: theme.semantic.color.mediaScrimStrong }}
      contentStyle={[styles.modalPanel, { backgroundColor: theme.semantic.color.surfaceElevated }]}
    >
      <View style={styles.modalHeader}>
        <ShoplyText variant="titleMd" color="danger">
          회원 탈퇴
        </ShoplyText>
        <ShoplyText variant="bodyMd" color="textMuted">
          탈퇴하면 계정이 즉시 비활성화되고 로그인 세션이 종료됩니다.
        </ShoplyText>
      </View>

      <View style={styles.confirmBlock}>
        <ShoplyText variant="labelMd">{ACCOUNT_DELETION_CONFIRMATION}</ShoplyText>
        <TextInput
          accessibilityLabel="회원 탈퇴 확인 문구"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          onChangeText={onChangeConfirmation}
          placeholder={ACCOUNT_DELETION_CONFIRMATION}
          placeholderTextColor={theme.semantic.color.textMuted}
          style={[
            styles.confirmInput,
            {
              borderColor: ready ? theme.semantic.color.dangerFill : theme.semantic.color.border,
              color: theme.semantic.color.text
            }
          ]}
          value={confirmationText}
        />
      </View>

      <View style={styles.modalActions}>
        <Button
          label="취소"
          variant="secondary"
          style={styles.modalActionButton}
          disabled={submitting}
          onPress={onClose}
        />
        <Button
          label="탈퇴"
          variant="danger"
          style={styles.modalActionButton}
          disabled={!ready}
          loading={submitting}
          onPress={onSubmit}
        />
      </View>
    </KeyboardAwareBottomSheet>
  );
}

function MenuRow({
  title,
  tone,
  onPress
}: {
  title: string;
  tone?: "danger";
  onPress: () => void;
}) {
  const theme = useShoplyTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        {
          backgroundColor: pressed
            ? theme.semantic.color.surfaceMuted
            : theme.semantic.color.background,
          borderBottomColor: theme.semantic.color.border
        }
      ]}
    >
      <ShoplyText
        variant="labelLg"
        style={{
          color: tone === "danger" ? theme.semantic.color.dangerFill : theme.semantic.color.text,
          flex: 1
        }}
      >
        {title}
      </ShoplyText>
    </Pressable>
  );
}

function deactivationCompleteMessage(deactivationEndsAt?: string | null) {
  if (!deactivationEndsAt) return "계정이 영구 비활성화됐어요.";

  return `${new Date(deactivationEndsAt).toLocaleDateString("ko-KR")}까지 계정이 비활성화됐어요.`;
}

const styles = StyleSheet.create({
  accountSummary: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    padding: 14
  },
  content: {
    flexGrow: 1,
    gap: 20,
    padding: 18,
    paddingBottom: 122
  },
  accountLoading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 280
  },
  header: {
    paddingBottom: 4,
    paddingTop: 8
  },
  menuList: {
    gap: 0
  },
  menuRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 58,
    paddingVertical: 8
  },
  confirmBlock: {
    gap: 10
  },
  confirmInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  durationOption: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  empty: {
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 64
  },
  modalActionButton: {
    flex: 1
  },
  modalActions: {
    flexDirection: "row",
    gap: 10
  },
  modalHeader: {
    gap: 8
  },
  modalPanel: {
    borderRadius: 16,
    gap: 18,
    margin: 18,
    padding: 18
  },
  optionCopy: {
    flex: 1,
    gap: 4
  },
  optionList: {
    gap: 8
  },
  radioDot: {
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16
  }
});
