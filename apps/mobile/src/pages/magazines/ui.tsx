import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue
} from "react-native-reanimated";
import {
  Button,
  KeyboardAwareBottomSheet,
  ShoplyText,
  Skeleton,
  useShoplyTheme
} from "@shoply/design-system";
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
import { ShoplySMonogram, ShoplyWordmark } from "@/shared/ui/brand";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_WIDTH = Math.min(350, SCREEN_WIDTH - 50);
const EDITION_GRID_WIDTH = SCREEN_WIDTH - 40;
const EDITION_GRID_GAP = 10;
const EDITION_NARROW_WIDTH = Math.floor((EDITION_GRID_WIDTH - EDITION_GRID_GAP) * 0.38);
const EDITION_WIDE_WIDTH = EDITION_GRID_WIDTH - EDITION_GRID_GAP - EDITION_NARROW_WIDTH - 2;
const EDITION_HALF_WIDTH = Math.floor((EDITION_GRID_WIDTH - EDITION_GRID_GAP - 2) / 2);
const TEMPLATE_CARD_WIDTH = SCREEN_WIDTH - 56;

export function MagazinesPage() {
  const theme = useShoplyTheme();
  const mine = useMyMagazines();
  const subscriptions = useSubscribedMagazines();
  const discover = useDiscoverMagazines();
  const subscription = useMagazineSubscription();
  const createMagazine = useCreateMagazine();
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "edition">("monthly");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const mineByCadence = useMemo(
    () => ({
      monthly: (mine.data ?? []).filter(
        (issue) => issue.issueType === "automatic" && issue.cadence === "monthly"
      ),
      weekly: (mine.data ?? []).filter(
        (issue) => issue.issueType === "automatic" && issue.cadence === "weekly"
      ),
      edition: (mine.data ?? []).filter((issue) => issue.issueType === "custom")
    }),
    [mine.data]
  );
  const heroIssues =
    cadence === "edition" ? mineByCadence.edition : mineByCadence[cadence].slice(0, 4);

  useEffect(() => {
    const visible = [
      ...heroIssues.slice(0, 2),
      ...(subscriptions.data ?? []).slice(0, 2),
      ...(discover.data ?? []).slice(0, 3)
    ];
    if (!visible.length) return;
    captureActionEventsQuietly(
      visible.map((issue) => ({
        eventType: "magazine_impression" as const,
        targetType: "magazine_issue",
        targetId: issue.id,
        sourceSurface: "magazine_home",
        payload: { issueType: issue.issueType, cadence: issue.cadence }
      }))
    );
    captureActionEventsQuietly(
      (subscriptions.data ?? []).slice(0, 4).map((issue) => ({
        eventType: "subscription_impression" as const,
        targetType: "magazine_series",
        targetId: issue.owner.userId,
        sourceSurface: "magazine_home",
        payload: { latestIssueId: issue.id }
      }))
    );
  }, [discover.data, heroIssues, subscriptions.data]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <MagazineMasthead scrollY={scrollY} />

        <EditorialSectionHeading index="01" eyebrow="MY PUBLICATION" title="내 잡지" />
        <CadenceSelector value={cadence} onChange={setCadence} />

        {mine.isPending ? (
          <HeroSkeleton />
        ) : cadence === "edition" ? (
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
            {heroIssues.map((issue, index) => (
              <HeroCover key={issue.id} issue={issue} index={index} />
            ))}
          </ScrollView>
        ) : (
          <EmptyShelf
            title="아직 이 주기의 잡지가 없어요"
            body="첫 자동호가 준비되면 이곳에 꽂아둘게요."
          />
        )}

        <EditorialSectionHeading index="02" eyebrow="FOLLOWING EDITORS" title="구독한 사람들" />
        <PeopleStrip
          emptyTitle="아직 구독한 사람이 없어요"
          emptyBody="둘러보기에서 마음에 드는 에디터를 구독해보세요."
          issues={subscriptions.data ?? []}
          loading={subscriptions.isPending}
          onSubscribe={(issue) =>
            subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })
          }
        />

        <EditorialSectionHeading index="03" eyebrow="HOT THIS MONTH" title="둘러보기" />
        <PeopleStrip
          emptyTitle="소개할 에디터를 고르는 중이에요"
          emptyBody="공개 매거진이 준비되면 취향에 맞는 사람부터 보여드릴게요."
          issues={discover.data ?? []}
          loading={discover.isPending}
          onSubscribe={(issue) =>
            subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })
          }
        />
        {discover.isError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => discover.refetch()}
            style={styles.retryButton}
          >
            <ShoplyText variant="labelMd" color="primary">
              둘러보기 다시 불러오기
            </ShoplyText>
          </Pressable>
        ) : null}
      </Animated.ScrollView>

      <KeyboardAwareBottomSheet
        visible={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        accessibilityLabel="에디션 템플릿 선택 닫기"
        contentStyle={[styles.templateSheet, { backgroundColor: theme.semantic.color.surface }]}
      >
        <View style={styles.templateHeader}>
          <View style={{ flex: 1, gap: 3 }}>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
              SELECT A LAYOUT
            </ShoplyText>
            <ShoplyText style={styles.templateSheetTitle}>첫 지면을 고르세요.</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              아직 어떤 리뷰도 선택하거나 문장을 만들지 않습니다.
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
        <ScrollView
          horizontal
          decelerationRate="fast"
          snapToInterval={TEMPLATE_CARD_WIDTH + 12}
          showsHorizontalScrollIndicator={false}
          style={styles.templateScroller}
          contentContainerStyle={styles.templateList}
        >
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
                  Alert.alert(
                    "에디션을 만들지 못했어요",
                    userFacingErrorMessage(error, "잠시 후 다시 시도해주세요.")
                  );
                }
              }}
            />
          ))}
        </ScrollView>
        {createMagazine.isPending ? (
          <View accessibilityLiveRegion="polite" style={styles.creatingRow}>
            <ActivityIndicator color={theme.semantic.color.primary} />
            <ShoplyText variant="bodyMd" color="textMuted">
              빈 지면을 준비하고 있어요.
            </ShoplyText>
          </View>
        ) : null}
      </KeyboardAwareBottomSheet>
    </SafeAreaView>
  );
}

