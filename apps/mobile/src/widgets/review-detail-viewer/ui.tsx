import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useEventListener } from "expo";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  ImageIcon,
  Images,
  MoreHorizontal,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX,
  X
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  Modal,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Share,
  StyleSheet,
  View
} from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Button, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import { openOutboundReviewLink } from "@/features/outbound-link-open";
import {
  buildGalleryInteractionEvent,
  buildMediaConsumptionEvent,
  buildReviewConsumptionEvent,
  buildReviewImpressionEvent,
  captureActionEventsQuietly,
  captureConsumptionEvent,
  type ConsumptionStage
} from "@/features/event-capture";
import {
  DisclosureBadge,
  getReviewDetailFeedContext,
  LinkSticker,
  submitReviewReport,
  useReviewActivityState,
  useHomeReviews,
  useReviewDetail,
  useReviewReportReasons,
  useSearchReviews,
  useToggleReviewInteraction
} from "@/entities/review";
import type {
  ReviewInteractionType,
  ReviewLinkSticker,
  ReviewMediaItem,
  ReviewSummary
} from "@/entities/review";
import { formatWon } from "@/shared/lib/money";
import { ShoplySpark } from "@/shared/ui/brand";
import { AnimatedActionButton } from "./animated-action-button";

interface ReviewDetailViewerProps {
  reviewId?: string;
  feedKey?: string | string[];
}

const screen = Dimensions.get("window");
const DETAIL_ACTION_BUTTON_HIT_SIZE = 44;
const DETAIL_ACTION_BUTTON_GAP = 2;
const DETAIL_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 70, minimumViewTime: 1000 };
const DETAIL_ACTION_ICON_SIZE = 21;
const DETAIL_ACTION_ICON_STROKE = "#FFFFFF";
const DETAIL_ACTION_BUTTON_COUNT = 5;
const DETAIL_ACTION_STACK_HEIGHT =
  DETAIL_ACTION_BUTTON_HIT_SIZE * DETAIL_ACTION_BUTTON_COUNT +
  DETAIL_ACTION_BUTTON_GAP * (DETAIL_ACTION_BUTTON_COUNT - 1);
const DETAIL_ACTION_STACK_TOP = Math.round(
  Math.max(156, screen.height * 0.5 - DETAIL_ACTION_STACK_HEIGHT / 2)
);
const DETAIL_MUTE_BUTTON_TOP = Math.round(Math.max(104, DETAIL_ACTION_STACK_TOP - 54));

