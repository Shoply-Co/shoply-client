import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { BookOpen, ChevronRight, Plus, Sparkles } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import {
  useDiscoverMagazines,
  useMagazineGenerationJob,
  useMyMagazines,
  useSubscribedMagazines,
  type MagazineSummary
} from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { useCreateMagazine } from "@/features/magazine-create";
import { useMagazineSubscription } from "@/features/magazine-subscribe";
import { userFacingErrorMessage } from "@/shared/api/errors";
import { ShoplySMonogram, ShoplyWordmark } from "@/shared/ui/brand";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_WIDTH = Math.min(350, SCREEN_WIDTH - 50);

export function MagazinesPage() {
  const theme = useShoplyTheme();
  const mine = useMyMagazines();
  const subscriptions = useSubscribedMagazines();
  const discover = useDiscoverMagazines();
  const createMagazine = useCreateMagazine();
  const subscription = useMagazineSubscription();
  const [cadence, setCadence] = useState<"weekly" | "monthly">("monthly");
  const [generation, setGeneration] = useState<{ issueId: string; jobId: string | null } | null>(null);
  const generationJob = useMagazineGenerationJob(generation?.jobId);

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

  useEffect(() => {
    if (!generation) return;
    const status = generation.jobId ? generationJob.data?.status : "ready";
    if (status === "ready" || status === "partial") {
      router.push(`/magazine/${generation.issueId}` as Href);
      setGeneration(null);
    } else if (status === "failed" || generationJob.isError) {
      Alert.alert("매거진 초안을 만들지 못했어요", "사용할 수 있는 리뷰가 있는지 확인한 뒤 다시 시도해주세요.");
      setGeneration(null);
    }
  }, [generation, generationJob.data?.status, generationJob.isError]);

  const creating = createMagazine.isPending || Boolean(generation);
  const createLabel = generationJob.data?.status === "ranking"
    ? "취향을 고르는 중"
    : generationJob.data?.status === "generating"
      ? "잡지를 편집하는 중"
      : generationJob.data?.status === "validating"
        ? "마지막 교정 중"
        : creating ? "초안을 만드는 중" : "새 매거진 만들기";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.semantic.color.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <ShoplySMonogram size={36} />
            <View>
              <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>PERSONAL FASHION PRESS</ShoplyText>
              <ShoplyText style={styles.pageTitle}>쇼플리</ShoplyText>
            </View>
          </View>
          <ShoplyWordmark width={108} style={{ opacity: 0.88 }} />
        </View>

        <View style={styles.createPanel}>
          <View style={{ flex: 1, gap: 5 }}>
            <ShoplyText variant="titleMd">내 취향이 한 권이 되는 순간</ShoplyText>
            <ShoplyText variant="bodyMd" color="textMuted">
              최근 게시물과 좋아요·보관 리뷰를 AI가 먼저 편집해드려요.
            </ShoplyText>
          </View>
          <Button
            accessibilityLabel="입력 없이 커스텀 매거진 초안 만들기"
            disabled={creating}
            icon={<Plus size={18} color={theme.semantic.color.textInverse} />}
            label={createLabel}
            onPress={async () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const result = await createMagazine.mutateAsync(cadence);
              setGeneration({ issueId: result.issueId, jobId: result.jobId ?? null });
            }}
          />
          {createMagazine.isError ? (
            <ShoplyText variant="caption" color="danger">
              {userFacingErrorMessage(createMagazine.error, "매거진 초안을 만들지 못했어요.")}
            </ShoplyText>
          ) : null}
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

        <MagazineShelf title={cadence === "monthly" ? "과월호" : "지난 주간호"} issues={mineByCadence[cadence]} />

        <View style={styles.sectionTop}>
          <View>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>FOLLOWING</ShoplyText>
            <ShoplyText style={styles.sectionDisplay}>구독</ShoplyText>
          </View>
        </View>
        <CreatorStrip
          emptyBody="마음에 드는 커스텀 매거진을 구독하면 최신호가 여기에 도착해요."
          issues={subscriptions.data ?? []}
          loading={subscriptions.isPending}
          onSubscribe={(issue) => subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })}
        />

        <View style={styles.sectionTop}>
          <View>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>DISCOVER EDITORS</ShoplyText>
            <ShoplyText style={styles.sectionDisplay}>둘러보기</ShoplyText>
          </View>
          <Sparkles size={24} color={theme.semantic.color.primary} />
        </View>
        <CreatorStrip
          emptyBody="공개된 커스텀 매거진이 준비되면 취향에 맞춰 추천할게요."
          issues={discover.data ?? []}
          loading={discover.isPending}
          onSubscribe={(issue) => subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })}
        />
        {discover.isError ? (
          <Button label="둘러보기 다시 불러오기" variant="secondary" onPress={() => discover.refetch()} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroCover({ issue }: { issue: MagazineSummary }) {
  const theme = useShoplyTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.issueLabel}, ${issue.coverTitle ?? "쇼플리 매거진"} 열기`}
      onPress={() => openIssue(issue)}
      style={({ pressed }) => [styles.heroCard, { opacity: pressed ? 0.9 : 1, backgroundColor: theme.semantic.color.surfaceMuted }]}
    >
      {issue.coverImageUrl ? (
        <Image accessibilityLabel="잡지 표지" contentFit="cover" source={{ uri: issue.coverImageUrl }} style={StyleSheet.absoluteFill} transition={180} />
      ) : null}
      <View pointerEvents="none" style={styles.heroMonogram}>
        <ShoplySMonogram size={170} color="rgba(255,255,255,0.24)" />
      </View>
      <View style={styles.heroTop}>
        <ShoplyText variant="caption" style={styles.inverseText}>{issue.issueLabel}</ShoplyText>
        <ShoplyText variant="caption" style={styles.inverseText}>{issue.baseLayout.toUpperCase()}</ShoplyText>
      </View>
      <View style={[styles.heroCopy, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}>
        <ShoplyText style={styles.heroTitle} numberOfLines={2}>{issue.coverTitle ?? "SHOPLY EDIT"}</ShoplyText>
        <ShoplyText variant="caption" style={styles.inverseText} numberOfLines={2}>
          {issue.coverSubtitle ?? `${issue.itemCount}개의 취향을 편집한 이번 호`}
        </ShoplyText>
      </View>
    </Pressable>
  );
}

function MagazineShelf({ title, issues }: { title: string; issues: MagazineSummary[] }) {
  const theme = useShoplyTheme();
  if (!issues.length) return null;
  return (
    <View style={styles.shelfSection}>
      <ShoplyText variant="titleMd">{title}</ShoplyText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfList}>
        {issues.map((issue, index) => (
          <Pressable
            key={issue.id}
            accessibilityRole="button"
            accessibilityLabel={`${issue.issueLabel} 열기`}
            onPress={() => openIssue(issue)}
            style={[styles.spine, {
              backgroundColor: index % 3 === 0 ? theme.semantic.color.primary : index % 3 === 1 ? theme.semantic.color.text : theme.semantic.color.surfaceMuted,
              borderColor: theme.semantic.color.border
            }]}
          >
            <ShoplyText variant="caption" style={{ color: index % 3 === 2 ? theme.semantic.color.text : theme.semantic.color.textInverse }} numberOfLines={2}>
              {issue.issueLabel}
            </ShoplyText>
            <ShoplySMonogram size={24} color={index % 3 === 2 ? theme.semantic.color.primary : "#FFFFFF"} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CreatorStrip({
  issues,
  loading,
  emptyBody,
  onSubscribe
}: {
  issues: MagazineSummary[];
  loading: boolean;
  emptyBody: string;
  onSubscribe: (issue: MagazineSummary) => void;
}) {
  if (loading) return <RowSkeleton />;
  if (!issues.length) return <EmptyShelf title="아직 도착한 잡지가 없어요" body={emptyBody} />;
  return (
    <View style={{ height: 376 }}>
      <FlashList
        data={issues}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CreatorIssueCard issue={item} onSubscribe={() => onSubscribe(item)} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      />
    </View>
  );
}

function CreatorIssueCard({ issue, onSubscribe }: { issue: MagazineSummary; onSubscribe: () => void }) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.creatorCard, { borderColor: theme.semantic.color.border, backgroundColor: theme.semantic.color.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${issue.owner.nickname}의 ${issue.issueLabel} 열기`} onPress={() => openIssue(issue)}>
        <View style={[styles.creatorCover, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
          {issue.coverImageUrl ? <Image accessibilityLabel="커스텀 잡지 표지" contentFit="cover" source={{ uri: issue.coverImageUrl }} style={StyleSheet.absoluteFill} /> : null}
          <View style={styles.miniCoverCopy}>
            <ShoplyText variant="caption" style={styles.inverseText}>{issue.issueLabel}</ShoplyText>
            <ShoplyText style={styles.miniCoverTitle} numberOfLines={3}>{issue.coverTitle ?? "CUSTOM ISSUE"}</ShoplyText>
          </View>
        </View>
        <View style={styles.creatorMeta}>
          <ShoplyText variant="labelLg" numberOfLines={1}>@{issue.owner.nickname}</ShoplyText>
          <ShoplyText variant="caption" color="textMuted">{issue.itemCount} stories · {issue.baseLayout}</ShoplyText>
        </View>
      </Pressable>
      <Button label={issue.isSubscribed ? "구독 중 · Pick" : "구독 + Pick"} size="sm" variant={issue.isSubscribed ? "secondary" : "primary"} onPress={onSubscribe} />
    </View>
  );
}

function EmptyShelf({ title, body }: { title: string; body: string }) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.empty, { borderColor: theme.semantic.color.border }]}>
      <BookOpen size={24} color={theme.semantic.color.primary} />
      <View style={{ flex: 1 }}>
        <ShoplyText variant="labelLg">{title}</ShoplyText>
        <ShoplyText variant="bodyMd" color="textMuted">{body}</ShoplyText>
      </View>
      <ChevronRight size={18} color={theme.semantic.color.textMuted} />
    </View>
  );
}