function MagazineMasthead({ scrollY }: { scrollY: SharedValue<number> }) {
  const theme = useShoplyTheme();
  const reduceMotion = useReducedMotion();
  const wordmarkStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduceMotion
          ? -10
          : interpolate(scrollY.value, [0, 300], [-10, 46], Extrapolation.CLAMP)
      }
    ]
  }));
  return (
    <View style={[styles.masthead, { borderColor: theme.semantic.color.borderStrong }]}>
      <View style={styles.mastheadMeta}>
        <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
          SHOPLY EDITORIAL
        </ShoplyText>
        <ShoplyText variant="caption" color="textMuted">
          SEOUL · 2026
        </ShoplyText>
      </View>
      <View style={styles.mastheadWordmarkRail}>
        <Animated.View style={[styles.mastheadWordmarks, wordmarkStyle]}>
          <ShoplyWordmark width={260} />
          <ShoplyWordmark width={260} />
        </Animated.View>
      </View>
      <View style={styles.mastheadBottom}>
        <View style={styles.sloganBlock}>
          <ShoplyText style={styles.sloganDisplay}>쇼핑을</ShoplyText>
          <ShoplyText style={[styles.sloganDisplay, { color: theme.semantic.color.primary }]}>
            쇼핑답게.
          </ShoplyText>
        </View>
        <View style={[styles.mastheadNote, { borderColor: theme.semantic.color.borderStrong }]}>
          <ShoplySMonogram size={38} />
          <ShoplyText variant="caption" color="textMuted" style={styles.mastheadNoteCopy}>
            취향과 활동을{`\n`}한 권의 시선으로
          </ShoplyText>
        </View>
      </View>
    </View>
  );
}

