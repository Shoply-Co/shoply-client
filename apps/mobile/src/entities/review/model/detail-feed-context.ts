import type { ReviewSummary } from "./types";

export type ReviewDetailFeedSurface = "home" | "search";

export interface ReviewDetailFeedSearchFilters {
  query: string;
  categoryId?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  userId?: string | null;
}

export interface ReviewDetailFeedContext {
  key: string;
  source: ReviewDetailFeedSurface;
  selectedReviewId: string;
  initialIndex: number;
  reviews: ReviewSummary[];
  home?: {
    categoryId?: string | null;
    refreshSeed?: string;
    userId?: string;
  };
  search?: {
    filters: ReviewDetailFeedSearchFilters;
    refreshSeed?: string;
  };
  createdAt: number;
}

let currentContext: ReviewDetailFeedContext | null = null;

export function createReviewDetailFeedKey(source: ReviewDetailFeedSurface) {
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setReviewDetailFeedContext(
  context: Omit<ReviewDetailFeedContext, "createdAt">
) {
  currentContext = {
    ...context,
    initialIndex: Math.max(0, context.initialIndex),
    reviews: uniqueReviews(context.reviews),
    createdAt: Date.now()
  };
  return currentContext.key;
}

export function getReviewDetailFeedContext(key?: string | string[] | null) {
  const normalizedKey = Array.isArray(key) ? key[0] : key;
  if (!currentContext) return null;
  if (normalizedKey && currentContext.key !== normalizedKey) return null;
  if (Date.now() - currentContext.createdAt > 10 * 60 * 1000) {
    currentContext = null;
    return null;
  }
  return currentContext;
}

function uniqueReviews(reviews: ReviewSummary[]) {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    if (seen.has(review.id)) return false;
    seen.add(review.id);
    return true;
  });
}
