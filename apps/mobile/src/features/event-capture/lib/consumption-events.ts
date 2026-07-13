import type { ShoplyActionEvent } from "../api/action-events";

export type ConsumptionStage = "impression" | "light" | "qualified" | "deep" | "complete";
export type ReviewContentMode = "image" | "video" | "text" | "mixed";

interface ReviewEventContext {
  reviewId: string;
  sourceSurface: string;
}

export function buildReviewImpressionEvent(
  context: ReviewEventContext & { visibleRatio: number; visibleMs: number; position?: number },
): ShoplyActionEvent {
  return {
    eventType: "review_impression",
    targetType: "review",
    targetId: context.reviewId,
    reviewId: context.reviewId,
    sourceSurface: context.sourceSurface,
    payload: compact({
      visibleRatio: ratio(context.visibleRatio),
      visibleMs: milliseconds(context.visibleMs),
      position: optionalInteger(context.position),
    }),
  };
}

export function buildReviewConsumptionEvent(
  context: ReviewEventContext & {
    contentMode: ReviewContentMode;
    stage: ConsumptionStage;
    activeMs: number;
    scrollDepth?: number;
    visibleRatio?: number;
    mediaCount?: number;
  },
): ShoplyActionEvent {
  return {
    eventType: "review_consumption_milestone",
    targetType: "review",
    targetId: context.reviewId,
    reviewId: context.reviewId,
    sourceSurface: context.sourceSurface,
    payload: compact({
      contentMode: context.contentMode,
      stage: context.stage,
      activeMs: milliseconds(context.activeMs),
      scrollDepth: optionalRatio(context.scrollDepth),
      visibleRatio: optionalRatio(context.visibleRatio),
      mediaCount: optionalInteger(context.mediaCount),
    }),
  };
}

export function buildMediaConsumptionEvent(
  context: ReviewEventContext & {
    mediaId: string;
    mediaType: "image" | "video";
    stage: ConsumptionStage;
    activeMs: number;
    watchedMs?: number;
    durationMs?: number;
    progress?: number;
    visibleRatio?: number;
  },
): ShoplyActionEvent {
  return {
    eventType: "media_consumption_milestone",
    targetType: "review_media",
    targetId: context.mediaId,
    reviewId: context.reviewId,
    sourceSurface: context.sourceSurface,
    payload: compact({
      mediaType: context.mediaType,
      stage: context.stage,
      activeMs: milliseconds(context.activeMs),
      watchedMs: optionalMilliseconds(context.watchedMs),
      durationMs: optionalPositiveMilliseconds(context.durationMs),
      progress: optionalRatio(context.progress),
      visibleRatio: optionalRatio(context.visibleRatio),
    }),
  };
}

export function buildGalleryInteractionEvent(
  context: ReviewEventContext & {
    mediaId: string;
    action: "swipe" | "select" | "zoom";
    mediaCount: number;
    fromIndex?: number;
    toIndex?: number;
  },
): ShoplyActionEvent {
  return {
    eventType: "gallery_interaction",
    targetType: "review_media",
    targetId: context.mediaId,
    reviewId: context.reviewId,
    sourceSurface: context.sourceSurface,
    payload: compact({
      action: context.action,
      mediaCount: Math.max(1, Math.trunc(context.mediaCount)),
      fromIndex: optionalInteger(context.fromIndex),
      toIndex: optionalInteger(context.toIndex),
    }),
  };
}

function compact(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function ratio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function optionalRatio(value?: number) {
  return value === undefined ? undefined : ratio(value);
}

function milliseconds(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(86_400_000, Math.trunc(value)));
}

function optionalMilliseconds(value?: number) {
  return value === undefined ? undefined : milliseconds(value);
}

function optionalPositiveMilliseconds(value?: number) {
  if (value === undefined) return undefined;
  return Math.max(1, milliseconds(value));
}

function optionalInteger(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}