export function ReviewDetailViewer({ reviewId, feedKey }: ReviewDetailViewerProps) {
  const theme = useShoplyTheme();
  const { user } = useSession();
  const bodySheetRef = useRef<BottomSheetModal>(null);
  const feedContext = useMemo(() => getReviewDetailFeedContext(feedKey), [feedKey]);
  const emptySearchFilters = useMemo(() => ({ query: "" }), []);
  const {
    data: loadedReview,
    isError,
    isFetching,
    refetch: refetchReview
  } = useReviewDetail(reviewId);
  const activityQuery = useReviewActivityState(Boolean(user));
  const reportReasonsQuery = useReviewReportReasons();
  const interactionMutation = useToggleReviewInteraction();
  const shouldUseHomeFeed = !feedContext || feedContext.source === "home";
  const homeFeedQuery = useHomeReviews(
    feedContext?.home?.categoryId,
    feedContext?.home?.refreshSeed,
    feedContext?.home?.userId ?? user?.id,
    { enabled: shouldUseHomeFeed }
  );
  const searchFeedQuery = useSearchReviews(
    feedContext?.source === "search"
      ? (feedContext.search?.filters ?? emptySearchFilters)
      : emptySearchFilters,
    feedContext?.source === "search" ? feedContext.search?.refreshSeed : undefined,
    { enabled: feedContext?.source === "search" }
  );
  const feedReviews =
    feedContext?.source === "search" ? (searchFeedQuery.data ?? []) : (homeFeedQuery.data ?? []);
  const isFeedError =
    feedContext?.source === "search" ? searchFeedQuery.isError : homeFeedQuery.isError;
  const isFeedFetching =
    feedContext?.source === "search" ? searchFeedQuery.isFetching : homeFeedQuery.isFetching;
  const isFetchingNextFeedPage =
    feedContext?.source === "search"
      ? searchFeedQuery.isFetchingNextPage
      : homeFeedQuery.isFetchingNextPage;
  const hasNextFeedPage =
    feedContext?.source === "search" ? searchFeedQuery.hasNextPage : homeFeedQuery.hasNextPage;
  const fetchNextFeedPage =
    feedContext?.source === "search" ? searchFeedQuery.fetchNextPage : homeFeedQuery.fetchNextPage;
  const refetchFeed =
    feedContext?.source === "search" ? searchFeedQuery.refetch : homeFeedQuery.refetch;
  const data = useMemo(() => {
    const mergedFeed = mergeDetailReviews(feedContext?.reviews ?? [], feedReviews);
    const withLoadedReview = loadedReview
      ? replaceOrPrependReview(mergedFeed, loadedReview)
      : mergedFeed;
    if (!loadedReview && reviewId && !(feedContext?.reviews.length ?? 0)) return [];
    const withActivity = (reviews: ReviewSummary[]) =>
      reviews.map((review) => ({
        ...review,
        viewerActivity: {
          ...review.viewerActivity,
          ...activityQuery.data?.[review.id]
        }
      }));
    if (!withLoadedReview.length && reviewId) return [];
    return withActivity(withLoadedReview);
  }, [activityQuery.data, feedContext?.reviews, feedReviews, loadedReview, reviewId]);
  const initialScrollIndex = useMemo(() => {
    if (!data.length) return 0;
    const targetId = reviewId ?? feedContext?.selectedReviewId;
    const index = data.findIndex((review) => review.id === targetId);
    if (index >= 0) return index;
    return Math.min(feedContext?.initialIndex ?? 0, data.length - 1);
  }, [data, feedContext?.initialIndex, feedContext?.selectedReviewId, reviewId]);
  const [revealedReviewId, setRevealedReviewId] = useState<string | null>(null);
  const [mediaIndexByReviewId, setMediaIndexByReviewId] = useState<Record<string, number>>({});
  const [activityOverride, setActivityOverride] = useState<
    Record<string, { liked?: boolean; saved?: boolean }>
  >({});
  const [mutedByMediaId, setMutedByMediaId] = useState<Record<string, boolean>>({});
  const [pausedByMediaId, setPausedByMediaId] = useState<Record<string, boolean>>({});
  const [videoSeekActive, setVideoSeekActive] = useState(false);
  const [reportingReview, setReportingReview] = useState<ReviewSummary | null>(null);
  const [readingReview, setReadingReview] = useState<ReviewSummary | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState(reviewId ?? null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const readingReviewQuery = useReviewDetail(readingReview?.id);
  const sheetReview = readingReviewQuery.data ?? readingReview;
  const bodySheetSnapPoints = useMemo(() => ["42%", "76%"], []);
  const hasBlockingError = reviewId ? isError && !data.length : isFeedError;
  const isLoading = (isFetching && !data.length) || (isFeedFetching && !data.length);
  const selectedSummaryNeedsDetail = Boolean(
    reviewId &&
    isFetching &&
    !loadedReview &&
    data.some((review) => review.id === reviewId && !hasCreatorNickname(review))
  );
  const sourceSurface = feedContext?.source ?? "review_detail";
  const sheetReviewId = sheetReview?.id;
  const captureBodyConsumptionStage = useCallback(
    (stage: ConsumptionStage, activeMs: number, scrollDepth?: number) => {
      if (!sheetReviewId) return;
      captureConsumptionEvent(
        buildReviewConsumptionEvent({
          reviewId: sheetReviewId,
          sourceSurface,
          contentMode: "text",
          stage,
          activeMs,
          scrollDepth
        })
      );
    },
    [sheetReviewId, sourceSurface]
  );
  const activeReview = useMemo(
    () => data.find((review) => review.id === activeReviewId),
    [activeReviewId, data]
  );
  const activeReviewMedia = useMemo(() => {
    if (!activeReview) return undefined;
    const media = reviewMediaForDisplay(activeReview);
    return media[
      Math.min(mediaIndexByReviewId[activeReview.id] ?? 0, Math.max(0, media.length - 1))
    ];
  }, [activeReview, mediaIndexByReviewId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setAppIsActive(state === "active")
    );
    return () => subscription.remove();
  }, []);
  const renderSheetBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.52}
        pressBehavior="close"
      />
    ),
    []
  );
  const handleViewableReviewsChanged = useCallback(
    ({
      viewableItems
    }: {
      viewableItems: Array<{ isViewable?: boolean; item: ReviewSummary }>;
    }) => {
      const nextReview = viewableItems.find((entry) => entry.isViewable)?.item;
      if (nextReview?.id) setActiveReviewId(nextReview.id);
    },
    []
  );

  useEffect(() => {
    if (!activeReview || !appIsActive) return;
    captureActionEventsQuietly([
      {
        eventType: "review_open",
        targetType: "review",
        targetId: activeReview.id,
        reviewId: activeReview.id,
        sourceSurface
      }
    ]);
    captureConsumptionEvent(
      buildReviewImpressionEvent({
        reviewId: activeReview.id,
        sourceSurface,
        visibleRatio: 0.7,
        visibleMs: DETAIL_VIEWABILITY_CONFIG.minimumViewTime
      })
    );
  }, [activeReview, appIsActive, sourceSurface]);

  useEffect(() => {
    if (!activeReview || !appIsActive) return;
    const media = reviewMediaForDisplay(activeReview);
    const contentMode = reviewContentMode(activeReview);
    if (!activeReviewMedia || activeReviewMedia.mediaType !== "image") return;
    const qualifiedTimer = setTimeout(() => {
      captureConsumptionEvent(
        buildMediaConsumptionEvent({
          reviewId: activeReview.id,
          mediaId: activeReviewMedia.id,
          mediaType: "image",
          sourceSurface,
          stage: "qualified",
          activeMs: 3000,
          visibleRatio: 0.7
        })
      );
      captureConsumptionEvent(
        buildReviewConsumptionEvent({
          reviewId: activeReview.id,
          sourceSurface,
          contentMode,
          stage: "qualified",
          activeMs: 3000,
          visibleRatio: 0.7,
          mediaCount: media.length
        })
      );
    }, 3000);
    const deepTimer = setTimeout(() => {
      captureConsumptionEvent(
        buildMediaConsumptionEvent({
          reviewId: activeReview.id,
          mediaId: activeReviewMedia.id,
          mediaType: "image",
          sourceSurface,
          stage: "deep",
          activeMs: 6000,
          visibleRatio: 0.7
        })
      );
      captureConsumptionEvent(
        buildReviewConsumptionEvent({
          reviewId: activeReview.id,
          sourceSurface,
          contentMode,
          stage: "deep",
          activeMs: 6000,
          visibleRatio: 0.7,
          mediaCount: media.length
        })
      );
    }, 6000);
    return () => {
      clearTimeout(qualifiedTimer);
      clearTimeout(deepTimer);
    };
  }, [activeReview, activeReviewMedia, appIsActive, sourceSurface]);
  const retryLoad = () => {
    if (reviewId) void refetchReview();
    void refetchFeed();
  };

  const reveal = useCallback(
    (review: ReviewSummary) => {
      setRevealedReviewId(review.id);
      captureActionEventsQuietly([
        {
          eventType: "link_revealed",
          targetType: "review",
          targetId: review.id,
          reviewId: review.id,
          sourceSurface: feedContext?.source ?? "review_detail"
        }
      ]);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [feedContext?.source]
  );

  const setReviewMediaIndex = useCallback(
    (targetReviewId: string, index: number, action: "swipe" | "select" = "select") => {
      const review = data.find((candidate) => candidate.id === targetReviewId);
      const media = review ? reviewMediaForDisplay(review) : [];
      const previousIndex = mediaIndexByReviewId[targetReviewId] ?? 0;
      const selectedMedia = media[index];
      setMediaIndexByReviewId((state) => ({
        ...state,
        [targetReviewId]: index
      }));
      if (selectedMedia && index !== previousIndex) {
        captureConsumptionEvent(
          buildGalleryInteractionEvent({
            reviewId: targetReviewId,
            mediaId: selectedMedia.id,
            sourceSurface,
            action,
            mediaCount: media.length,
            fromIndex: previousIndex,
            toIndex: index
          })
        );
      }
      void Haptics.selectionAsync();
    },
    [data, mediaIndexByReviewId, sourceSurface]
  );

  const toggleVideoMuted = useCallback((mediaId: string) => {
    setMutedByMediaId((state) => ({
      ...state,
      [mediaId]: !(state[mediaId] ?? true)
    }));
    void Haptics.selectionAsync();
  }, []);

  const toggleVideoPlayback = useCallback((mediaId: string) => {
    setPausedByMediaId((state) => ({
      ...state,
      [mediaId]: !(state[mediaId] ?? false)
    }));
    void Haptics.selectionAsync();
  }, []);

  const openCreatorProfile = useCallback((review: ReviewSummary) => {
    if (!review.authorId) return;
    bodySheetRef.current?.dismiss();
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: review.authorId }
    });
  }, []);

  const openBodySheet = useCallback((review: ReviewSummary) => {
    setReadingReview(review);
    void Haptics.selectionAsync();
  }, []);

  useEffect(() => {
    if (readingReview) {
      bodySheetRef.current?.present();
    }
  }, [readingReview]);

  const requireUser = useCallback(() => {
    if (user) return true;
    Alert.alert("로그인이 필요해요", "로그인 후 사용할 수 있습니다.", [
      { text: "취소", style: "cancel" },
      { text: "로그인", onPress: () => router.push("/login") }
    ]);
    return false;
  }, [user]);

  const toggleInteraction = useCallback(
    (review: ReviewSummary, interactionType: ReviewInteractionType) => {
      if (!requireUser()) return;
      const key = interactionType === "like" ? "liked" : "saved";
      const current = activityOverride[review.id]?.[key] ?? review.viewerActivity?.[key] ?? false;
      const next = !current;
      setActivityOverride((state) => ({
        ...state,
        [review.id]: {
          ...state[review.id],
          [key]: next
        }
      }));
      interactionMutation.mutate(
        { reviewId: review.id, interactionType, active: next },
        {
          onSuccess: () => {
            captureActionEventsQuietly([
              {
                eventType:
                  interactionType === "like"
                    ? next
                      ? "like_added"
                      : "like_removed"
                    : next
                      ? "save_added"
                      : "save_removed",
                targetType: "review",
                targetId: review.id,
                reviewId: review.id,
                sourceSurface: "review_detail"
              }
            ]);
          },
          onError: (error) => {
            setActivityOverride((state) => ({
              ...state,
              [review.id]: {
                ...state[review.id],
                [key]: current
              }
            }));
            Alert.alert(
              interactionType === "like" ? "좋아요 실패" : "보관 실패",
              error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
            );
          }
        }
      );
    },
    [activityOverride, interactionMutation, requireUser]
  );

  const shareReview = useCallback(async (review: ReviewSummary) => {
    const shareUrl = `shoply://review/${review.id}`;
    try {
      await Share.share({
        title: review.productName,
        message: `${review.productName}\n${review.body}\n${shareUrl}`,
        url: shareUrl
      });
      captureActionEventsQuietly([
        {
          eventType: "share",
          targetType: "review",
          targetId: review.id,
          reviewId: review.id,
          sourceSurface: "review_detail"
        }
      ]);
    } catch (error) {
      Alert.alert(
        "공유 실패",
        error instanceof Error ? error.message : "공유를 다시 시도해주세요."
      );
    }
  }, []);

  const openSticker = useCallback((review: ReviewSummary, sticker: ReviewLinkSticker) => {
    Alert.alert("상품 링크 열기", `${sticker.merchantName}\n${sticker.domain}`, [
      { text: "취소", style: "cancel" },
      {
        text: "열기",
        onPress: () => {
          captureActionEventsQuietly([
            {
              eventType: "link_open_confirmed",
              targetType: "review_link",
              targetId: sticker.id,
              reviewId: review.id,
              linkId: sticker.id,
              sourceSurface: "review_detail"
            }
          ]);
          void openOutboundReviewLink(sticker);
        }
      }
    ]);
  }, []);

  const reportReview = useCallback(
    (review: ReviewSummary) => {
      if (!requireUser()) return;
      setReportingReview(review);
    },
    [requireUser]
  );

  const sendReport = useCallback(
    async (reasonCode: string) => {
      if (!reportingReview || reportSubmitting) return;
      setReportSubmitting(true);
      try {
        await submitReviewReport(reportingReview.id, reasonCode);
        captureActionEventsQuietly([
          {
            eventType: "report",
            targetType: "review",
            targetId: reportingReview.id,
            reviewId: reportingReview.id,
            sourceSurface: "review_detail",
            payload: { reasonCode }
          }
        ]);
        setReportingReview(null);
        Alert.alert("신고 접수", "검토를 위해 신고가 접수됐어요.");
      } catch (error) {
        Alert.alert(
          "신고 실패",
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
        );
      } finally {
        setReportSubmitting(false);
      }
    },
    [reportSubmitting, reportingReview]
  );

  if (selectedSummaryNeedsDetail) {
    return (
      <View style={styles.loadingDetailScreen}>
        <DetailSkeleton />
        <View style={styles.fixedBackButton}>
          <BackIconButton color="white" />
        </View>
      </View>
    );
  }

  if (!data.length) {
    if (isLoading) {
      return (
        <View style={styles.loadingDetailScreen}>
          <DetailSkeleton />
          <View style={styles.fixedBackButton}>
            <BackIconButton color="white" />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.emptyScreen, { backgroundColor: theme.semantic.color.background }]}>
        <BackIconButton color={theme.semantic.color.text} />
        <ImageIcon size={36} color={theme.semantic.color.textMuted} />
        <ShoplyText variant="titleMd" align="center">
          {hasBlockingError ? "리뷰를 불러오지 못했어요" : "리뷰가 아직 없어요"}
        </ShoplyText>
        <ShoplyText variant="bodyMd" color="textMuted" align="center">
          {hasBlockingError ? "잠시 후 다시 시도해주세요." : "아직 표시할 리뷰가 없습니다."}
        </ShoplyText>
        {hasBlockingError ? (
          <Button label="다시 시도" variant="secondary" onPress={retryLoad} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.semantic.color.background }}>
      <FlashList
        key={`review-detail-${feedContext?.key ?? reviewId ?? "feed"}`}
        data={data}
        keyExtractor={(item) => item.id}
        decelerationRate="fast"
        disableIntervalMomentum
        drawDistance={screen.height * 3}
        getItemType={() => "review-detail-page"}
        initialScrollIndex={initialScrollIndex}
        maxItemsInRecyclePool={8}
        pagingEnabled
        scrollEnabled={!videoSeekActive}
        snapToAlignment="start"
        snapToInterval={screen.height}
        ListFooterComponent={isFetchingNextFeedPage ? <DetailFooterSkeleton /> : null}
        onEndReached={() => {
          if (hasNextFeedPage && !isFetchingNextFeedPage) {
            void fetchNextFeedPage();
          }
        }}
        onEndReachedThreshold={1.35}
        onViewableItemsChanged={handleViewableReviewsChanged}
        viewabilityConfig={DETAIL_VIEWABILITY_CONFIG}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const revealed = revealedReviewId === item.id;
          const creatorLabel = creatorHandle(item.creatorNickname);
          const mediaItems = reviewMediaForDisplay(item);
          const activeMediaIndex = Math.min(
            mediaIndexByReviewId[item.id] ?? 0,
            Math.max(0, mediaItems.length - 1)
          );
          const activeMedia = mediaItems[activeMediaIndex];
          const activeVideoMuted = activeMedia
            ? (mutedByMediaId[activeMedia.id] ?? activeMedia.mutedByDefault ?? true)
            : true;
          const activeVideoPlaying = activeMedia
            ? !(pausedByMediaId[activeMedia.id] ?? false)
            : false;
          const brandSummary = compactIdentitySummary(reviewBrandNames(item));
          const merchantSummary = compactIdentitySummary(item.merchantSiteNames ?? []);
          const hasExpandableBody = isExpandableReviewBody(item.body);
          const isLiked = Boolean(activityOverride[item.id]?.liked ?? item.viewerActivity?.liked);
          const isSaved = Boolean(activityOverride[item.id]?.saved ?? item.viewerActivity?.saved);
          const visibleStickers = item.stickers.filter(
            (sticker) => !sticker.mediaId || !activeMedia?.id || sticker.mediaId === activeMedia.id
          );

          return (
            <View style={[styles.page, { height: screen.height }]}>
              <ReviewMediaCarousel
                media={mediaItems}
                activeIndex={activeMediaIndex}
                mutedByMediaId={mutedByMediaId}
                pausedByMediaId={pausedByMediaId}
                reviewId={item.id}
                reviewActive={item.id === activeReviewId && appIsActive}
                sourceSurface={sourceSurface}
                videoSeekActive={videoSeekActive}
                onReveal={() => reveal(item)}
                onSelect={(index, action) => setReviewMediaIndex(item.id, index, action)}
                onVideoSeekActiveChange={setVideoSeekActive}
              />
              <View pointerEvents="none" style={styles.scrim} />

              {activeMedia?.mediaType === "video" ? (
                <VideoMuteButton
                  muted={activeVideoMuted}
                  onPress={() => toggleVideoMuted(activeMedia.id)}
                />
              ) : null}

              {visibleStickers.length ? (
                <View
                  pointerEvents="box-none"
                  style={[styles.stickerFrame, getContainedMediaFrame(activeMedia)]}
                >
                  {visibleStickers.map((sticker) => (
                    <Animated.View
                      key={sticker.id}
                      entering={FadeIn.duration(180)}
                      exiting={FadeOut.duration(120)}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="box-none"
                    >
                      <LinkSticker
                        sticker={sticker}
                        revealed={revealed}
                        onPress={() => openSticker(item, sticker)}
                      />
                    </Animated.View>
                  ))}
                </View>
              ) : null}

              {revealed && visibleStickers.length ? (
                <Animated.View
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(120)}
                  style={styles.revealHint}
                >
                  <ShoplySpark size={18} />
                  <ShoplyText variant="caption" style={styles.whiteText}>
                    사진 속 상품 링크를 표시했어요
                  </ShoplyText>
                </Animated.View>
              ) : null}

              <MediaPagerControls
                media={mediaItems}
                activeIndex={activeMediaIndex}
                onSelect={(index) => {
                  if (index !== activeMediaIndex) {
                    setReviewMediaIndex(item.id, index);
                  }
                }}
              />

              <View style={styles.actions}>
                {activeMedia?.mediaType === "video" ? (
                  <AnimatedActionButton
                    label={activeVideoPlaying ? "영상 일시정지" : "영상 재생"}
                    active={activeVideoPlaying}
                    emphasis="primary"
                    icon={
                      activeVideoPlaying ? (
                        <Pause size={DETAIL_ACTION_ICON_SIZE} color="white" fill="white" />
                      ) : (
                        <Play size={DETAIL_ACTION_ICON_SIZE} color="white" fill="white" />
                      )
                    }
                    onPress={() => toggleVideoPlayback(activeMedia.id)}
                  />
                ) : null}
                <AnimatedActionButton
                  label="좋아요"
                  active={isLiked}
                  icon={
                    <Heart
                      size={DETAIL_ACTION_ICON_SIZE}
                      color={DETAIL_ACTION_ICON_STROKE}
                      fill={isLiked ? theme.semantic.color.reactionFill : "transparent"}
                    />
                  }
                  onPress={() => toggleInteraction(item, "like")}
                />
                <AnimatedActionButton
                  label="보관"
                  active={isSaved}
                  icon={
                    <Bookmark
                      size={DETAIL_ACTION_ICON_SIZE}
                      color={DETAIL_ACTION_ICON_STROKE}
                      fill={isSaved ? theme.semantic.color.primary : "transparent"}
                    />
                  }
                  onPress={() => toggleInteraction(item, "save")}
                />
                <AnimatedActionButton
                  label="공유"
                  icon={<Share2 size={DETAIL_ACTION_ICON_SIZE} color={DETAIL_ACTION_ICON_STROKE} />}
                  onPress={() => void shareReview(item)}
                />
                <AnimatedActionButton
                  label="신고하기"
                  icon={<Flag size={DETAIL_ACTION_ICON_SIZE} color={DETAIL_ACTION_ICON_STROKE} />}
                  onPress={() => reportReview(item)}
                />
              </View>

              <View style={styles.bottomInfo}>
                <View style={styles.creatorRow}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={
                      creatorLabel ? `${creatorLabel} 프로필 보기` : "작성자 프로필 보기"
                    }
                    disabled={!item.authorId}
                    onPress={(event) => {
                      event.stopPropagation();
                      openCreatorProfile(item);
                    }}
                    style={({ pressed }) => [
                      styles.creatorProfileLink,
                      { opacity: pressed ? 0.72 : 1 }
                    ]}
                  >
                    <CreatorAvatar review={item} size="sm" inverse />
                    {creatorLabel ? (
                      <ShoplyText
                        variant="labelLg"
                        style={[styles.whiteText, styles.creatorHandleText]}
                        numberOfLines={1}
                      >
                        {creatorLabel}
                      </ShoplyText>
                    ) : (
                      <Skeleton
                        width={104}
                        height={18}
                        radius={999}
                        style={styles.darkSkeletonStrong}
                      />
                    )}
                  </Pressable>
                  {item.creatorBadge ? (
                    <View style={styles.creatorBadge}>
                      <ShoplyText variant="caption" style={styles.whiteText} numberOfLines={1}>
                        {item.creatorBadge}
                      </ShoplyText>
                    </View>
                  ) : null}
                </View>
                <ShoplyText variant="titleLg" style={styles.whiteText}>
                  {item.productName}
                </ShoplyText>
                {brandSummary ? (
                  <ShoplyText
                    variant="caption"
                    style={[styles.whiteText, styles.brandNameText]}
                    numberOfLines={1}
                  >
                    브랜드 · {brandSummary}
                  </ShoplyText>
                ) : null}
                {merchantSummary ? (
                  <ShoplyText
                    variant="caption"
                    style={[styles.whiteText, styles.brandNameText]}
                    numberOfLines={1}
                  >
                    구매처 · {merchantSummary}
                  </ShoplyText>
                ) : null}
                <View style={styles.purchaseLine}>
                  {item.price > 0 ? (
                    <ShoplyText variant="labelMd" style={styles.whiteText} numberOfLines={1}>
                      {formatWon(item.price)}
                    </ShoplyText>
                  ) : null}
                  <DisclosureBadge state={item.disclosureState} compact inverse />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="리뷰 본문 보기"
                  onPress={(event) => {
                    event.stopPropagation();
                    openBodySheet(item);
                  }}
                  style={({ pressed }) => [
                    styles.bodyPreviewButton,
                    { opacity: pressed ? 0.74 : 1 }
                  ]}
                >
                  <ShoplyText
                    variant="bodyMd"
                    style={[styles.whiteText, styles.bodyPreviewText]}
                    numberOfLines={2}
                  >
                    {item.body}
                  </ShoplyText>
                  {hasExpandableBody ? (
                    <View style={styles.bodyMorePill}>
                      <MoreHorizontal size={16} color="white" />
                    </View>
                  ) : null}
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.fixedBackButton}>
        <BackIconButton color="white" />
      </View>

      <BottomSheetModal
        ref={bodySheetRef}
        snapPoints={bodySheetSnapPoints}
        backdropComponent={renderSheetBackdrop}
        backgroundStyle={{ backgroundColor: theme.semantic.color.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.semantic.color.borderStrong }}
        onDismiss={() => setReadingReview(null)}
      >
        {sheetReview ? (
          <ReviewBodySheetContent
            review={sheetReview}
            loadFailed={readingReviewQuery.isError}
            onClose={() => bodySheetRef.current?.dismiss()}
            onOpenCreator={openCreatorProfile}
            onConsumptionStage={captureBodyConsumptionStage}
          />
        ) : null}
      </BottomSheetModal>

      <Modal
        visible={Boolean(reportingReview)}
        transparent
        animationType="fade"
        onRequestClose={() => setReportingReview(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setReportingReview(null)} />
        <View
          style={[
            styles.reportSheet,
            { backgroundColor: theme.semantic.color.surface },
            theme.semantic.shadow.overlay
          ]}
        >
          <View style={styles.reportSheetHeader}>
            <ShoplyText variant="titleMd">신고하기</ShoplyText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="신고 닫기"
              hitSlop={10}
              onPress={() => setReportingReview(null)}
              style={({ pressed }) => [styles.sheetCloseButton, { opacity: pressed ? 0.68 : 1 }]}
            >
              <X size={20} color={theme.semantic.color.text} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.reportReasonList}
            showsVerticalScrollIndicator={false}
          >
            {(reportReasonsQuery.data?.length
              ? reportReasonsQuery.data
              : [{ code: "other", label: "기타" }]
            ).map((reason) => (
              <Pressable
                key={reason.code}
                accessibilityRole="button"
                disabled={reportSubmitting}
                onPress={() => {
                  void sendReport(reason.code);
                }}
                style={({ pressed }) => [
                  styles.reportReasonRow,
                  {
                    backgroundColor: pressed ? theme.semantic.color.surfaceMuted : "transparent"
                  }
                ]}
              >
                <View style={styles.reportReasonCopy}>
                  <ShoplyText variant="labelLg">{reason.label}</ShoplyText>
                  {reason.description ? (
                    <ShoplyText variant="caption" color="textMuted">
                      {reason.description}
                    </ShoplyText>
                  ) : null}
                </View>
                <ChevronRight size={19} color={theme.semantic.color.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function BackIconButton({ color }: { color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로가기"
      hitSlop={10}
      onPress={() => router.back()}
      style={({ pressed }) => [styles.backIconButton, { opacity: pressed ? 0.68 : 1 }]}
    >
      <ArrowLeft size={22} color={color} />
    </Pressable>
  );
}

function ReviewMediaCarousel({
  media,
  activeIndex,
  mutedByMediaId,
  pausedByMediaId,
  reviewId,
  reviewActive,
  sourceSurface,
  videoSeekActive,
  onReveal,
  onSelect,
  onVideoSeekActiveChange
}: {
  media: ReviewMediaItem[];
  activeIndex: number;
  mutedByMediaId: Record<string, boolean>;
  pausedByMediaId: Record<string, boolean>;
  reviewId: string;
  reviewActive: boolean;
  sourceSurface: string;
  videoSeekActive: boolean;
  onReveal: () => void;
  onSelect: (index: number, action: "swipe" | "select") => void;
  onVideoSeekActiveChange: (active: boolean) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const mediaScrollGesture = useMemo(() => Gesture.Native(), []);
  const activeMedia = media[activeIndex] ?? media[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: screen.width * activeIndex, animated: true });
  }, [activeIndex]);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (media.length <= 1) return;
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screen.width);
      const clampedIndex = Math.min(media.length - 1, Math.max(0, nextIndex));
      if (clampedIndex !== activeIndex) onSelect(clampedIndex, "swipe");
    },
    [activeIndex, media.length, onSelect]
  );

  if (!activeMedia) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.emptyMedia]}>
        <ImageIcon size={42} color="rgba(255, 255, 255, 0.76)" />
        <ShoplyText variant="bodyMd" style={styles.mutedWhite} align="center">
          미디어가 없습니다
        </ShoplyText>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <GestureDetector gesture={mediaScrollGesture}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          disableIntervalMomentum
          nestedScrollEnabled
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEnabled={!videoSeekActive}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
        >
          {media.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel="미디어 태그 보기"
              onPress={onReveal}
              style={styles.mediaCarouselItem}
            >
              <ReviewMediaSurface
                media={item}
                muted={mutedByMediaId[item.id] ?? item.mutedByDefault ?? true}
                playing={!(pausedByMediaId[item.id] ?? false)}
                active={reviewActive && index === activeIndex}
                reviewId={reviewId}
                sourceSurface={sourceSurface}
                blockedScrollGesture={mediaScrollGesture}
                onSeekActiveChange={onVideoSeekActiveChange}
              />
            </Pressable>
          ))}
        </ScrollView>
      </GestureDetector>
    </View>
  );
}

