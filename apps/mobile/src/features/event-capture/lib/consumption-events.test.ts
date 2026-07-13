import { describe, expect, it } from "vitest";
import {
  buildMediaConsumptionEvent,
  buildReviewConsumptionEvent,
  buildReviewImpressionEvent,
} from "./consumption-events";

const context = { reviewId: "review-id", sourceSurface: "review_detail" };

describe("consumption event builders", () => {
  it("bounds impression visibility and time", () => {
    expect(buildReviewImpressionEvent({ ...context, visibleRatio: 1.4, visibleMs: -1 }).payload).toEqual({
      visibleRatio: 1,
      visibleMs: 0,
    });
  });

  it("does not include undefined telemetry fields", () => {
    expect(buildReviewConsumptionEvent({
      ...context,
      contentMode: "image",
      stage: "qualified",
      activeMs: 3000,
    }).payload).toEqual({
      contentMode: "image",
      stage: "qualified",
      activeMs: 3000,
    });
  });

  it("uses playback progress instead of a wall-clock-only video event", () => {
    const event = buildMediaConsumptionEvent({
      ...context,
      mediaId: "media-id",
      mediaType: "video",
      stage: "deep",
      activeMs: 12000,
      watchedMs: 12000,
      durationMs: 20000,
      progress: 0.6,
    });
    expect(event.targetType).toBe("review_media");
    expect(event.payload).toMatchObject({ progress: 0.6, watchedMs: 12000, durationMs: 20000 });
  });
});
