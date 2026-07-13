import { describe, expect, it } from "vitest";
import type { ReviewSummary as ApiReviewSummary } from "@/shared/api/generated/shoply";
import { mapApiReviewSummary } from "./review-mappers";

describe("mapApiReviewSummary", () => {
  it("keeps every unique brand and merchant while preserving video playback preference", () => {
    const review = {
      id: "review-1",
      author: { userId: "user-1", nickname: "shoply" },
      categoryId: "category-1",
      bodyPreview: "좋은 리뷰예요.",
      purchasePrice: 10000,
      disclosureState: "none",
      status: "published",
      publishedAt: "2026-07-13T00:00:00.000Z",
      metrics: {},
      brands: [
        { id: "brand-1", name: "브랜드 A" },
        { id: "brand-2", name: "브랜드 B" },
        { id: "brand-3", name: "브랜드 C" },
        { id: "brand-4", name: "브랜드 D" },
        { id: "brand-5", name: "브랜드 E" },
        { id: "brand-duplicate", name: " 브랜드 A " }
      ],
      merchantSites: [
        { id: "merchant-1", name: "구매처 A" },
        { id: "merchant-2", name: "구매처 B" },
        { id: "merchant-3", name: "구매처 C" },
        { id: "merchant-4", name: "구매처 D" },
        { id: "merchant-5", name: "구매처 E" }
      ],
      media: [
        {
          id: "media-1",
          mediaType: "video",
          storageKey: "https://cdn.example.com/review.mp4",
          storageUrl: "https://cdn.example.com/review.mp4",
          thumbnailUrl: "https://cdn.example.com/review.jpg",
          sortOrder: 0,
          status: "ready",
          variantsPayload: { playback: { mutedByDefault: false } }
        }
      ]
    } as unknown as ApiReviewSummary;

    const mapped = mapApiReviewSummary(review);

    expect(mapped.brandNames).toEqual(["브랜드 A", "브랜드 B", "브랜드 C", "브랜드 D", "브랜드 E"]);
    expect(mapped.merchantSiteNames).toEqual([
      "구매처 A",
      "구매처 B",
      "구매처 C",
      "구매처 D",
      "구매처 E"
    ]);
    expect(mapped.media[0]?.mutedByDefault).toBe(false);
  });
});