function ReviewMediaSurface({
  media,
  muted,
  playing,
  active = true,
  reviewId,
  sourceSurface,
  blockedScrollGesture,
  onSeekActiveChange
}: {
  media: ReviewMediaItem;
  muted: boolean;
  playing: boolean;
  active?: boolean;
  reviewId: string;
  sourceSurface: string;
  blockedScrollGesture: GestureType;
  onSeekActiveChange: (active: boolean) => void;
}) {
  if (media.mediaType === "video") {
    if (!active) {
      return <ReviewVideoPreviewSurface media={media} />;
    }

    return (
      <ReviewVideoSurface
        media={media}
        muted={muted}
        playing={playing}
        reviewId={reviewId}
        sourceSurface={sourceSurface}
        blockedScrollGesture={blockedScrollGesture}
        onSeekActiveChange={onSeekActiveChange}
      />
    );
  }

  return (
    <ExpoImage source={{ uri: media.url }} style={StyleSheet.absoluteFill} contentFit="contain" />
  );
}

function ReviewVideoPreviewSurface({ media }: { media: ReviewMediaItem }) {
  return (
    <View style={styles.videoPreviewSurface}>
      {media.previewUrl ? (
        <ExpoImage
          source={{ uri: media.previewUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      ) : null}
      <View style={styles.videoPreviewBadge}>
        <Play size={18} color="white" fill="white" />
      </View>
    </View>
  );
}

function ReviewVideoSurface({
  media,
  muted,
  playing,
  reviewId,
  sourceSurface,
  blockedScrollGesture,
  onSeekActiveChange
}: {
  media: ReviewMediaItem;
  muted: boolean;
  playing: boolean;
  reviewId: string;
  sourceSurface: string;
  blockedScrollGesture: GestureType;
  onSeekActiveChange: (active: boolean) => void;
}) {
  const emittedStages = useRef(new Set<ConsumptionStage>());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, (media.durationMs ?? 0) / 1000));
  const player = useVideoPlayer(media.url, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = muted;
    nextPlayer.timeUpdateEventInterval = 0.5;
    if (playing) nextPlayer.play();
  });

  const emitStage = useCallback(
    (stage: ConsumptionStage, watchedSeconds: number) => {
      if (emittedStages.current.has(stage)) return;
      emittedStages.current.add(stage);
      const durationSeconds = Math.max(0, player.duration);
      const watchedMs = Math.max(0, Math.round(watchedSeconds * 1000));
      const durationMs = durationSeconds > 0 ? Math.round(durationSeconds * 1000) : undefined;
      const progress = durationSeconds > 0 ? watchedSeconds / durationSeconds : undefined;
      captureConsumptionEvent(
        buildMediaConsumptionEvent({
          reviewId,
          mediaId: media.id,
          mediaType: "video",
          sourceSurface,
          stage,
          activeMs: watchedMs,
          watchedMs,
          durationMs,
          progress,
          visibleRatio: 0.7
        })
      );
      captureConsumptionEvent(
        buildReviewConsumptionEvent({
          reviewId,
          sourceSurface,
          contentMode: "video",
          stage,
          activeMs: watchedMs,
          visibleRatio: 0.7
        })
      );
    },
    [media.id, player, reviewId, sourceSurface]
  );

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    const nextDuration = Math.max(0, player.duration);
    setCurrentTime(currentTime);
    if (nextDuration > 0) setDuration(nextDuration);
    const progress = nextDuration > 0 ? currentTime / nextDuration : 0;
    if (currentTime >= 2) emitStage("light", currentTime);
    if (currentTime >= 3 || progress >= 0.25) emitStage("qualified", currentTime);
    if (progress >= 0.5) emitStage("deep", currentTime);
    if (progress >= 0.9) emitStage("complete", currentTime);
  });

  useEventListener(player, "playToEnd", () => {
    emitStage("complete", Math.max(player.currentTime, player.duration));
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (playing) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, playing]);

  const seekToProgress = useCallback(
    (progress: number) => {
      const nextDuration = Math.max(duration, player.duration);
      if (nextDuration <= 0) return;
      const nextTime = Math.max(0, Math.min(nextDuration, progress * nextDuration));
      player.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration, player]
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />
      <VideoSeekBar
        currentTime={currentTime}
        duration={Math.max(duration, player.duration)}
        onSeek={seekToProgress}
        blockedScrollGesture={blockedScrollGesture}
        onSeekActiveChange={onSeekActiveChange}
      />
    </View>
  );
}