function EditorialSectionHeading({
  index,
  eyebrow,
  title
}: {
  index: string;
  eyebrow: string;
  title: string;
}) {
  const theme = useShoplyTheme();
  return (
    <View style={styles.editorialHeading}>
      <View style={[styles.editorialIndex, { borderColor: theme.semantic.color.primary }]}>
        <ShoplyText variant="caption" color="primary">
          {index}
        </ShoplyText>
      </View>
      <View style={styles.editorialHeadingCopy}>
        <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
          {eyebrow}
        </ShoplyText>
        <ShoplyText style={styles.sectionDisplay}>{title}</ShoplyText>
      </View>
      <View style={[styles.headingRule, { backgroundColor: theme.semantic.color.borderStrong }]} />
    </View>
  );
}

type MagazineHomeTab = "monthly" | "weekly" | "edition";

function CadenceSelector({
  value,
  onChange
}: {
  value: MagazineHomeTab;
  onChange: (value: MagazineHomeTab) => void;
}) {
  const theme = useShoplyTheme();
  const tabs: Array<{ value: MagazineHomeTab; label: string; index: string }> = [
    { value: "monthly", label: "월간", index: "M" },
    { value: "weekly", label: "주간", index: "W" },
    { value: "edition", label: "에디션", index: "E" }
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.cadenceIndex, { borderColor: theme.semantic.color.borderStrong }]}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            style={({ pressed }) => [
              styles.cadenceTab,
              selected ? { borderBottomColor: theme.semantic.color.primary } : null,
              { opacity: pressed ? 0.62 : 1 }
            ]}
          >
            <ShoplyText
              variant="caption"
              style={{
                color: selected ? theme.semantic.color.primary : theme.semantic.color.textMuted
              }}
            >
              {tab.index}
            </ShoplyText>
            <ShoplyText
              variant="labelLg"
              style={{
                color: selected ? theme.semantic.color.text : theme.semantic.color.textMuted
              }}
            >
              {tab.label}
            </ShoplyText>
          </Pressable>
        );
      })}
    </View>
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
        style={({ pressed }) => [
          styles.createEditionTile,
          {
            backgroundColor: theme.semantic.color.primarySoft,
            borderColor: theme.semantic.color.primary,
            opacity: pressed ? 0.8 : 1
          }
        ]}
      >
        <View style={styles.createEditionMeta}>
          <ShoplyText variant="caption" color="primary">
            CREATE
          </ShoplyText>
          <ShoplyText variant="caption" color="primary">
            00
          </ShoplyText>
        </View>
        <Plus size={58} strokeWidth={1.1} color={theme.semantic.color.primary} />
        <View style={{ gap: 4 }}>
          <ShoplyText style={styles.createEditionTitle}>새{`\n`}에디션</ShoplyText>
          <ShoplyText variant="caption" color="textMuted">
            세 가지 빈 지면 중 선택
          </ShoplyText>
        </View>
      </Pressable>
      {issues.length ? (
        issues.map((issue, index) => <EditionTile key={issue.id} issue={issue} index={index} />)
      ) : (
        <View style={[styles.editionManifesto, { backgroundColor: "#111722" }]}>
          <ShoplyText variant="caption" style={styles.inverseText}>
            YOUR POINT OF VIEW
          </ShoplyText>
          <View style={styles.manifestoLines}>
            <View style={styles.manifestoLineShort} />
            <View style={styles.manifestoLine} />
            <View style={styles.manifestoLine} />
          </View>
          <ShoplyText style={styles.manifestoTitle}>빈칸부터{`\n`}당신답게.</ShoplyText>
          <ShoplyText variant="caption" style={styles.inverseMuted}>
            사진을 고르고, 문장을 다듬고, 직접 발행하세요.
          </ShoplyText>
        </View>
      )}
    </View>
  );
}

