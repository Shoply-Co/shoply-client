import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chip, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import {
  useDiscoverMagazines,
  useMyMagazines,
  useSubscribedMagazines,
  isMagazineGeneratingStatus,
  type MagazineSummary
} from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { useMagazineSubscription } from "@/features/magazine-subscribe";
import { ShoplySMonogram } from "@/shared/ui/brand";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_WIDTH = Math.min(350, SCREEN_WIDTH - 50);

export function MagazinesPage() {
  const theme = useShoplyTheme();
  const mine = useMyMagazines();
  const subscriptions = useSubscribedMagazines();
  const discover = useDiscoverMagazines();
  const subscription = useMagazineSubscription();
  const [cadence, setCadence] = useState<"weekly" | "monthly">("monthly");

  const mineByCadence = useMemo(() => ({
    monthly: (mine.data ?? []).filter((issue) => issue.cadence === "monthly"),
    weekly: (mine.data ?? []).filter((issue) => issue.cadence === "weekly")
  }), [mine.data]);
  const heroIssues = mineByCadence[cadence].slice(0, 4);

  useEffect(() => {
    const visible = [
      ...heroIssues.slice(0, 2),
      ...(subscriptions.data ?? []).slice(0, 2),
      ...(discover.data ?? []).slice(0, 3)
    ];
    if (!visible.length) return;
    captureActionEventsQuietly(visible.map((issue) => ({
      eventType: "magazine_impression" as const,
      targetType: "magazine_issue",
      targetId: issue.id,
      sourceSurface: "magazine_home",
      payload: { issueType: issue.issueType, cadence: issue.cadence }
    })));
    captureActionEventsQuietly((subscriptions.data ?? []).slice(0, 4).map((issue) => ({
      eventType: "subscription_impression" as const,
      targetType: "magazine_series",
      targetId: issue.owner.userId,
      sourceSurface: "magazine_home",
      payload: { latestIssueId: issue.id }
    })));
  }, [discover.data, heroIssues, subscriptions.data]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.semantic.color.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <ShoplySMonogram size={36} />
            <View style={styles.brandCopy}>
              <ShoplyText style={styles.pageTitle}>쇼플리</ShoplyText>
              <ShoplyText variant="caption" color="primary" style={styles.slogan}>쇼핑을 쇼핑답게</ShoplyText>
            </View>
          </View>
        </View>

        <View style={styles.sectionTop}>
          <View>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>MY ISSUES</ShoplyText>
            <ShoplyText style={styles.sectionDisplay}>내 잡지</ShoplyText>
          </View>
          <View style={styles.cadenceTabs}>
            <Chip label="월간" selected={cadence === "monthly"} onPress={() => setCadence("monthly")} />
            <Chip label="주간" selected={cadence === "weekly"} onPress={() => setCadence("weekly")} />
          </View>
        </View>

        {mine.isPending ? <HeroSkeleton /> : heroIssues.length ? (
          <ScrollView
            accessibilityLabel={`${cadence === "monthly" ? "월간" : "주간"} 최신 잡지 슬라이드`}
            contentContainerStyle={styles.heroList}
            decelerationRate="fast"
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={HERO_WIDTH + 14}
          >
            {heroIssues.map((issue) => <HeroCover key={issue.id} issue={issue} />)}
          </ScrollView>
        ) : (
          <EmptyShelf title="아직 이 주기의 잡지가 없어요" body="첫 자동호가 준비되면 이곳에 꽂아둘게요." />
        )}

        <View style={styles.sectionTop}>
          <View>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>MY EDITORS</ShoplyText>
            <ShoplyText style={styles.sectionDisplay}>구독한 사람들</ShoplyText>
          </View>
        </View>
        <PeopleStrip
          emptyTitle="아직 구독한 사람이 없어요"
          emptyBody="둘러보기에서 마음에 드는 에디터를 구독해보세요."
          issues={subscriptions.data ?? []}
          loading={subscriptions.isPending}
          onSubscribe={(issue) => subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })}
        />

        <View style={styles.sectionTop}>
          <View>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>이달의 핫한 에디터</ShoplyText>
            <ShoplyText style={styles.sectionDisplay}>둘러보기</ShoplyText>
          </View>
        </View>
        <PeopleStrip
          emptyTitle="소개할 에디터를 고르는 중이에요"
          emptyBody="공개 매거진이 준비되면 취향에 맞는 사람부터 보여드릴게요."
          issues={discover.data ?? []}
          loading={discover.isPending}
          onSubscribe={(issue) => subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })}
        />
        {discover.isError ? (
          <Pressable accessibilityRole="button" onPress={() => discover.refetch()} style={styles.retryButton}>
            <ShoplyText variant="labelMd" color="primary">둘러보기 다시 불러오기</ShoplyText>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroCover({ issue }: { issue: MagazineSummary }) {
  const theme = useShoplyTheme();
  const generating = isMagazineGeneratingStatus(issue.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.issueLabel}, ${issue.coverTitle ?? "쇼플리 매거진"} 열기`}
      onPress={() => openIssue(issue)}
      style={({ pressed }) => [styles.heroCard, { opacity: pressed ? 0.9 : 1, backgroundColor: theme.semantic.color.surfaceMuted }]}
    >
      {issue.coverImageUrl && !generating ? (
        <Image accessibilityLabel="잡지 표지" contentFit="cover" source={{ uri: issue.coverImageUrl }} style={StyleSheet.absoluteFill} transition={180} />
      ) : null}
      <View pointerEvents="none" style={styles.heroMonogram}>
        <ShoplySMonogram
          size={170}
          color={generating ? theme.semantic.color.primary : "rgba(255,255,255,0.24)"}
          style={generating ? { opacity: 0.14 } : undefined}
        />
      </View>
      <View style={styles.heroTop}>
        <View style={[styles.issueLabel, { backgroundColor: theme.semantic.color.primary }]}>
          <ShoplyText variant="caption" style={styles.inverseText}>{issue.issueLabel}</ShoplyText>
        </View>
        <ShoplyText variant="caption" style={generating ? { color: theme.semantic.color.primary } : styles.inverseText}>
          {generating ? "EDITING" : issue.baseLayout.toUpperCase()}
        </ShoplyText>
      </View>
      {generating ? (
        <View accessibilityLiveRegion="polite" style={styles.generatingCopy}>
          <ActivityIndicator color={theme.semantic.color.primary} size="large" />
          <ShoplyText style={[styles.generatingTitle, { color: theme.semantic.color.text }]}>생성중입니다.</ShoplyText>
          <ShoplyText variant="bodyMd" color="textMuted" align="center">
            이번 {issue.cadence === "weekly" ? "주" : "달"}의 활동과 취향을 한 권으로 편집하고 있어요.
          </ShoplyText>
        </View>
      ) : (
        <View style={[styles.heroCopy, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}>
          <ShoplyText style={styles.heroTitle} numberOfLines={2}>{issue.coverTitle ?? "SHOPLY EDIT"}</ShoplyText>
          <ShoplyText variant="caption" style={styles.inverseText} numberOfLines={2}>
            {issue.coverSubtitle ?? `${issue.itemCount}개의 취향을 편집한 이번 호`}
          </ShoplyText>
        </View>
      )}
    </Pressable>
  );
}

function PeopleStrip({
  issues,
  loading,
  emptyTitle,
  emptyBody,
  onSubscribe
}: {
  issues: MagazineSummary[];
  loading: boolean;
  emptyTitle: string;
  emptyBody: string;
  onSubscribe: (issue: MagazineSummary) => void;
}) {
  const people = uniquePeople(issues);
  if (loading) return <RowSkeleton />;
  if (!people.length) return <EmptyShelf title={emptyTitle} body={emptyBody} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleList}>
      {people.map((issue) => (
        <PersonTile key={issue.owner.userId} issue={issue} onSubscribe={() => onSubscribe(issue)} />
      ))}
    </ScrollView>
  );
}

function PersonTile({ issue, onSubscribe }: { issue: MagazineSummary; onSubscribe: () => void }) {
  const theme = useShoplyTheme();
  return (
    <View style={styles.personTile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${issue.owner.nickname} 프로필 열기`}
        onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: issue.owner.userId } })}
        style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
      >
        <View style={[styles.personPhoto, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
          {issue.owner.profileImageUrl ? (
            <Image accessibilityLabel={`${issue.owner.nickname} 프로필 사진`} contentFit="cover" source={{ uri: issue.owner.profileImageUrl }} style={StyleSheet.absoluteFill} />
          ) : (
            <ShoplySMonogram size={54} color={theme.semantic.color.primary} />
          )}
        </View>
        <ShoplyText variant="labelLg" numberOfLines={1} style={styles.personName}>@{issue.owner.nickname}</ShoplyText>
        <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>{issue.issueLabel}</ShoplyText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${issue.owner.nickname} ${issue.isSubscribed ? "구독 취소" : "구독"}`} onPress={onSubscribe} style={styles.subscribeAction}>
        <ShoplyText variant="caption" color="primary">{issue.isSubscribed ? "구독 중 · Pick" : "구독 + Pick"}</ShoplyText>
      </Pressable>
    </View>
  );
}

function uniquePeople(issues: MagazineSummary[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.owner.userId)) return false;
    seen.add(issue.owner.userId);
    return true;
  });
}

function EmptyShelf({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <ShoplyText variant="labelLg">{title}</ShoplyText>
      <ShoplyText variant="bodyMd" color="textMuted">{body}</ShoplyText>
    </View>
  );
}

function HeroSkeleton() {
  return <View style={{ paddingHorizontal: 20 }}><Skeleton height={500} radius={4} /></View>;
}

function RowSkeleton() {
  return <View style={styles.rowSkeleton}><Skeleton height={132} width={132} radius={18} /><Skeleton height={132} width={132} radius={18} /><Skeleton height={132} width={132} radius={18} /></View>;
}

function openIssue(issue: MagazineSummary) {
  captureActionEventsQuietly([{
    eventType: "magazine_open",
    targetType: "magazine_issue",
    targetId: issue.id,
    sourceSurface: "magazine_home"
  }]);
  router.push(`/magazine/${issue.id}` as Href);
}

const styles = StyleSheet.create({
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandCopy: { gap: 1 },
  cadenceTabs: { flexDirection: "row", gap: 6 },
  content: { gap: 16, paddingBottom: 120 },
  empty: { gap: 5, marginHorizontal: 20, minHeight: 96, paddingVertical: 24 },
  eyebrow: { letterSpacing: 1.5 },
  header: { paddingHorizontal: 20, paddingTop: 10 },
  heroCard: { height: 500, justifyContent: "space-between", marginRight: 14, overflow: "hidden", padding: 16, width: HERO_WIDTH },
  heroCopy: { gap: 7, padding: 16 },
  generatingCopy: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", paddingHorizontal: 28 },
  generatingTitle: { fontFamily: "Georgia", fontSize: 32, fontWeight: "700", lineHeight: 38 },
  heroList: { paddingHorizontal: 20 },
  heroMonogram: { left: -44, position: "absolute", top: 78 },
  heroTitle: { color: "#FFFFFF", fontFamily: "Georgia", fontSize: 34, fontWeight: "700", letterSpacing: -1.4, lineHeight: 37 },
  heroTop: { borderBottomColor: "rgba(255,255,255,0.65)", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 8 },
  inverseText: { color: "#FFFFFF" },
  issueLabel: { paddingHorizontal: 8, paddingVertical: 5 },
  peopleList: { gap: 14, paddingHorizontal: 20, paddingBottom: 4 },
  personName: { marginTop: 9 },
  personPhoto: { alignItems: "center", borderRadius: 18, height: 132, justifyContent: "center", overflow: "hidden", width: 132 },
  personTile: { width: 132 },
  pageTitle: { fontFamily: "Georgia", fontSize: 32, fontWeight: "700", lineHeight: 36 },
  retryButton: { alignSelf: "flex-start", marginHorizontal: 20, paddingVertical: 8 },
  rowSkeleton: { flexDirection: "row", gap: 14, overflow: "hidden", paddingHorizontal: 20 },
  sectionDisplay: { fontFamily: "Georgia", fontSize: 30, fontWeight: "700", lineHeight: 36 },
  sectionTop: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 32 },
  slogan: { letterSpacing: -0.1 },
  subscribeAction: { minHeight: 36, justifyContent: "center", paddingVertical: 6 }
});