function VideoSeekBar({
  currentTime,
  duration,
  onSeek,
  blockedScrollGesture,
  onSeekActiveChange
}: {
  currentTime: number;
  duration: number;
  onSeek: (progress: number) => void;
  blockedScrollGesture: GestureType;
  onSeekActiveChange: (active: boolean) => void;
}) {
  const theme = useShoplyTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const seekFromX = useCallback(
    (locationX: number) => {
      if (trackWidth <= 0) return;
      onSeek(Math.max(0, Math.min(1, locationX / trackWidth)));
    },
    [onSeek, trackWidth]
  );
  const seekGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .blocksExternalGesture(blockedScrollGesture)
        .runOnJS(true)
        .onStart((event) => {
          onSeekActiveChange(true);
          seekFromX(event.x);
        })
        .onUpdate((event) => {
          seekFromX(event.x);
        })
        .onFinalize(() => {
          onSeekActiveChange(false);
        }),
    [blockedScrollGesture, onSeekActiveChange, seekFromX]
  );

  return (
    <GestureDetector gesture={seekGesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="영상 재생 위치"
        accessibilityValue={{
          min: 0,
          max: Math.max(0, Math.round(duration)),
          now: Math.max(0, Math.round(currentTime)),
          text: `${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`
        }}
        accessibilityActions={[
          { name: "decrement", label: "5초 뒤로" },
          { name: "increment", label: "5초 앞으로" }
        ]}
        onAccessibilityAction={(event) => {
          if (duration <= 0) return;
          const offset = event.nativeEvent.actionName === "increment" ? 5 : -5;
          onSeek((currentTime + offset) / duration);
        }}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        style={styles.videoSeekTouchTarget}
      >
        <View style={styles.videoSeekTrack}>
          <View
            style={[
              styles.videoSeekProgress,
              {
                backgroundColor: theme.semantic.color.primary,
                width: `${progress * 100}%`
              }
            ]}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

function formatPlaybackTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function VideoMuteButton({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? "영상 소리 켜기" : "영상 음소거"}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.videoMuteButton, { opacity: pressed ? 0.72 : 1 }]}
    >
      {muted ? <VolumeX size={18} color="white" /> : <Volume2 size={18} color="white" />}
      <ShoplyText variant="caption" style={styles.whiteText}>
        {muted ? "무음" : "소리"}
      </ShoplyText>
    </Pressable>
  );
}

