import { FlashList, type FlashListRef, type ViewToken } from "@shopify/flash-list";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { Button, Chip, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useReviewCategoryTree } from "@/entities/catalog";
import {
  createReviewDetailFeedKey,
  ReviewTile,
  setReviewDetailFeedContext,
  type ReviewSummary,
  useHomeReviews,
  useReviewTileVideoPreview,
  useReviewActivityState
} from "@/entities/review";
import { useSession } from "@/app/providers/session-provider";
import { ShoplyHomeWordmark } from "@/shared/ui/brand";
import { captureActionEventsQuietly } from "@/features/event-capture";

export function HomeSectionList() {
  const theme = useShoplyTheme();
  const { user } = useSession();
  const navigation = useNavigation<any>();
  const listRef = useRef<FlashListRef<ReviewSummary>>(null);
  const pendingScrollTopRef = useRef(false);
  const impressedReviewIdsRef = useRef(new Set<string>());
  const [selectedCategoryId, setSelectedCategoryId] = useState("recommended");
  const [refreshSeedsByCategory, setRefreshSeedsByCategory] = useState<Record<string, string>>(
    () => ({
      recommended: createFeedRefreshSeed()
    })
  );
  const categoryQuery = useReviewCategoryTree();
  const categoryOptions = categoryQuery.data ?? [];
  const activityQuery = useReviewActivityState(Boolean(user));
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullRefreshSawFetchRef = useRef(false);
  const videoPreview = useReviewTileVideoPreview();
  const categoryTabs = useMemo(
    () => [
      { id: "recommended", name: "추천", slug: "recommended", serverId: null },
      ...categoryOptions.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        serverId: category.id
      }))
    ],
    [categoryOptions]
  );
  const selectedCategory =
    categoryTabs.find((item) => item.id === selectedCategoryId) ?? categoryTabs[0];
  const refreshSeed =
    refreshSeedsByCategory[selectedCategory.id] ?? refreshSeedsByCategory.recommended ?? "stable";
  const {
    data: serverReviews,
    isError,
    isFetching,
    isPending,
    isPlaceholderData,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch
  } = useHomeReviews(selectedCategory.serverId, refreshSeed, user?.id);
  const reviews = serverReviews ?? [];
  const showGridSkeleton =
    isPending || (isPlaceholderData && !pullRefreshing && !isFetchingNextPage);

  const scrollToFeedTop = useCallback(
    (animated = false) => {
      videoPreview.pausePreview();
      pendingScrollTopRef.current = true;
      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated });
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
          pendingScrollTopRef.current = false;
        });
      });
    },
    [videoPreview.pausePreview]
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (navigation.isFocused()) {
        scrollToFeedTop(true);
      }
    });
    return unsubscribe;
  }, [navigation, scrollToFeedTop]);

  useEffect(() => {
    scrollToFeedTop(false);
  }, [selectedCategoryId, scrollToFeedTop]);

  useEffect(() => {
    if (!pullRefreshing) {
      pullRefreshSawFetchRef.current = false;
      return;
    }
    if (isFetching && !isFetchingNextPage) {
      pullRefreshSawFetchRef.current = true;
      return;
    }
    if (pullRefreshSawFetchRef.current) {
      setPullRefreshing(false);
      pullRefreshSawFetchRef.current = false;
    }
  }, [isFetching, isFetchingNextPage, pullRefreshing]);

  const displayedReviews = useMemo(
    () =>
      reviews.map((review) => ({
        ...review,
        viewerActivity: activityQuery.data?.[review.id]
      })),
    [activityQuery.data, reviews]
  );

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken<ReviewSummary>[] }) => {
      videoPreview.onViewableItemsChanged(info);
      const newImpressions = info.viewableItems
        .filter((token) => token.isViewable && !impressedReviewIdsRef.current.has(token.item.id))
        .map((token) => {
          impressedReviewIdsRef.current.add(token.item.id);
          return {
            eventType: "feed_impression" as const,
            targetType: "review",
            targetId: token.item.id,
            reviewId: token.item.id,
            sourceSurface: "home",
            payload: {
              categoryId: selectedCategory.serverId,
              position: token.index ?? null
            }
          };
        });
      captureActionEventsQuietly(newImpressions);
    },
    [selectedCategory.serverId, videoPreview.onViewableItemsChanged]
  );

  const selectCategory = (categoryId: string) => {
    if (categoryId === selectedCategory.id) {
      scrollToFeedTop(true);
      return;
    }
    videoPreview.pausePreview();
    impressedReviewIdsRef.current.clear();
    setSelectedCategoryId(categoryId);
    setRefreshSeedsByCategory((current) =>
      current[categoryId] ? current : { ...current, [categoryId]: createFeedRefreshSeed() }
    );
  };

  const openReviewDetail = (reviewId: string, index: number) => {
    const feedKey = createReviewDetailFeedKey("home");
    setReviewDetailFeedContext({
      key: feedKey,
      source: "home",
      selectedReviewId: reviewId,
      initialIndex: index,
      reviews: displayedReviews,
      home: {
        categoryId: selectedCategory.serverId,
        refreshSeed,
        userId: user?.id
      }
    });
    router.push({ pathname: "/review/[reviewId]", params: { reviewId, feedKey } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.semantic.color.background }}>
      <FlashList
        ref={listRef}
        data={showGridSkeleton ? [] : displayedReviews}
        numColumns={2}
        extraData={videoPreview.activePreviewReviewId}
        keyExtractor={(item) => item.id}
        drawDistance={1600}
        getItemType={() => "home-review-tile"}
        maxItemsInRecyclePool={18}
        viewabilityConfig={videoPreview.viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.brandRow}>
              <ShoplyHomeWordmark />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {categoryTabs.map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  selected={selectedCategory.id === item.id}
                  onPress={() => selectCategory(item.id)}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListFooterComponent={
          displayedReviews.length ? (
            <View style={styles.footerSpacer}>
              {isFetchingNextPage ? (
                <ActivityIndicator color={theme.semantic.color.primary} />
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ReviewTile
            review={item}
            columns={2}
            videoPreviewActive={videoPreview.activePreviewReviewId === item.id}
            onPress={() => openReviewDetail(item.id, index)}
          />
        )}
        ListEmptyComponent={
          showGridSkeleton || (isFetching && !displayedReviews.length) ? (
            <ReviewGridSkeleton columns={2} count={8} />
          ) : isError ? (
            <StatePanel
              title="리뷰를 불러오지 못했어요"
              body="잠시 후 다시 시도해주세요."
              actionLabel="다시 시도"
              onAction={() => {
                void refetch();
              }}
            />
          ) : (
            <StatePanel
              title="리뷰가 아직 없어요"
              body="다른 카테고리를 둘러보거나 잠시 후 다시 확인해주세요."
            />
          )
        }
        contentContainerStyle={styles.listContent}
        refreshing={pullRefreshing}
        onRefresh={() => {
          pullRefreshSawFetchRef.current = false;
          setPullRefreshing(true);
          videoPreview.pausePreview();
          setRefreshSeedsByCategory((current) => ({
            ...current,
            [selectedCategory.id]: createFeedRefreshSeed()
          }));
        }}
        onScrollBeginDrag={videoPreview.pausePreview}
        onMomentumScrollBegin={videoPreview.pausePreview}
        onScrollEndDrag={videoPreview.resumePreview}
        onMomentumScrollEnd={videoPreview.resumePreview}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
          }
        }}
        onEndReachedThreshold={1.2}
        onContentSizeChange={() => {
          if (pendingScrollTopRef.current) {
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
            pendingScrollTopRef.current = false;
          }
        }}
        scrollIndicatorInsets={{ bottom: 108 }}
      />
    </View>
  );
}