function HeroSkeleton() {
  return <View style={{ paddingHorizontal: 20 }}><Skeleton height={500} radius={4} /></View>;
}

function RowSkeleton() {
  return <View style={styles.rowSkeleton}><Skeleton height={330} width={220} radius={4} /><Skeleton height={330} width={220} radius={4} /></View>;
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
  cadenceTabs: { flexDirection: "row", gap: 6 },
  content: { gap: 16, paddingBottom: 120 },
  createPanel: { gap: 14, paddingHorizontal: 20, paddingVertical: 8 },
  creatorCard: { borderWidth: 1, marginRight: 12, padding: 8, width: 222 },
  creatorCover: { height: 260, justifyContent: "flex-end", overflow: "hidden" },
  creatorMeta: { gap: 2, paddingVertical: 10 },
  empty: { alignItems: "center", borderWidth: 1, flexDirection: "row", gap: 12, marginHorizontal: 20, minHeight: 96, padding: 16 },
  eyebrow: { letterSpacing: 1.5 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 10 },
  heroCard: { height: 500, justifyContent: "space-between", marginRight: 14, overflow: "hidden", padding: 16, width: HERO_WIDTH },
  heroCopy: { gap: 7, padding: 16 },
  heroList: { paddingHorizontal: 20 },
  heroMonogram: { left: -44, position: "absolute", top: 78 },
  heroTitle: { color: "#FFFFFF", fontFamily: "Georgia", fontSize: 34, fontWeight: "700", letterSpacing: -1.4, lineHeight: 37 },
  heroTop: { borderBottomColor: "rgba(255,255,255,0.65)", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 8 },
  inverseText: { color: "#FFFFFF" },
  miniCoverCopy: { backgroundColor: "rgba(5,5,7,0.58)", gap: 5, padding: 12 },
  miniCoverTitle: { color: "#FFFFFF", fontFamily: "Georgia", fontSize: 24, fontWeight: "700", lineHeight: 27 },
  pageTitle: { fontFamily: "Georgia", fontSize: 32, fontWeight: "700", lineHeight: 36 },
  rowSkeleton: { flexDirection: "row", gap: 12, paddingHorizontal: 20 },
  sectionDisplay: { fontFamily: "Georgia", fontSize: 30, fontWeight: "700", lineHeight: 36 },
  sectionTop: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 32 },
  shelfList: { gap: 7 },
  shelfSection: { gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  spine: { borderWidth: 1, height: 136, justifyContent: "space-between", padding: 10, width: 72 }
});
