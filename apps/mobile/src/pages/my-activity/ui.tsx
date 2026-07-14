import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, SlidersHorizontal, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import {
  mapApiReviewSummary,
  mediaReviews,
  ReviewTile,
  useReviewTileVideoPreview
} from "@/entities/review";
import type { ReviewSummary } from "@/entities/review";
import { apiRequest } from "@/shared/api/client";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { AdaptiveStickyHeader } from "@/shared/ui/adaptive-sticky-header";
import type { ReviewSummary as ApiReviewSummary } from "@/shared/api/generated/shoply";

interface PageResult<T> {
  data: T[];
  page?: {
    limit?: number;
    nextCursor?: string | null;
  };
}

const activityTabs = [
  { id: "viewed", label: "방문한" },
  { id: "saved", label: "보관" },
  { id: "liked", label: "좋아요한" }
] as const;

const contentScopes = [
  { id: "all", label: "전체" },
  { id: "review", label: "리뷰" },
  { id: "shopi", label: "쇼피" },
  { id: "linking", label: "링킹" }
] as const;

const sortOptions = [
  { id: "recent", label: "최신순" },
  { id: "likes", label: "좋아요순" },
  { id: "linkClicks", label: "링크클릭순" }
] as const;

type ActivityTab = (typeof activityTabs)[number]["id"];
type ContentScope = (typeof contentScopes)[number]["id"];
type SortOption = (typeof sortOptions)[number]["id"];

