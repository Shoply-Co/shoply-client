import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewToken } from "@shopify/flash-list";
import type { ViewabilityConfig } from "react-native";
import type { ReviewSummary } from "./types";

export const reviewTileVideoPreviewViewabilityConfig: ViewabilityConfig = {
  itemVisiblePercentThreshold: 50
};

export function reviewHasPlayablePrimaryVideo(review: ReviewSummary) {
  const primaryMedia = review.media[0];
  const mediaType = primaryMedia?.mediaType ?? review.mediaType;
  const videoUrl = mediaType === "video" ? (primaryMedia?.url ?? review.mediaUrl) : undefined;

  return mediaType === "video" && Boolean(videoUrl);
}

export function useReviewTileVideoPreview() {
  const [activePreviewReviewId, setActivePreviewReviewId] = useState<string | null>(null);
  const visibleVideoReviewIdRef = useRef<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollingRef = useRef(false);

  const clearPreviewTimer = useCallback(() => {
    if (!previewTimerRef.current) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }, []);

  const clearPreviewEndTimer = useCallback(() => {
    if (!previewEndTimerRef.current) return;
    clearTimeout(previewEndTimerRef.current);
    previewEndTimerRef.current = null;
  }, []);

  const schedulePreview = useCallback(
    (reviewId: string | null) => {
      clearPreviewTimer();
      clearPreviewEndTimer();
      if (!reviewId) {
        setActivePreviewReviewId(null);
        return;
      }

      previewTimerRef.current = setTimeout(() => {
        if (scrollingRef.current || visibleVideoReviewIdRef.current !== reviewId) return;
        setActivePreviewReviewId(reviewId);
        previewEndTimerRef.current = setTimeout(() => {
          if (visibleVideoReviewIdRef.current === reviewId) {
            setActivePreviewReviewId(null);
          }
        }, 5000);
      }, 500);
    },
    [clearPreviewEndTimer, clearPreviewTimer]
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ReviewSummary>[] }) => {
      const nextVideo = [...viewableItems]
        .filter((token) => token.isViewable && reviewHasPlayablePrimaryVideo(token.item))
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))[0];
      const nextReviewId = nextVideo?.item.id ?? null;

      visibleVideoReviewIdRef.current = nextReviewId;
      if (!nextReviewId) {
        clearPreviewTimer();
        clearPreviewEndTimer();
        setActivePreviewReviewId(null);
        return;
      }
      if (!scrollingRef.current) {
        schedulePreview(nextReviewId);
      }
    },
    [clearPreviewEndTimer, clearPreviewTimer, schedulePreview]
  );

  const pausePreview = useCallback(() => {
    scrollingRef.current = true;
    clearPreviewTimer();
    clearPreviewEndTimer();
    setActivePreviewReviewId(null);
  }, [clearPreviewEndTimer, clearPreviewTimer]);

  const resumePreview = useCallback(() => {
    scrollingRef.current = false;
    schedulePreview(visibleVideoReviewIdRef.current);
  }, [schedulePreview]);

  useEffect(
    () => () => {
      clearPreviewTimer();
      clearPreviewEndTimer();
    },
    [clearPreviewEndTimer, clearPreviewTimer]
  );

  return {
    activePreviewReviewId,
    onViewableItemsChanged,
    pausePreview,
    resumePreview,
    viewabilityConfig: reviewTileVideoPreviewViewabilityConfig
  };
}
