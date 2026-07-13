import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { ReactNode, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import { useAccountOverview } from "@/entities/user";
import { apiRequest } from "@/shared/api/client";
import { goBackOrReplace } from "@/shared/lib/navigation";
import type { PayoutProfile, TaxProfile } from "@/shared/api/generated/shoply";

export function PayoutProfilePage() {
  const theme = useShoplyTheme();
  const queryClient = useQueryClient();
  const { user, refreshSessionState } = useSession();
  const { data: account, isError, isPending, refetch } = useAccountOverview(Boolean(user));
  const payout = account?.payoutProfile;
  const tax = account?.taxProfile;
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const syncAccount = async () => {
    await queryClient.invalidateQueries({ queryKey: ["account", "overview"] });
    await refreshSessionState();
  };

  const run = async (key: string, action: () => Promise<unknown>, successMessage: string) => {
    if (!user) {
      router.replace("/login");
      return;
    }
    setSubmitting(key);
    try {
      await action();
      await syncAccount();
      Alert.alert("저장 완료", successMessage);
    } catch (error) {
      Alert.alert("저장 실패", error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(null);
    }
  };

  const verifyIdentity = () =>
    run(
      "identity",
      () =>
        apiRequest("/users/me/payout-profile/identity-verifications", {
          method: "POST",
          body: JSON.stringify({
            provider: "manual",
            method: "mobile"
          })
        }),
      "본인확인 상태가 저장됐어요."
    );

  const verifyPhone = () => {
    if (phoneNumber.trim().length < 8) {
      Alert.alert("휴대폰 번호 확인", "휴대폰 번호를 입력해주세요.");
      return;
    }
    run(
      "phone",
      () =>
        apiRequest("/users/me/payout-profile/phone-verifications", {
          method: "POST",
          body: JSON.stringify({
            phoneNumber,
            method: "sms"
          })
        }),
      "휴대폰 확인 상태가 저장됐어요."
    );
  };

  const verifyBank = () => {
    if (!bankCode.trim() || accountNumber.trim().length < 4 || holderName.trim().length < 2) {
      Alert.alert("계좌 정보 확인", "은행 코드, 계좌번호, 예금주명을 입력해주세요.");
      return;
    }
    run(
      "bank",
      () =>
        apiRequest("/users/me/payout-profile/bank-account-verifications", {
          method: "POST",
          body: JSON.stringify({
            provider: "manual",
            bankCode,
            accountNumber,
            holderName,
            verificationType: "manual",
            holderNameMatchesIdentity: Boolean(holderName.trim())
          })
        }),
      "계좌 확인 상태가 저장됐어요."
    );
  };

  const saveTax = () => {
    if (legalName.trim().length < 2) {
      Alert.alert("세무 정보 확인", "실명을 입력해주세요.");
      return;
    }
    run(
      "tax",
      () =>
        apiRequest<TaxProfile>("/users/me/tax-profile", {
          method: "PUT",
          body: JSON.stringify({
            legalName,
            taxIdentifierType: "none",
            residentType: "resident",
            nationalityType: "korean",
            businessType: "individual_none",
            incomeTypeDefault: "other_income",
            taxReportRequired: false
          })
        }),
      "세무 정보가 저장됐어요."
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.semantic.color.background }} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <TextBackButton />
            <View style={{ flex: 1 }}>
              <ShoplyText variant="titleLg">지급 정보</ShoplyText>
            </View>
          </View>

          {!user ? (
            <View style={[styles.panel, { backgroundColor: theme.semantic.color.surfaceMuted, borderColor: theme.semantic.color.border }]}>
              <ShoplyText variant="titleMd">로그인이 필요해요</ShoplyText>
              <Button label="로그인으로 이동" onPress={() => router.replace("/login")} />
            </View>
          ) : isPending && !account ? (
            <PayoutProfileSkeleton />
          ) : isError && !account ? (
            <StatePanel
              title="지급 정보를 불러오지 못했어요"
              body="잠시 후 다시 시도해주세요."
              actionLabel="다시 시도"
              onAction={() => {
                void refetch();
              }}
            />
          ) : (
            <>
              <View style={[styles.summaryPanel, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
                <View style={styles.summaryTop}>
                  <ShoplyText variant="titleMd">지급 준비</ShoplyText>
                  <StatusPill ready={payout?.status === "payable"} label={payoutStatusLabel(payout)} />
                </View>
                <ShoplyText variant="caption" color="textMuted">
                  {payout?.bankAccountMasked ? `${payout.bankAccountMasked} 계좌 연결됨` : "계좌 연결 전"}
                </ShoplyText>
              </View>

              <StepPanel
                title="본인확인"
                description="본인확인을 진행해주세요."
                ready={Boolean(payout?.identityVerified)}
                actionLabel="본인확인 요청"
                loading={submitting === "identity"}
                onPress={verifyIdentity}
              />

              <StepPanel
                title="휴대폰"
                description={account?.me.phoneVerifiedAt ? `확인일 ${formatDate(account.me.phoneVerifiedAt)}` : "휴대폰 번호를 확인해주세요."}
                ready={Boolean(payout?.phoneVerified || account?.me.phoneVerifiedAt)}
                actionLabel="휴대폰 확인 저장"
                loading={submitting === "phone"}
                onPress={verifyPhone}
              >
                <Field label="휴대폰 번호" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" />
              </StepPanel>

              <StepPanel
                title="계좌"
                description={payout?.bankAccountMasked ?? "계좌 확인이 필요해요."}
                ready={Boolean(payout?.bankVerified)}
                actionLabel="계좌 확인 저장"
                loading={submitting === "bank"}
                onPress={verifyBank}
              >
                <View style={styles.rowFields}>
                  <Field label="은행 코드" value={bankCode} onChangeText={setBankCode} style={styles.rowField} />
                  <Field label="예금주" value={holderName} onChangeText={setHolderName} style={styles.rowField} />
                </View>
                <Field
                  label="계좌번호"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                  secureTextEntry
                />
              </StepPanel>

              <StepPanel
                title="세무"
                description={tax ? `현재 상태 ${taxStatusLabel(tax.status)}` : "세무 정보를 입력해주세요."}
                ready={Boolean(payout?.taxProfileReady || tax?.status === "ready")}
                actionLabel="세무 프로필 저장"
                loading={submitting === "tax"}
                onPress={saveTax}
              >
                <Field label="실명" value={legalName} onChangeText={setLegalName} />
              </StepPanel>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PayoutProfileSkeleton() {
  return (
    <View style={styles.payoutSkeleton} accessibilityLabel="지급 정보 불러오는 중">
      <Skeleton height={82} radius={8} />
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={styles.skeletonPanel}>
          <View style={styles.skeletonHeaderRow}>
            <Skeleton width={item % 2 ? "28%" : "36%"} height={20} radius={7} />
            <Skeleton width={38} height={18} radius={9} />
          </View>
          <Skeleton width="72%" height={13} radius={6} />
          {item > 0 ? <Skeleton height={46} radius={10} /> : null}
          <Skeleton height={44} radius={12} />
        </View>
      ))}
    </View>
  );
}

function StatePanel({
  title,
  body,
  actionLabel,
  onAction
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
      <ShoplyText variant="titleMd" align="center">
        {title}
      </ShoplyText>
      <ShoplyText variant="bodyMd" color="textMuted" align="center">
        {body}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

function StepPanel({
  title,
  description,
  ready,
  actionLabel,
  loading,
  onPress,
  children
}: {
  title: string;
  description: string;
  ready: boolean;
  actionLabel: string;
  loading: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
      <View style={styles.stepHeader}>
        <View style={{ flex: 1 }}>
          <ShoplyText variant="titleMd">{title}</ShoplyText>
          <ShoplyText variant="caption" color="textMuted" numberOfLines={2}>
            {description}
          </ShoplyText>
        </View>
        <ShoplyText variant="caption" color={ready ? "primary" : "textMuted"}>
          {ready ? "완료" : "대기"}
        </ShoplyText>
      </View>
      {children}
      <Button label={ready ? "업데이트" : actionLabel} variant={ready ? "secondary" : "primary"} loading={loading} onPress={onPress} />
    </View>
  );
}

function Field({ label, style, ...props }: TextInputProps & { label: string; style?: StyleProp<ViewStyle> }) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.fieldGroup, style]}>
      <ShoplyText variant="labelMd">{label}</ShoplyText>
      <TextInput
        {...props}
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
  );
}

function StatusPill({ ready, label }: { ready: boolean; label: string }) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.statusPill, { backgroundColor: ready ? theme.semantic.color.successFill : theme.semantic.color.primarySoft }]}>
      <ShoplyText variant="caption" style={{ color: ready ? "white" : theme.semantic.color.primary }} numberOfLines={1}>
        {label}
      </ShoplyText>
    </View>
  );
}