function createFeedRefreshSeed() {
  return `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    <View style={styles.empty}>
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

function ReviewGridSkeleton({ columns, count }: { columns: 2 | 3; count: number }) {
  const theme = useShoplyTheme();
  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonTile,
            {
              flexBasis: columns === 2 ? "46%" : "31%",
              margin: columns === 2 ? 4 : 1.5
            }
          ]}
        >
          <View style={styles.skeletonMedia}>
            <Skeleton height="100%" radius={columns === 2 ? theme.semantic.radius.sm : 4} />
          </View>
          {columns === 2 ? (
            <View style={styles.skeletonText}>
              <Skeleton width="78%" height={14} />
              <Skeleton width="52%" height={12} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    alignItems: "flex-start"
  },
  headerWrap: {
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 8
  },
  chips: {
    gap: 8,
    paddingRight: 10
  },
  listContent: {
    paddingBottom: 112,
    paddingHorizontal: 6
  },
  footerSpacer: {
    alignItems: "center",
    height: 42,
    justifyContent: "center"
  },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 40
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 6,
    paddingTop: 6
  },
  skeletonText: {
    gap: 7,
    paddingHorizontal: 2,
    paddingTop: 8
  },
  skeletonTile: {
    flexGrow: 1
  },
  skeletonMedia: {
    aspectRatio: 3 / 4,
    overflow: "hidden"
  }
});