function CreatorAvatar({
  review,
  size,
  inverse = false
}: {
  review: ReviewSummary;
  size: "sm" | "lg";
  inverse?: boolean;
}) {
  const theme = useShoplyTheme();
  const avatarStyle = size === "lg" ? styles.creatorAvatarLg : styles.creatorAvatarSm;
  return (
    <View
      style={[
        styles.creatorAvatar,
        avatarStyle,
        {
          backgroundColor: inverse ? "rgba(5, 5, 7, 0.42)" : theme.semantic.color.surfaceMuted,
          borderColor: inverse ? "rgba(255, 255, 255, 0.34)" : theme.semantic.color.border
        }
      ]}
    >
      {review.creatorProfileImageUrl ? (
        <ExpoImage
          source={{ uri: review.creatorProfileImageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <ShoplyText
          variant={size === "lg" ? "labelLg" : "caption"}
          style={{ color: inverse ? "white" : theme.semantic.color.text }}
        >
          {creatorInitial(review.creatorNickname)}
        </ShoplyText>
      )}
    </View>
  );
}

function ReviewBodySheetContent({
  review,
  loadFailed,
  onClose,
  onOpenCreator,
  onConsumptionStage
}: {
  review: ReviewSummary;
  loadFailed: boolean;
  onClose: () => void;
  onOpenCreator: (review: ReviewSummary) => void;
  onConsumptionStage: (stage: ConsumptionStage, activeMs: number, scrollDepth?: number) => void;
}) {
  const theme = useShoplyTheme();
  const creatorLabel = creatorHandle(review.creatorNickname);
  const brandNames = reviewBrandNames(review);
  const openedAtRef = useRef(Date.now());
  const emittedStagesRef = useRef(new Set<ConsumptionStage>());

  const emitStage = useCallback(
    (stage: ConsumptionStage, scrollDepth?: number) => {
      if (emittedStagesRef.current.has(stage)) return;
      emittedStagesRef.current.add(stage);
      onConsumptionStage(stage, Date.now() - openedAtRef.current, scrollDepth);
    },
    [onConsumptionStage]
  );

  useEffect(() => {
    openedAtRef.current = Date.now();
    emittedStagesRef.current.clear();
    emitStage("light", 0);
    const qualifiedTimer = setTimeout(() => emitStage("qualified"), 5000);
    return () => clearTimeout(qualifiedTimer);
  }, [emitStage, review.id]);

  const handleBodyScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const scrollableHeight = Math.max(1, contentSize.height - layoutMeasurement.height);
      const scrollDepth = Math.max(0, Math.min(1, contentOffset.y / scrollableHeight));
      if (scrollDepth >= 0.3) emitStage("qualified", scrollDepth);
      if (scrollDepth >= 0.7) emitStage("deep", scrollDepth);
    },
    [emitStage]
  );

  return (
    <BottomSheetScrollView
      contentContainerStyle={styles.bodySheetContent}
      onScroll={handleBodyScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.bodySheetHeader}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={creatorLabel ? `${creatorLabel} 프로필 보기` : "작성자 프로필 보기"}
          disabled={!review.authorId}
          onPress={() => onOpenCreator(review)}
          style={({ pressed }) => [styles.bodySheetCreator, { opacity: pressed ? 0.72 : 1 }]}
        >
          <CreatorAvatar review={review} size="lg" />
          <View style={styles.bodySheetCreatorCopy}>
            {creatorLabel ? (
              <ShoplyText variant="labelLg" numberOfLines={1}>
                {creatorLabel}
              </ShoplyText>
            ) : (
              <Skeleton width={112} height={18} radius={999} />
            )}
            {review.creatorBadge ? (
              <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
                {review.creatorBadge}
              </ShoplyText>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="본문 닫기"
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.sheetCloseButton, { opacity: pressed ? 0.68 : 1 }]}
        >
          <X size={20} color={theme.semantic.color.text} />
        </Pressable>
      </View>

      <View style={styles.bodySheetMeta}>
        <ShoplyText variant="titleMd">{review.productName}</ShoplyText>
        {brandNames.length ? <IdentityMetadataGroup label="브랜드" names={brandNames} /> : null}
        {review.merchantSiteNames?.length ? (
          <IdentityMetadataGroup label="구매처" names={review.merchantSiteNames} />
        ) : null}
        <View style={styles.bodySheetPurchaseLine}>
          {review.price > 0 ? (
            <ShoplyText variant="labelMd">{formatWon(review.price)}</ShoplyText>
          ) : null}
          <DisclosureBadge state={review.disclosureState} compact />
        </View>
      </View>

      {loadFailed ? (
        <ShoplyText variant="caption" color="danger">
          전체 본문을 다시 불러오지 못해 현재 표시된 내용만 보여드려요.
        </ShoplyText>
      ) : null}
      <ShoplyText variant="bodyLg" style={styles.bodySheetText}>
        {review.body}
      </ShoplyText>
    </BottomSheetScrollView>
  );
}

