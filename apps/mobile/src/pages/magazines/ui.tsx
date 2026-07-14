import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, KeyboardAwareBottomSheet, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import {
  useDiscoverMagazines,
  useMyMagazines,
  useSubscribedMagazines,
  isMagazineGeneratingStatus,
  type MagazineSummary
} from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { useCreateMagazine } from "@/features/magazine-create";
import { useMagazineSubscription } from "@/features/magazine-subscribe";
import { userFacingErrorMessage } from "@/shared/api/errors";
import type { MagazineLayout } from "@/shared/api/generated/shoply";
import { ShoplySMonogram } from "@/shared/ui/brand";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_WIDTH = Math.min(350, SCREEN_WIDTH - 50);

export function MagazinesPage() {
  const theme = useShoplyTheme();
  const mine = useMyMagazines();
  const subscriptions = useSubscribedMagazines();
  const discover = useDiscoverMagazines();
  const subscription = useMagazineSubscription();
  const createMagazine = useCreateMagazine();
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "edition">("monthly");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const mineByCadence = useMemo(() => ({
    monthly: (mine.data ?? []).filter((issue) => issue.issueType === "automatic" && issue.cadence === "monthly"),
    weekly: (mine.data ?? []).filter((issue) => issue.issueType === "automatic" && issue.cadence === "weekly"),
    edition: (mine.data ?? []).filter((issue) => issue.issueType === "custom")
  }), [mine.data]);
  const heroIssues = cadence === "edition" ? mineByCadence.edition : mineByCadence[cadence].slice(0, 4);

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
            <Chip label="에디션" selected={cadence === "edition"} onPress={() => setCadence("edition")} />
          </View>
        </View>

        {mine.isPending ? <HeroSkeleton /> : cadence === "edition" ? (
          <EditionShelf issues={heroIssues} onCreate={() => setTemplatePickerOpen(true)} />
        ) : heroIssues.length ? (
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

      <KeyboardAwareBottomSheet
        visible={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        accessibilityLabel="에디션 템플릿 선택 닫기"
        contentStyle={[styles.templateSheet, { backgroundColor: theme.semantic.color.surface }]}
      >
        <View style={styles.templateHeader}>
          <View style={{ flex: 1, gap: 3 }}>
            <ShoplyText variant="titleLg">에디션 템플릿</ShoplyText>
            <ShoplyText variant="bodyMd" color="textMuted">
              빈 지면만 만듭니다. 리뷰와 문장은 슬롯을 누를 때 직접 채울 수 있어요.
            </ShoplyText>
          </View>
          <Button
            accessibilityLabel="템플릿 선택 닫기"
            icon={<X size={19} color={theme.semantic.color.text} />}
            onPress={() => setTemplatePickerOpen(false)}
            size="icon"
            variant="tertiary"
          />
        </View>
        <View style={styles.templateList}>
          {(["atelier", "zine", "edit"] as MagazineLayout[]).map((layout) => (
            <TemplateCard
              key={layout}
              layout={layout}
              disabled={createMagazine.isPending}
              onPress={async () => {
                try {
                  void Haptics.selectionAsync();
                  const issue = await createMagazine.mutateAsync(layout);
                  setTemplatePickerOpen(false);
                  router.push(`/magazine/${issue.id}` as Href);
                } catch (error) {
                  Alert.alert("에디션을 만들지 못했어요", userFacingErrorMessage(error, "잠시 후 다시 시도해주세요."));
                }
              }}
            />
          ))}
        </View>
        {createMagazine.isPending ? (
          <View accessibilityLiveRegion="polite" style={styles.creatingRow}>
            <ActivityIndicator color={theme.semantic.color.primary} />
            <ShoplyText variant="bodyMd" color="textMuted">빈 지면을 준비하고 있어요.</ShoplyText>
          </View>
        ) : null}
      </KeyboardAwareBottomSheet>
    </SafeAreaView>
  );
}

function EditionShelf({ issues, onCreate }: { issues: MagazineSummary[]; onCreate: () => void }) {
  const theme = useShoplyTheme();
  return (
    <View accessibilityLabel="내 에디션 목록" style={styles.editionGrid}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="새 에디션 만들기"
        onPress={onCreate}
        style={({ pressed }) => [styles.createEditionTile, {
          backgroundColor: theme.semantic.color.primarySoft,
          borderColor: theme.semantic.color.primary,
          opacity: pressed ? 0.8 : 1
        }]}
      >
        <View style={[styles.createPlus, { backgroundColor: theme.semantic.color.primary }]}>
          <Plus size={25} color={theme.semantic.color.textInverse} />
        </View>
        <View style={{ gap: 3 }}>
          <ShoplyText variant="labelLg">새 에디션</ShoplyText>
          <ShoplyText variant="caption" color="textMuted">빈 템플릿으로 시작</ShoplyText>
        </View>
      </Pressable>
      {issues.map((issue) => <EditionTile key={issue.id} issue={issue} />)}
    </View>
  );
}

function EditionTile({ issue }: { issue: MagazineSummary }) {
  const theme = useShoplyTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.issueLabel}, ${issue.coverTitle ?? "나의 에디션"} 열기`}
      onPress={() => openIssue(issue)}
      style={({ pressed }) => [styles.editionTile, { backgroundColor: theme.semantic.color.surfaceMuted, opacity: pressed ? 0.86 : 1 }]}
    >
      {issue.coverImageUrl ? (
        <Image accessibilityLabel="에디션 표지" contentFit="cover" source={{ uri: issue.coverImageUrl }} style={StyleSheet.absoluteFill} transition={160} />
      ) : (
        <View pointerEvents="none" style={styles.editionMonogram}>
          <ShoplySMonogram size={94} color={theme.semantic.color.primary} style={{ opacity: 0.14 }} />
        </View>
      )}
      <View style={[styles.editionTopLine, { borderColor: issue.coverImageUrl ? "rgba(255,255,255,0.74)" : theme.semantic.color.borderStrong }]}>
        <ShoplyText variant="caption" style={issue.coverImageUrl ? styles.inverseText : undefined}>{issue.issueLabel}</ShoplyText>
        <ShoplyText variant="caption" style={issue.coverImageUrl ? styles.inverseText : { color: theme.semantic.color.primary }}>
          {issue.baseLayout.toUpperCase()}
        </ShoplyText>
      </View>
      <View style={[styles.editionCopy, issue.coverImageUrl ? { backgroundColor: theme.semantic.color.mediaScrimStrong } : null]}>
        <ShoplyText variant="titleMd" style={issue.coverImageUrl ? styles.inverseText : undefined} numberOfLines={2}>
          {issue.coverTitle ?? "나의 에디션"}
        </ShoplyText>
        <ShoplyText variant="caption" style={issue.coverImageUrl ? styles.inverseText : { color: theme.semantic.color.textMuted }}>
          {issue.itemCount ? `${issue.itemCount}개의 리뷰` : "빈 지면"}
        </ShoplyText>
      </View>
    </Pressable>
  );
}

function TemplateCard({ layout, disabled, onPress }: { layout: MagazineLayout; disabled: boolean; onPress: () => void }) {
  const theme = useShoplyTheme();
  const copy = layout === "atelier"
    ? ["Atelier", "큰 사진과 비대칭 여백의 하이패션 지면"]
    : layout === "zine"
      ? ["Zine", "크기와 각도가 다른 스트리트 콜라주"]
      : ["Edit", "제품과 문장을 또렷하게 읽는 룩북 그리드"];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy[0]} 템플릿 선택`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.templateCard, { borderColor: theme.semantic.color.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      <TemplatePreview layout={layout} />
      <View style={styles.templateCopy}>
        <ShoplyText variant="titleMd">{copy[0]}</ShoplyText>
        <ShoplyText variant="bodyMd" color="textMuted">{copy[1]}</ShoplyText>
      </View>
    </Pressable>
  );
}

function TemplatePreview({ layout }: { layout: MagazineLayout }) {
  const theme = useShoplyTheme();
  const blocks = layout === "atelier"
    ? [styles.previewLead, styles.previewSmall, styles.previewSmall]
    : layout === "zine"
      ? [styles.previewZineLead, styles.previewZineSmall, styles.previewZineWide]
      : [styles.previewEdit, styles.previewEdit, styles.previewEdit, styles.previewEdit];
  return (
    <View style={[styles.templatePreview, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
      {blocks.map((style, index) => (
        <View key={index} style={[styles.previewBlock, style, { backgroundColor: index === 0 ? theme.semantic.color.primary : theme.semantic.color.borderStrong }]} />
      ))}
    </View>
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
  createEditionTile: { alignItems: "center", borderStyle: "dashed", borderWidth: 1.5, gap: 13, height: 238, justifyContent: "center", padding: 16, width: "48%" },
  createPlus: { alignItems: "center", borderRadius: 999, height: 48, justifyContent: "center", width: 48 },
  creatingRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "center", minHeight: 44 },
  editionCopy: { gap: 3, padding: 11 },
  editionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 },
  editionMonogram: { left: -22, position: "absolute", top: 48 },
  editionTile: { height: 238, justifyContent: "space-between", overflow: "hidden", padding: 10, width: "48%" },
  editionTopLine: { borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 6 },
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
  previewBlock: { borderRadius: 1 },
  previewEdit: { height: 34, width: 29 },
  previewLead: { height: 46, width: 62 },
  previewSmall: { height: 25, width: 29 },
  previewZineLead: { height: 43, transform: [{ rotate: "-3deg" }], width: 36 },
  previewZineSmall: { height: 29, marginTop: 7, transform: [{ rotate: "4deg" }], width: 22 },
  previewZineWide: { height: 25, marginLeft: 10, transform: [{ rotate: "-2deg" }], width: 48 },
  retryButton: { alignSelf: "flex-start", marginHorizontal: 20, paddingVertical: 8 },
  rowSkeleton: { flexDirection: "row", gap: 14, overflow: "hidden", paddingHorizontal: 20 },
  sectionDisplay: { fontFamily: "Georgia", fontSize: 30, fontWeight: "700", lineHeight: 36 },
  sectionTop: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 32 },
  slogan: { letterSpacing: -0.1 },
  subscribeAction: { minHeight: 36, justifyContent: "center", paddingVertical: 6 },
  templateCard: { alignItems: "center", borderWidth: 1, flexDirection: "row", gap: 14, minHeight: 112, padding: 12 },
  templateCopy: { flex: 1, gap: 4 },
  templateHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  templateList: { gap: 10 },
  templatePreview: { flexDirection: "row", flexWrap: "wrap", gap: 4, height: 86, overflow: "hidden", padding: 5, width: 72 },
  templateSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16, maxHeight: "86%", padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 22 }
});
