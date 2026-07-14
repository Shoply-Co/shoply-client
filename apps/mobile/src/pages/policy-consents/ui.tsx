import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import {
  getCurrentConsent,
  isPolicyRequired,
  policyScopeLabel,
  recordPolicyConsent,
  usePolicyConsentState
} from "@/entities/policy";
import { queryClient } from "@/shared/api/query-client";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { AdaptiveStickyHeader } from "@/shared/ui/adaptive-sticky-header";
import type { PolicyVersion } from "@/shared/api/generated/shoply";

export function PolicyConsentsPage() {
  const theme = useShoplyTheme();
  const { user, refreshSessionState } = useSession();
  const { data, isFetching, isError, refetch } = usePolicyConsentState(Boolean(user));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const policies = useMemo(
    () =>
      [...(data?.policies ?? [])].sort((left, right) => {
        const requiredOrder = Number(isPolicyRequired(right)) - Number(isPolicyRequired(left));
        return requiredOrder || left.policyType.localeCompare(right.policyType);
      }),
    [data?.policies]
  );

  useEffect(() => {
    if (!policies.length) return;
    setSelected(() => {
      const next: Record<string, boolean> = {};
      for (const policy of policies) {
        const consent = getCurrentConsent(policy, data?.consents ?? []);
        next[policy.id] = Boolean(consent?.consented && !consent.withdrawnAt);
      }
      return next;
    });
  }, [data?.consents, policies]);

  const requiredPolicies = policies.filter(isPolicyRequired);
  const consentMode = Boolean(data && data.missingRequiredPolicies.length > 0);
  const visiblePolicies = consentMode ? requiredPolicies : policies;
  const requiredAccepted = requiredPolicies.every((policy) => selected[policy.id]);
  const allVisibleAccepted = visiblePolicies.every((policy) => selected[policy.id]);

  const togglePolicy = (policyId: string) => {
    if (!consentMode) return;
    setSelected((current) => ({
      ...current,
      [policyId]: !current[policyId]
    }));
  };

  const submit = async () => {
    if (!requiredAccepted) {
      Alert.alert("필수 약관 동의 필요", "서비스 이용을 위해 필수 약관에 모두 동의해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(requiredPolicies.map((policy) => recordPolicyConsent(policy, true)));
      await queryClient.invalidateQueries({ queryKey: ["policy", "consent-state"] });
      await refreshSessionState();
      router.replace("/");
    } catch (error) {
      Alert.alert(
        "동의 저장 실패",
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
          <ShoplyText variant="titleLg" align="center">
            로그인이 필요해요
          </ShoplyText>
          <Button label="로그인" size="lg" onPress={() => router.replace("/login")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <AdaptiveStickyHeader scrollY={scrollY} style={styles.stickyHeader}>
          <View style={styles.header}>
            <View style={styles.topBar}>
              {!consentMode ? <TextBackButton /> : null}
              <View style={{ flex: 1 }}>
                <ShoplyText variant="titleLg">약관 동의</ShoplyText>
                <ShoplyText variant="bodyMd" color="textMuted">
                  {consentMode
                    ? "필수 항목을 모두 체크하면 다음으로 갈 수 있어요."
                    : "약관 내용을 확인할 수 있어요."}
                </ShoplyText>
              </View>
            </View>
          </View>
        </AdaptiveStickyHeader>

        <View style={styles.policyList}>
          {isFetching && !visiblePolicies.length ? (
            <PolicyListSkeleton />
          ) : (
            visiblePolicies.map((policy) => (
              <PolicyRow
                key={policy.id}
                policy={policy}
                selected={Boolean(selected[policy.id])}
                consentMode={consentMode}
                onToggle={() => togglePolicy(policy.id)}
              />
            ))
          )}
        </View>

        {!policies.length && !isFetching ? (
          <StatePanel
            title={isError ? "약관을 불러오지 못했어요" : "약관 목록이 비어 있어요"}
            actionLabel={isError ? "다시 시도" : undefined}
            onAction={() => {
              void refetch();
            }}
          />
        ) : null}
      </Animated.ScrollView>

      {consentMode ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.semantic.color.background,
              borderTopColor: theme.semantic.color.border
            }
          ]}
        >
          <Button
            label="다음"
            size="lg"
            loading={submitting}
            disabled={!requiredAccepted || !allVisibleAccepted || submitting || isFetching}
            onPress={submit}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function PolicyListSkeleton() {
  return (
    <View accessibilityLabel="약관 불러오는 중">
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={styles.policySkeletonRow}>
          <View style={styles.policySkeletonCopy}>
            <Skeleton width={item % 2 ? "52%" : "66%"} height={16} radius={6} />
            <Skeleton width="34%" height={12} radius={5} />
          </View>
          <Skeleton width={22} height={22} radius={11} />
        </View>
      ))}
    </View>
  );
}

function StatePanel({
  title,
  actionLabel,
  onAction
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centerPanel}>
      <ShoplyText variant="bodyMd" color="textMuted" align="center">
        {title}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
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

function PolicyRow({
  policy,
  selected,
  consentMode,
  onToggle
}: {
  policy: PolicyVersion;
  selected: boolean;
  consentMode: boolean;
  onToggle: () => void;
}) {
  const theme = useShoplyTheme();
  const required = isPolicyRequired(policy);
  const title = policy.title || policyScopeLabel[policy.policyType];

  return (
    <Pressable
      accessibilityRole={consentMode ? "checkbox" : "button"}
      accessibilityState={consentMode ? { checked: selected } : undefined}
      onPress={consentMode ? onToggle : undefined}
      style={({ pressed }) => [
        styles.policyRow,
        {
          backgroundColor: pressed
            ? theme.semantic.color.surfaceMuted
            : theme.semantic.color.background,
          borderBottomColor: theme.semantic.color.border
        }
      ]}
    >
      {consentMode ? (
        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: selected ? theme.semantic.color.primary : "transparent",
              borderColor: selected
                ? theme.semantic.color.primary
                : theme.semantic.color.borderStrong
            }
          ]}
        >
          {selected ? <Check size={15} color="white" strokeWidth={3} /> : null}
        </View>
      ) : null}
      <View style={styles.policyBody}>
        <View style={styles.policyTitleRow}>
          <ShoplyText variant="labelLg" numberOfLines={2} style={{ flex: 1 }}>
            {title}
          </ShoplyText>
          <ShoplyText variant="caption" color={required ? "primary" : "textMuted"}>
            {required ? "필수" : "선택"}
          </ShoplyText>
        </View>
        <ShoplyText variant="caption" color="textMuted">
          {formatDate(policy.effectiveAt)}
        </ShoplyText>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${title} 상세보기`}
          onPress={(event) => {
            event.stopPropagation();
            if (/^https?:\/\//i.test(policy.bodyUrl)) {
              void Linking.openURL(policy.bodyUrl);
              return;
            }
            Alert.alert("상세보기 준비 중", "약관 상세 링크가 연결되면 여기에서 열 수 있어요.");
          }}
          style={styles.linkLine}
        >
          <ShoplyText variant="caption" color="primary">
            상세보기
          </ShoplyText>
        </Pressable>
      </View>
    </Pressable>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

const styles = StyleSheet.create({
  centerPanel: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24
  },
  content: {
    gap: 18,
    padding: 18,
    paddingBottom: 118
  },
  header: {
    gap: 6,
    paddingTop: 8
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  stickyHeader: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 4
  },
  iconBackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  policyList: {
    gap: 0
  },
  policyRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16
  },
  policySkeletonCopy: {
    flex: 1,
    gap: 8
  },
  policySkeletonRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    paddingVertical: 16
  },
  checkbox: {
    borderRadius: 5,
    borderWidth: 1.5,
    height: 22,
    marginTop: 1,
    width: 22
  },
  policyBody: {
    flex: 1,
    gap: 6
  },
  policyTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  linkLine: {
    alignSelf: "flex-start",
    minHeight: 28,
    justifyContent: "center"
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    padding: 16,
    paddingBottom: 28,
    position: "absolute",
    right: 0
  }
});