function IdentityMetadataGroup({ label, names }: { label: string; names: string[] }) {
  const theme = useShoplyTheme();
  return (
    <View style={styles.identityMetadataGroup}>
      <ShoplyText variant="caption" color="textMuted">
        {label}
      </ShoplyText>
      <View style={styles.identityMetadataChips}>
        {names.map((name) => (
          <View
            key={`${label}-${name}`}
            style={[
              styles.identityMetadataChip,
              {
                backgroundColor: theme.semantic.color.surfaceMuted,
                borderColor: theme.semantic.color.border
              }
            ]}
          >
            <ShoplyText variant="caption">{name}</ShoplyText>
          </View>
        ))}
      </View>
    </View>
  );
}

function MediaPagerControls({
  media,
  activeIndex,
  onSelect
}: {
  media: ReviewMediaItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (media.length <= 1) return null;

  const activeMedia = media[activeIndex];
  const previousIndex = activeIndex <= 0 ? media.length - 1 : activeIndex - 1;
  const nextIndex = activeIndex >= media.length - 1 ? 0 : activeIndex + 1;

  return (
    <View style={styles.mediaPager} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이전 미디어 보기"
        accessibilityHint="첫 미디어에서는 마지막 미디어로 이동합니다"
        onPress={(event) => {
          event.stopPropagation();
          onSelect(previousIndex);
        }}
        style={({ pressed }) => [styles.mediaPagerButton, { opacity: pressed ? 0.72 : 1 }]}
      >
        <ChevronLeft size={18} color="white" />
      </Pressable>
      <View style={styles.mediaPagerCenter}>
        <View style={styles.mediaPagerCounter}>
          {activeMedia?.mediaType === "video" ? (
            <Play size={13} color="white" fill="white" />
          ) : (
            <Images size={13} color="white" />
          )}
          <ShoplyText variant="caption" style={styles.whiteText}>
            {activeIndex + 1}/{media.length}
          </ShoplyText>
        </View>
        <View style={styles.mediaDots}>
          {media.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}번째 미디어 보기`}
              hitSlop={8}
              onPress={() => onSelect(index)}
              style={[styles.mediaDot, index === activeIndex ? styles.mediaDotActive : null]}
            />
          ))}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 미디어 보기"
        accessibilityHint="마지막 미디어에서는 첫 미디어로 이동합니다"
        onPress={(event) => {
          event.stopPropagation();
          onSelect(nextIndex);
        }}
        style={({ pressed }) => [styles.mediaPagerButton, { opacity: pressed ? 0.72 : 1 }]}
      >
        <ChevronRight size={18} color="white" />
      </Pressable>
    </View>
  );
}

function creatorHandle(nickname: string) {
  const normalized = nickname.trim().replace(/^@+/, "");
  return normalized ? `@${normalized}` : null;
}

function reviewBrandNames(review: ReviewSummary) {
  if (review.brandNames?.length) return review.brandNames;
  return review.brandName ? [review.brandName] : [];
}

function compactIdentitySummary(names: string[], visibleCount = 2) {
  if (!names.length) return "";
  const visible = names.slice(0, visibleCount).join(", ");
  const hiddenCount = names.length - visibleCount;
  return hiddenCount > 0 ? `${visible} 외 ${hiddenCount}개` : visible;
}

function creatorInitial(nickname: string) {
  const normalized = nickname.trim().replace(/^@+/, "");
  return (normalized || "S").slice(0, 1).toUpperCase();
}

function hasCreatorNickname(review: ReviewSummary) {
  return Boolean(creatorHandle(review.creatorNickname));
}

function isExpandableReviewBody(body: string) {
  const normalized = body.trim();
  return normalized.includes("\n") || normalized.length > 58;
}

function reviewMediaForDisplay(review: ReviewSummary): ReviewMediaItem[] {
  if (review.media.length) return review.media;
  if (!review.mediaUrl) return [];
  return [
    {
      // Legacy summaries do not expose a media row id. Reuse the review UUID so
      // telemetry remains valid for the UUID-backed event store without sending URLs.
      id: review.id,
      mediaType: review.mediaType,
      url: review.mediaUrl,
      previewUrl: review.mediaUrl
    }
  ];
}

function reviewContentMode(review: ReviewSummary) {
  const media = reviewMediaForDisplay(review);
  const hasImage = media.some((item) => item.mediaType === "image");
  const hasVideo = media.some((item) => item.mediaType === "video");
  if (hasImage && hasVideo) return "mixed" as const;
  if (hasVideo) return "video" as const;
  if (hasImage) return "image" as const;
  return "text" as const;
}

function getContainedMediaFrame(media?: ReviewMediaItem) {
  const mediaWidth = Number(media?.width);
  const mediaHeight = Number(media?.height);
  if (
    !Number.isFinite(mediaWidth) ||
    !Number.isFinite(mediaHeight) ||
    mediaWidth <= 0 ||
    mediaHeight <= 0
  ) {
    return {
      height: screen.height,
      left: 0,
      top: 0,
      width: screen.width
    };
  }

  const scale = Math.min(screen.width / mediaWidth, screen.height / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;

  return {
    height,
    left: (screen.width - width) / 2,
    top: (screen.height - height) / 2,
    width
  };
}

function DetailSkeleton() {
  return (
    <View style={styles.detailSkeleton}>
      <View style={styles.detailSkeletonMedia}>
        <Skeleton width="100%" height="100%" radius={0} style={styles.darkSkeleton} />
      </View>
      <View style={styles.detailSkeletonActions}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton
            key={index}
            width={44}
            height={44}
            radius={999}
            style={styles.darkSkeletonStrong}
          />
        ))}
      </View>
      <View style={styles.detailSkeletonCopy}>
        <Skeleton width="38%" height={16} radius={999} style={styles.darkSkeletonStrong} />
        <Skeleton width="74%" height={24} radius={8} style={styles.darkSkeletonStrong} />
        <Skeleton width="58%" height={16} radius={999} style={styles.darkSkeleton} />
        <Skeleton width="88%" height={18} radius={8} style={styles.darkSkeleton} />
      </View>
    </View>
  );
}

function DetailFooterSkeleton() {
  return (
    <View style={styles.detailFooterSkeleton}>
      <DetailSkeleton />
    </View>
  );
}

function mergeDetailReviews(...groups: ReviewSummary[][]) {
  const seen = new Set<string>();
  const merged: ReviewSummary[] = [];
  for (const group of groups) {
    for (const review of group) {
      if (seen.has(review.id)) continue;
      seen.add(review.id);
      merged.push(review);
    }
  }
  return merged;
}

function replaceOrPrependReview(reviews: ReviewSummary[], review: ReviewSummary) {
  const index = reviews.findIndex((item) => item.id === review.id);
  if (index < 0) return [review, ...reviews];
  const next = [...reviews];
  const existingReview = next[index];
  const media = mergeReviewMedia(existingReview.media, review.media);
  next[index] = {
    ...existingReview,
    ...review,
    media,
    mediaUrl: media[0]?.previewUrl ?? review.mediaUrl ?? existingReview.mediaUrl,
    mediaType: media[0]?.mediaType ?? review.mediaType ?? existingReview.mediaType,
    viewerActivity: existingReview.viewerActivity ?? review.viewerActivity
  };
  return next;
}

function mergeReviewMedia(existingMedia: ReviewMediaItem[], loadedMedia: ReviewMediaItem[]) {
  if (!existingMedia.length) return loadedMedia;
  if (!loadedMedia.length) return existingMedia;

  const loadedById = new Map(loadedMedia.map((item) => [item.id, item]));
  const existingIds = new Set(existingMedia.map((item) => item.id));
  const mergedInExistingOrder = existingMedia.map((item) => ({
    ...item,
    ...loadedById.get(item.id)
  }));
  const loadedOnly = loadedMedia.filter((item) => !existingIds.has(item.id));

  return [...mergedInExistingOrder, ...loadedOnly];
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#000000",
    overflow: "hidden"
  },
  emptyScreen: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  loadingDetailScreen: {
    backgroundColor: "#000000",
    flex: 1
  },
  emptyMedia: {
    alignItems: "center",
    backgroundColor: "#242733",
    gap: 8,
    justifyContent: "center",
    padding: 24
  },
  scrim: {
    bottom: 0,
    backgroundColor: "rgba(5, 5, 7, 0.16)",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  mediaCarouselItem: {
    backgroundColor: "#000000",
    height: screen.height,
    width: screen.width
  },
  stickerFrame: {
    position: "absolute"
  },
  videoPreviewSurface: {
    alignItems: "center",
    backgroundColor: "#050507",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  videoPreviewBadge: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.52)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  fixedBackButton: {
    left: 14,
    position: "absolute",
    top: 58
  },
  backIconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  whiteText: {
    color: "white"
  },
  mutedWhite: {
    color: "rgba(255, 255, 255, 0.78)"
  },
  actions: {
    alignItems: "center",
    gap: DETAIL_ACTION_BUTTON_GAP,
    position: "absolute",
    right: 14,
    top: DETAIL_ACTION_STACK_TOP
  },
  bottomInfo: {
    bottom: 42,
    gap: 10,
    left: 16,
    position: "absolute",
    right: 82
  },
  creatorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingRight: 4
  },
  creatorProfileLink: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.46)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
    minHeight: 36,
    minWidth: 0,
    paddingLeft: 4,
    paddingRight: 10
  },
  creatorHandleText: {
    flexShrink: 1,
    minWidth: 0
  },
  creatorAvatar: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    overflow: "hidden"
  },
  creatorAvatarSm: {
    borderRadius: 14,
    height: 28,
    width: 28
  },
  creatorAvatarLg: {
    borderRadius: 22,
    height: 44,
    width: 44
  },
  creatorBadge: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.52)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 24,
    paddingHorizontal: 8
  },
  purchaseLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingRight: 12
  },
  brandNameText: {
    maxWidth: "100%",
    opacity: 0.86,
    textShadowColor: "rgba(0, 0, 0, 0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  bodyPreviewButton: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingRight: 2
  },
  bodyPreviewText: {
    flex: 1
  },
  bodyMorePill: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.48)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: "center",
    marginBottom: 1,
    width: 38
  },
  bodySheetContent: {
    gap: 18,
    padding: 20,
    paddingBottom: 38
  },
  bodySheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  bodySheetCreator: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 48,
    minWidth: 0
  },
  bodySheetCreatorCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  bodySheetMeta: {
    gap: 8
  },
  identityMetadataGroup: {
    gap: 6
  },
  identityMetadataChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  identityMetadataChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  bodySheetPurchaseLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  bodySheetText: {
    lineHeight: 24
  },
  detailSkeleton: {
    flex: 1,
    overflow: "hidden"
  },
  detailSkeletonActions: {
    alignItems: "center",
    gap: DETAIL_ACTION_BUTTON_GAP,
    position: "absolute",
    right: 14,
    top: DETAIL_ACTION_STACK_TOP
  },
  detailSkeletonCopy: {
    bottom: 42,
    gap: 10,
    left: 16,
    position: "absolute",
    right: 82
  },
  detailSkeletonMedia: {
    backgroundColor: "#050507",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  detailFooterSkeleton: {
    backgroundColor: "#000000",
    height: screen.height
  },
  darkSkeleton: {
    backgroundColor: "rgba(255, 255, 255, 0.14)"
  },
  darkSkeletonStrong: {
    backgroundColor: "rgba(255, 255, 255, 0.24)"
  },
  revealHint: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.48)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
    top: 118
  },
  mediaPager: {
    alignItems: "center",
    elevation: 4,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    left: 74,
    position: "absolute",
    right: 74,
    top: 64,
    zIndex: 4
  },
  mediaPagerButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.48)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  mediaPagerCenter: {
    alignItems: "center",
    gap: 8,
    minWidth: 110
  },
  mediaPagerCounter: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.5)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 10
  },
  mediaDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center"
  },
  mediaDot: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    borderRadius: 999,
    height: 6,
    width: 6
  },
  mediaDotActive: {
    backgroundColor: "white",
    width: 16
  },
  videoMuteButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.52)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    position: "absolute",
    right: 14,
    top: DETAIL_MUTE_BUTTON_TOP
  },
  videoSeekTouchTarget: {
    bottom: 0,
    height: 44,
    justifyContent: "flex-end",
    left: 0,
    paddingBottom: 2,
    position: "absolute",
    right: 0,
    zIndex: 6
  },
  videoSeekTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    height: 3,
    overflow: "hidden",
    width: "100%"
  },
  videoSeekProgress: {
    height: "100%"
  },
  modalBackdrop: {
    backgroundColor: "rgba(5, 5, 7, 0.48)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  reportSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    bottom: 0,
    gap: 14,
    left: 0,
    maxHeight: "72%",
    padding: 18,
    paddingBottom: 34,
    position: "absolute",
    right: 0
  },
  reportSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  reportReasonList: {
    gap: 2
  },
  reportReasonRow: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reportReasonCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  sheetCloseButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40
  }
});