function payoutStatusLabel(profile?: PayoutProfile | null) {
  if (!profile) return "확인 전";
  const labels: Record<string, string> = {
    incomplete: "미완료",
    identity_verified: "본인확인",
    bank_verified: "계좌 확인",
    tax_ready: "세무 완료",
    payable: "지급 가능",
    suspended: "중지"
  };
  return labels[profile.status] ?? profile.status;
}

function taxStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    missing: "미입력",
    pending_review: "심사 대기",
    ready: "완료",
    rejected: "반려"
  };
  return labels[status ?? ""] ?? status ?? "미입력";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR");
}

function TextBackButton() {
  const theme = useShoplyTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
      hitSlop={10}
      onPress={() => goBackOrReplace()}
      style={({ pressed }) => [styles.iconBackButton, { opacity: pressed ? 0.68 : 1 }]}
    >
      <ArrowLeft size={22} color={theme.semantic.color.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 116
  },
  fieldGroup: {
    gap: 6
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12
  },
  panel: {
    borderRadius: 8,
    gap: 12,
    padding: 16
  },
  payoutSkeleton: {
    gap: 14
  },
  rowField: {
    flex: 1
  },
  rowFields: {
    flexDirection: "row",
    gap: 10
  },
  statusPill: {
    borderRadius: 999,
    maxWidth: 98,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  stepHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  summaryPanel: {
    borderRadius: 8,
    gap: 8,
    padding: 16
  },
  summaryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  skeletonHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  skeletonPanel: {
    gap: 12,
    padding: 16
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  iconBackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  }
});