export function MyActivityPage() {
  const theme = useShoplyTheme();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const params = useLocalSearchParams<{ type?: string }>();
  const { user } = useSession();
  const listRef = useRef<FlashListRef<ReviewSummary>>(null);
  const [activityType, setActivityType] = useState<ActivityTab>(normalizeActivityType(params.type));
  const [contentScope, setContentScope] = useState<ContentScope>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftActivityType, setDraftActivityType] = useState<ActivityTab>("viewed");
  const [draftContentScope, setDraftContentScope] = useState<ContentScope>("all");
  const [draftSortBy, setDraftSortBy] = useState<SortOption>("recent");
  const videoPreview = useReviewTileVideoPreview();
  const activeFilterCount =
    Number(activityType !== "viewed") +
    Number(contentScope !== "all") +
    Number(sortBy !== "recent");

  useEffect(() => {
    setActivityType(normalizeActivityType(params.type));
  }, [params.type]);

  const reviewsQuery = useQuery({
    queryKey: ["users", "me", "activity", "reviews", activityType],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await apiRequest<
        PageResult<ApiReviewSummary & { _activityTypes?: string[] }>
      >(`/users/me/activity/reviews?type=${activityType}&limit=120`, { unwrapEnvelope: false });
      return mediaReviews(response.data.map((review, index) => mapApiReviewSummary(review, index)));
    },
    placeholderData: keepPreviousData,
    retry: 1
  });

  const reviews = reviewsQuery.data ?? [];
  const showActivitySkeleton =
    Boolean(user) && (reviewsQuery.isPending || reviewsQuery.isPlaceholderData);
  const displayedReviews = useMemo(
    () =>
      sortReviews(
        reviews.filter((review) => {
          if (contentScope === "shopi") return false;
          if (contentScope === "linking") return review.hasLinks;
          return true;
        }),
        sortBy
      ),
    [contentScope, reviews, sortBy]
  );

  const openFilters = () => {
    setDraftActivityType(activityType);
    setDraftContentScope(contentScope);
    setDraftSortBy(sortBy);
    setFiltersOpen(true);
  };

  const closeFilters = () => {
    setFiltersOpen(false);
  };

  const resetDraftFilters = () => {
    setDraftActivityType("viewed");
    setDraftContentScope("all");
    setDraftSortBy("recent");
  };

  const applyDraftFilters = () => {
    setActivityType(draftActivityType);
    setContentScope(draftContentScope);
    setSortBy(draftSortBy);
    setFiltersOpen(false);
  };

  useLayoutEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activityType]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <AdaptiveStickyHeader scrollY={scrollY} style={styles.stickyHeader}>
        <View style={styles.topBar}>
          <IconButton
            accessibilityLabel="뒤로 가기"
            onPress={() => goBackOrReplace()}
            icon={<ArrowLeft size={22} color={theme.semantic.color.text} />}
          />
          <ShoplyText variant="titleLg" style={{ flex: 1 }}>
            활동 목록
          </ShoplyText>
          <Button
            size="icon"
            variant={activeFilterCount ? "primary" : "secondary"}
            accessibilityLabel="활동 필터 열기"
            onPress={openFilters}
            icon={
              <SlidersHorizontal
                size={19}
                color={activeFilterCount ? "white" : theme.semantic.color.primary}
              />
            }
          />
        </View>
      </AdaptiveStickyHeader>
      <FlashList
        ref={listRef}
        data={user && !showActivitySkeleton ? displayedReviews : []}
        numColumns={3}
        extraData={videoPreview.activePreviewReviewId}
        keyExtractor={(item) => item.id}
        viewabilityConfig={videoPreview.viewabilityConfig}
        onViewableItemsChanged={videoPreview.onViewableItemsChanged}
        onScroll={onScroll}
        renderItem={({ item }) => (
          <ReviewTile
            review={item}
            columns={3}
            videoPreviewActive={videoPreview.activePreviewReviewId === item.id}
            onPress={() =>
              router.push({ pathname: "/review/[reviewId]", params: { reviewId: item.id } })
            }
          />
        )}
        onScrollBeginDrag={videoPreview.pausePreview}
        onMomentumScrollBegin={videoPreview.pausePreview}
        onScrollEndDrag={videoPreview.resumePreview}
        onMomentumScrollEnd={videoPreview.resumePreview}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !user ? (
            <StatePanel
              title="로그인이 필요해요"
              body="로그인 후 활동 목록을 확인할 수 있어요."
              actionLabel="로그인"
              onAction={() => router.push("/login")}
            />
          ) : showActivitySkeleton ? (
            <ActivityGridSkeleton />
          ) : reviewsQuery.isError ? (
            <StatePanel
              title="활동 목록을 불러오지 못했어요"
              body="잠시 후 다시 시도해주세요."
              actionLabel="다시 시도"
              onAction={() => {
                void reviewsQuery.refetch();
              }}
            />
          ) : (
            <StatePanel
              title="표시할 게시글이 없어요"
              body="선택한 조건에 맞는 활동 게시글이 없습니다."
            />
          )
        }
      />

      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={closeFilters}>
        <Pressable style={styles.modalBackdrop} onPress={closeFilters} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.semantic.color.surface },
            theme.semantic.shadow.overlay
          ]}
        >
          <View style={styles.sheetHeader}>
            <ShoplyText variant="titleMd">필터</ShoplyText>
            <Button
              size="icon"
              variant="tertiary"
              accessibilityLabel="활동 필터 닫기"
              onPress={closeFilters}
              icon={<X size={18} color={theme.semantic.color.text} />}
            />
          </View>
          <FilterGroup title="콘텐츠">
            {contentScopes.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draftContentScope === item.id}
                onPress={() => setDraftContentScope(item.id)}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="활동">
            {activityTabs.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draftActivityType === item.id}
                onPress={() => setDraftActivityType(item.id)}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="정렬">
            {sortOptions.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draftSortBy === item.id}
                onPress={() => setDraftSortBy(item.id)}
              />
            ))}
          </FilterGroup>
          <View style={styles.sheetActions}>
            <Button
              label="초기화"
              variant="tertiary"
              onPress={resetDraftFilters}
              style={{ flex: 1 }}
            />
            <Button label="필터 적용" onPress={applyDraftFilters} style={{ flex: 1 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActivityGridSkeleton() {
  return (
    <View style={styles.skeletonGrid} accessibilityLabel="활동 목록 불러오는 중">
      {Array.from({ length: 12 }, (_, index) => (
        <View key={index} style={styles.skeletonTile}>
          <Skeleton height="100%" radius={4} />
        </View>
      ))}
    </View>
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress
}: {
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.68 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.filterGroup}>
      <ShoplyText variant="labelMd">{title}</ShoplyText>
      <View style={styles.sheetChips}>{children}</View>
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
  return (
    <View style={styles.emptyPanel}>
      <ShoplyText variant="labelLg" align="center">
        {title}
      </ShoplyText>
      <ShoplyText variant="caption" color="textMuted" align="center">
        {body}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

function normalizeActivityType(value?: string): ActivityTab {
  return activityTabs.some((item) => item.id === value) ? (value as ActivityTab) : "viewed";
}

function sortReviews(reviews: ReviewSummary[], sortBy: SortOption) {
  const next = [...reviews];
  if (sortBy === "likes") return next.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  if (sortBy === "linkClicks")
    return next.sort((a, b) => (b.linkClicks ?? 0) - (a.linkClicks ?? 0));
  return next.sort(
    (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 6,
    paddingBottom: 120
  },
  emptyPanel: {
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    minHeight: 420,
    padding: 32
  },
  filterGroup: {
    gap: 9
  },
  iconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  modalBackdrop: {
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    gap: 18,
    left: 0,
    padding: 18,
    paddingBottom: 34,
    position: "absolute",
    right: 0
  },
  sheetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingTop: 2
  },
  skeletonTile: {
    aspectRatio: 3 / 4,
    flexBasis: "32%",
    flexGrow: 1,
    margin: 1.5,
    overflow: "hidden"
  },
  stickyHeader: {
    paddingVertical: 2
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10
  }
});