function EditionTile({ issue, index }: { issue: MagazineSummary; index: number }) {
  const theme = useShoplyTheme();
  const tileStyle =
    index === 0
      ? styles.editionTilePrimary
      : index % 4 === 3
        ? styles.editionTileWide
        : styles.editionTileSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.issueLabel}, ${issue.coverTitle ?? "나의 에디션"} 열기`}
      onPress={() => openIssue(issue)}
      style={({ pressed }) => [
        styles.editionTile,
        tileStyle,
        { backgroundColor: theme.semantic.color.surfaceMuted, opacity: pressed ? 0.86 : 1 }
      ]}
    >
      {issue.coverImageUrl ? (
        <Image
          accessibilityLabel="에디션 표지"
          contentFit="cover"
          source={{ uri: issue.coverImageUrl }}
          style={StyleSheet.absoluteFill}
          transition={160}
        />
      ) : (
        <View style={styles.editionMonogram}>
          <ShoplySMonogram
            size={94}
            color={theme.semantic.color.primary}
            style={{ opacity: 0.14 }}
          />
        </View>
      )}
      <View
        style={[
          styles.editionTopLine,
          {
            borderColor: issue.coverImageUrl
              ? "rgba(255,255,255,0.74)"
              : theme.semantic.color.borderStrong
          }
        ]}
      >
        <ShoplyText variant="caption" style={issue.coverImageUrl ? styles.inverseText : undefined}>
          {issue.issueLabel}
        </ShoplyText>
        <ShoplyText
          variant="caption"
          style={issue.coverImageUrl ? styles.inverseText : { color: theme.semantic.color.primary }}
        >
          {issue.baseLayout.toUpperCase()}
        </ShoplyText>
      </View>
      <ShoplyText
        style={[
          styles.editionSequence,
          issue.coverImageUrl ? styles.inverseText : { color: theme.semantic.color.primary }
        ]}
      >
        {String(index + 1).padStart(2, "0")}
      </ShoplyText>
      <View
        style={[
          styles.editionCopy,
          issue.coverImageUrl ? { backgroundColor: theme.semantic.color.mediaScrimStrong } : null
        ]}
      >
        <ShoplyText
          variant="titleMd"
          style={issue.coverImageUrl ? styles.inverseText : undefined}
          numberOfLines={2}
        >
          {issue.coverTitle ?? "나의 에디션"}
        </ShoplyText>
        <ShoplyText
          variant="caption"
          style={
            issue.coverImageUrl ? styles.inverseText : { color: theme.semantic.color.textMuted }
          }
        >
          {issue.itemCount ? `${issue.itemCount}개의 리뷰` : "빈 지면"}
        </ShoplyText>
      </View>
    </Pressable>
  );
}

function TemplateCard({
  layout,
  disabled,
  onPress
}: {
  layout: MagazineLayout;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useShoplyTheme();
  const copy =
    layout === "atelier"
      ? ["Atelier", "큰 사진과 비대칭 여백", "하이패션 에디토리얼"]
      : layout === "zine"
        ? ["Zine", "엇갈린 크기와 강한 리듬", "스트리트 콜라주"]
        : ["Edit", "정교한 제품·문장 비율", "쇼핑 룩북"];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy[0]} 템플릿 선택`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.templateCard,
        { borderColor: theme.semantic.color.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }
      ]}
    >
      <View style={styles.templateCardTop}>
        <View>
          <ShoplyText variant="caption" color="primary">
            0{layout === "atelier" ? 1 : layout === "zine" ? 2 : 3} / TEMPLATE
          </ShoplyText>
          <ShoplyText
            style={[styles.templateName, layout === "zine" ? styles.templateNameZine : null]}
          >
            {copy[0]}
          </ShoplyText>
        </View>
        <ShoplyText variant="caption" color="textMuted" align="right">
          {copy[2]}
          {`\n`}6-COLUMN GRID
        </ShoplyText>
      </View>
      <TemplatePreview layout={layout} />
      <View style={styles.templateCopy}>
        <ShoplyText variant="bodyMd">{copy[1]}</ShoplyText>
        <View style={[styles.templateSelect, { backgroundColor: theme.semantic.color.primary }]}>
          <ShoplyText variant="labelMd" style={styles.inverseText}>
            이 지면으로 시작
          </ShoplyText>
          <ShoplyText variant="labelMd" style={styles.inverseText}>
            →
          </ShoplyText>
        </View>
      </View>
    </Pressable>
  );
}

function TemplatePreview({ layout }: { layout: MagazineLayout }) {
  const theme = useShoplyTheme();
  return (
    <View
      style={[
        styles.templatePreview,
        {
          backgroundColor: theme.semantic.color.surfaceMuted,
          borderColor: theme.semantic.color.borderStrong
        }
      ]}
    >
      <View style={[styles.previewMasthead, { borderColor: theme.semantic.color.borderStrong }]}>
        <ShoplyText variant="caption" color="primary">
          SHOPLY / EDITIONS
        </ShoplyText>
        <ShoplyText variant="caption" color="textMuted">
          NO. 01
        </ShoplyText>
      </View>
      {layout === "atelier" ? (
        <View style={styles.atelierPreviewBody}>
          <View
            style={[styles.previewPhotoLead, { backgroundColor: theme.semantic.color.primary }]}
          />
          <View style={styles.previewTextColumn}>
            <View
              style={[styles.previewHeadline, { backgroundColor: theme.semantic.color.text }]}
            />
            <View
              style={[
                styles.previewTextLine,
                { backgroundColor: theme.semantic.color.borderStrong }
              ]}
            />
            <View
              style={[
                styles.previewTextLineShort,
                { backgroundColor: theme.semantic.color.borderStrong }
              ]}
            />
          </View>
          <View
            style={[
              styles.previewPhotoSmall,
              { backgroundColor: theme.semantic.color.borderStrong }
            ]}
          />
        </View>
      ) : layout === "zine" ? (
        <View style={styles.zinePreviewBody}>
          <View
            style={[styles.previewZinePhotoOne, { backgroundColor: theme.semantic.color.primary }]}
          />
          <View
            style={[styles.previewZinePhotoTwo, { backgroundColor: theme.semantic.color.text }]}
          />
          <View
            style={[
              styles.previewZinePhotoThree,
              { backgroundColor: theme.semantic.color.borderStrong }
            ]}
          />
          <ShoplyText style={[styles.previewZineType, { color: theme.semantic.color.primary }]}>
            NEW / VIEW
          </ShoplyText>
          <View style={[styles.previewZineRule, { backgroundColor: theme.semantic.color.text }]} />
        </View>
      ) : (
        <View style={styles.editPreviewBody}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={styles.previewProductCell}>
              <View
                style={[
                  styles.previewProductPhoto,
                  {
                    backgroundColor:
                      index === 0 ? theme.semantic.color.primary : theme.semantic.color.borderStrong
                  }
                ]}
              />
              <View
                style={[styles.previewProductTitle, { backgroundColor: theme.semantic.color.text }]}
              />
              <View
                style={[
                  styles.previewProductLine,
                  { backgroundColor: theme.semantic.color.borderStrong }
                ]}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function HeroCover({ issue, index }: { issue: MagazineSummary; index: number }) {
  const theme = useShoplyTheme();
  const generating = isMagazineGeneratingStatus(issue.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.issueLabel}, ${issue.coverTitle ?? "쇼플리 매거진"} 열기`}
      onPress={() => openIssue(issue)}
      style={({ pressed }) => [
        styles.heroCard,
        { opacity: pressed ? 0.9 : 1, backgroundColor: theme.semantic.color.surfaceMuted }
      ]}
    >
      {issue.coverImageUrl && !generating ? (
        <Image
          accessibilityLabel="잡지 표지"
          contentFit="cover"
          source={{ uri: issue.coverImageUrl }}
          style={StyleSheet.absoluteFill}
          transition={180}
        />
      ) : null}
      <View style={styles.heroMonogram}>
        <ShoplySMonogram
          size={170}
          color={generating ? theme.semantic.color.primary : "rgba(255,255,255,0.24)"}
          style={generating ? { opacity: 0.14 } : undefined}
        />
      </View>
      <View style={styles.heroSpine}>
        <ShoplyText
          variant="caption"
          style={generating ? { color: theme.semantic.color.textMuted } : styles.inverseText}
        >
          SHOPLY · ISSUE {String(index + 1).padStart(2, "0")}
        </ShoplyText>
      </View>
      <View style={styles.heroTop}>
        <View style={[styles.issueLabel, { backgroundColor: theme.semantic.color.primary }]}>
          <ShoplyText variant="caption" style={styles.inverseText}>
            {issue.issueLabel}
          </ShoplyText>
        </View>
        <ShoplyText
          variant="caption"
          style={generating ? { color: theme.semantic.color.primary } : styles.inverseText}
        >
          {generating ? "EDITING" : issue.baseLayout.toUpperCase()}
        </ShoplyText>
      </View>
      {generating ? (
        <View accessibilityLiveRegion="polite" style={styles.generatingCopy}>
          <ActivityIndicator color={theme.semantic.color.primary} size="large" />
          <ShoplyText style={[styles.generatingTitle, { color: theme.semantic.color.text }]}>
            생성중입니다.
          </ShoplyText>
          <ShoplyText variant="bodyMd" color="textMuted" align="center">
            이번 {issue.cadence === "weekly" ? "주" : "달"}의 활동과 취향을 한 권으로 편집하고
            있어요.
          </ShoplyText>
        </View>
      ) : (
        <View style={[styles.heroCopy, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}>
          <ShoplyText style={styles.heroTitle} numberOfLines={2}>
            {issue.coverTitle ?? "SHOPLY EDIT"}
          </ShoplyText>
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.peopleList}
    >
      {people.map((issue, index) => (
        <PersonTile
          key={issue.owner.userId}
          issue={issue}
          index={index}
          onSubscribe={() => onSubscribe(issue)}
        />
      ))}
    </ScrollView>
  );
}

function PersonTile({
  issue,
  index,
  onSubscribe
}: {
  issue: MagazineSummary;
  index: number;
  onSubscribe: () => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View style={styles.personTile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${issue.owner.nickname} 프로필 열기`}
        onPress={() =>
          router.push({ pathname: "/profile/[userId]", params: { userId: issue.owner.userId } })
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
      >
        <View style={[styles.personPhoto, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
          {issue.owner.profileImageUrl ? (
            <Image
              accessibilityLabel={`${issue.owner.nickname} 프로필 사진`}
              contentFit="cover"
              source={{ uri: issue.owner.profileImageUrl }}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <ShoplySMonogram size={54} color={theme.semantic.color.primary} />
          )}
          <View style={[styles.personIndex, { backgroundColor: theme.semantic.color.primary }]}>
            <ShoplyText variant="caption" style={styles.inverseText}>
              {String(index + 1).padStart(2, "0")}
            </ShoplyText>
          </View>
        </View>
        <ShoplyText variant="labelLg" numberOfLines={1} style={styles.personName}>
          @{issue.owner.nickname}
        </ShoplyText>
        <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
          {issue.issueLabel}
        </ShoplyText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${issue.owner.nickname} ${issue.isSubscribed ? "구독 취소" : "구독"}`}
        onPress={onSubscribe}
        style={styles.subscribeAction}
      >
        <ShoplyText variant="caption" color="primary">
          {issue.isSubscribed ? "구독 중 · Pick" : "구독 + Pick"}
        </ShoplyText>
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
      <ShoplyText variant="bodyMd" color="textMuted">
        {body}
      </ShoplyText>
    </View>
  );
}

function HeroSkeleton() {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Skeleton height={500} radius={4} />
    </View>
  );
}

function RowSkeleton() {
  return (
    <View style={styles.rowSkeleton}>
      <Skeleton height={132} width={132} radius={18} />
      <Skeleton height={132} width={132} radius={18} />
      <Skeleton height={132} width={132} radius={18} />
    </View>
  );
}

function openIssue(issue: MagazineSummary) {
  captureActionEventsQuietly([
    {
      eventType: "magazine_open",
      targetType: "magazine_issue",
      targetId: issue.id,
      sourceSurface: "magazine_home"
    }
  ]);
  router.push(`/magazine/${issue.id}` as Href);
}

const styles = StyleSheet.create({
  atelierPreviewBody: { flex: 1, padding: 12 },
  cadenceIndex: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginBottom: 18,
    marginHorizontal: 20
  },
  cadenceTab: {
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52
  },
  content: { paddingBottom: 132 },
  createEditionMeta: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  createEditionTile: {
    borderStyle: "dashed",
    borderWidth: 1.5,
    height: 268,
    justifyContent: "space-between",
    padding: 14,
    width: EDITION_NARROW_WIDTH
  },
  createEditionTitle: {
    fontFamily: "Georgia",
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 27
  },
  creatingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 44
  },
  editPreviewBody: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    padding: 12
  },
  editionCopy: { gap: 3, padding: 11 },
  editionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: EDITION_GRID_GAP,
    paddingHorizontal: 20
  },
  editionManifesto: {
    height: 268,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 16,
    width: EDITION_WIDE_WIDTH
  },
  editionMonogram: { left: -22, pointerEvents: "none", position: "absolute", top: 48 },
  editionSequence: {
    fontFamily: "Georgia",
    fontSize: 58,
    fontWeight: "700",
    left: 12,
    lineHeight: 62,
    opacity: 0.28,
    position: "absolute",
    top: 54
  },
  editionTile: { justifyContent: "space-between", overflow: "hidden", padding: 10 },
  editionTilePrimary: { height: 268, width: EDITION_WIDE_WIDTH },
  editionTileSecondary: { height: 244, width: EDITION_HALF_WIDTH },
  editionTileWide: { height: 214, width: EDITION_GRID_WIDTH },
  editionTopLine: {
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6
  },
  editorialHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 54
  },
  editorialHeadingCopy: { gap: 1 },
  editorialIndex: {
    alignItems: "center",
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  empty: { gap: 6, marginHorizontal: 20, minHeight: 116, paddingVertical: 32 },
  eyebrow: { letterSpacing: 1.5 },
  headingRule: { flex: 1, height: StyleSheet.hairlineWidth, marginLeft: 4 },
  heroCard: {
    height: 520,
    justifyContent: "space-between",
    marginRight: 14,
    overflow: "hidden",
    padding: 16,
    width: HERO_WIDTH
  },
  heroCopy: { gap: 7, marginLeft: 18, padding: 16 },
  generatingCopy: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 28
  },
  generatingTitle: { fontFamily: "Georgia", fontSize: 32, fontWeight: "700", lineHeight: 38 },
  heroList: { paddingHorizontal: 20 },
  heroMonogram: { left: -44, pointerEvents: "none", position: "absolute", top: 78 },
  heroSpine: {
    bottom: 116,
    left: -53,
    pointerEvents: "none",
    position: "absolute",
    transform: [{ rotate: "-90deg" }],
    width: 132
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: "Georgia",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.4,
    lineHeight: 37
  },
  heroTop: {
    borderBottomColor: "rgba(255,255,255,0.65)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8
  },
  inverseText: { color: "#FFFFFF" },
  inverseMuted: { color: "rgba(255,255,255,0.65)" },
  issueLabel: { paddingHorizontal: 8, paddingVertical: 5 },
  manifestoLine: { backgroundColor: "rgba(255,255,255,0.22)", height: 1, width: "100%" },
  manifestoLines: { gap: 7 },
  manifestoLineShort: { backgroundColor: "rgba(255,255,255,0.5)", height: 2, width: "48%" },
  manifestoTitle: {
    color: "#FFFFFF",
    fontFamily: "Georgia",
    fontSize: 31,
    fontWeight: "700",
    letterSpacing: -1.1,
    lineHeight: 34
  },
  masthead: {
    borderBottomWidth: 1,
    marginHorizontal: 20,
    overflow: "hidden",
    paddingBottom: 22,
    paddingTop: 12
  },
  mastheadBottom: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4
  },
  mastheadMeta: { flexDirection: "row", justifyContent: "space-between" },
  mastheadNote: { alignItems: "flex-end", borderLeftWidth: 1, gap: 8, paddingLeft: 12 },
  mastheadNoteCopy: { lineHeight: 17, textAlign: "right" },
  mastheadWordmarkRail: {
    height: 110,
    justifyContent: "center",
    marginHorizontal: -20,
    overflow: "hidden",
    pointerEvents: "none"
  },
  mastheadWordmarks: { alignItems: "center", flexDirection: "row", gap: 12, width: 532 },
  peopleList: { gap: 12, paddingBottom: 4, paddingHorizontal: 20 },
  personIndex: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    left: 8,
    position: "absolute",
    top: 8,
    width: 30
  },
  personName: { marginTop: 9 },
  personPhoto: {
    alignItems: "center",
    height: 144,
    justifyContent: "center",
    overflow: "hidden",
    width: 144
  },
  personTile: { width: 144 },
  previewHeadline: { height: 8, width: "88%" },
  previewMasthead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10
  },
  previewPhotoLead: { height: 168, width: "68%" },
  previewPhotoSmall: { bottom: 16, height: 76, position: "absolute", right: 12, width: "37%" },
  previewProductCell: { gap: 5, width: "47%" },
  previewProductLine: { height: 3, width: "72%" },
  previewProductPhoto: { aspectRatio: 0.95, width: "100%" },
  previewProductTitle: { height: 6, width: "92%" },
  previewTextColumn: { gap: 8, position: "absolute", right: 12, top: 32, width: "28%" },
  previewTextLine: { height: 3, width: "100%" },
  previewTextLineShort: { height: 3, width: "60%" },
  previewZinePhotoOne: {
    height: 154,
    left: 10,
    position: "absolute",
    top: 18,
    transform: [{ rotate: "-3deg" }],
    width: "56%"
  },
  previewZinePhotoThree: {
    bottom: 15,
    height: 78,
    left: 42,
    position: "absolute",
    transform: [{ rotate: "2deg" }],
    width: "36%"
  },
  previewZinePhotoTwo: {
    height: 116,
    position: "absolute",
    right: 8,
    top: 68,
    transform: [{ rotate: "4deg" }],
    width: "40%"
  },
  previewZineRule: {
    bottom: 26,
    height: 3,
    position: "absolute",
    right: 12,
    transform: [{ rotate: "-4deg" }],
    width: "36%"
  },
  previewZineType: {
    bottom: 44,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1.2,
    position: "absolute",
    right: 8,
    transform: [{ rotate: "-4deg" }]
  },
  retryButton: { alignSelf: "flex-start", marginHorizontal: 20, paddingVertical: 8 },
  rowSkeleton: { flexDirection: "row", gap: 12, overflow: "hidden", paddingHorizontal: 20 },
  sectionDisplay: {
    fontFamily: "Georgia",
    fontSize: 31,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 36
  },
  sloganBlock: { gap: 0 },
  sloganDisplay: {
    fontFamily: "Georgia",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.5,
    lineHeight: 36
  },
  subscribeAction: { minHeight: 36, justifyContent: "center", paddingVertical: 6 },
  templateCard: {
    borderWidth: 1,
    gap: 12,
    height: 470,
    marginRight: 12,
    padding: 12,
    width: TEMPLATE_CARD_WIDTH
  },
  templateCardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  templateCopy: { gap: 10 },
  templateHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  templateList: { paddingRight: 20 },
  templateName: {
    fontFamily: "Georgia",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 38
  },
  templateNameZine: {
    fontFamily: undefined,
    fontWeight: "900",
    letterSpacing: -2,
    textTransform: "uppercase"
  },
  templatePreview: { borderWidth: StyleSheet.hairlineWidth, height: 292, overflow: "hidden" },
  templateSelect: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 14
  },
  templateSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
    height: "88%",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20
  },
  templateScroller: { flex: 1 },
  templateSheetTitle: {
    fontFamily: "Georgia",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 33
  },
  zinePreviewBody: { flex: 1, position: "relative" }
});
