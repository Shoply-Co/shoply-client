import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest, type ApiEnvelope } from "@/shared/api/client";
import type {
  HomeEnvelope,
  HomeEnvelopeData,
  ReviewDetail as ApiReviewDetail,
  ReviewReport,
  SearchReviewListEnvelope
} from "@/shared/api/generated/shoply";
import { extractHomeReviewSummaries, mapApiReviewDetail, mapApiReviewSummary } from "./review-mappers";
import type { ReviewSummary } from "../model/types";

export interface SearchReviewFilters {
  query: string;
  categoryId?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  userId?: string | null;
  facetFilters?: SearchReviewFacetFilter[];
}

export interface SearchReviewFacetFilter {
  key: string;
  value: string;
}

export interface ReportReasonOption {
  code: string;
  label: string;
  description?: string;
}

export type ReviewInteractionType = "like" | "save";

interface HomeReviewsPage {
  reviews: ReviewSummary[];
  nextCursor: string | null;
}

interface HomeReviewsPageParam {
  cursor: string | null;
}

interface SearchReviewsPage {
  reviews: ReviewSummary[];
  nextCursor: string | null;
}

interface SearchReviewsPageParam {
  cursor: string | null;
}

interface ReviewListQueryOptions {
  enabled?: boolean;
  mediaOnly?: boolean;
}

export const DEFAULT_SEARCH_REVIEWS_REFRESH_SEED = "search-default";
const REVIEW_LIST_PAGE_LIMIT = 36;

export function useHomeReviews(
  categoryId?: string | null,
  refreshSeed?: string,
  userId?: string,
  options: ReviewListQueryOptions = {}
) {
  const query = useInfiniteQuery({
    queryKey: ["home", "reviews", categoryId ?? "all", refreshSeed ?? "stable", userId ?? "anonymous"],
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    initialPageParam: { cursor: null } as HomeReviewsPageParam,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "36" });
      if (categoryId) params.set("categoryId", categoryId);
      if (refreshSeed) params.set("refreshSeed", refreshSeed);
      if (pageParam.cursor) params.set("cursor", pageParam.cursor);

      const homeEnvelope = await apiRequest<HomeEnvelope | ApiEnvelope<HomeEnvelope>>(`/home?${params.toString()}`, {
        unwrapEnvelope: false
      });
      const home = unwrapResponseEnvelope(homeEnvelope);
      const payload = home.data ?? (home as unknown as HomeEnvelopeData);
      const payloadPage = (payload as HomeEnvelopeData & { page?: { nextCursor?: string | null } }).page;

      return {
        reviews: mediaReviews(extractHomeReviewSummaries(payload)),
        nextCursor: home.page?.nextCursor ?? payloadPage?.nextCursor ?? null
      } satisfies HomeReviewsPage;
    },
    getNextPageParam: (lastPage: HomeReviewsPage) => {
      if (!lastPage.nextCursor) return undefined;
      return {
        cursor: lastPage.nextCursor
      } satisfies HomeReviewsPageParam;
    },
    retry: 1
  });

  const reviews = useMemo(
    () => mediaReviews(uniqueReviews(query.data?.pages.flatMap((page) => page.reviews) ?? [])),
    [query.data?.pages]
  );

  return {
    ...query,
    data: reviews
  };
}

export function useSearchReviews(
  filters: SearchReviewFilters,
  refreshSeed?: string,
  options: ReviewListQueryOptions = {}
) {
  const mediaOnly = options.mediaOnly ?? false;
  const query = useInfiniteQuery({
    queryKey: searchReviewsQueryKey(filters, refreshSeed, mediaOnly),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    initialPageParam: { cursor: null } as SearchReviewsPageParam,
    queryFn: ({ pageParam }) => fetchSearchReviewsPage(filters, refreshSeed, pageParam, { mediaOnly }),
    getNextPageParam: (lastPage: SearchReviewsPage) => {
      if (!lastPage.nextCursor) return undefined;
      return {
        cursor: lastPage.nextCursor
      } satisfies SearchReviewsPageParam;
    },
    retry: 1
  });

  const reviews = useMemo(
    () => {
      const pageReviews = uniqueReviews(query.data?.pages.flatMap((page) => page.reviews) ?? []);
      return mediaOnly ? mediaReviews(pageReviews) : pageReviews;
    },
    [mediaOnly, query.data?.pages]
  );

  return {
    ...query,
    data: reviews
  };
}

export function prefetchInitialSearchReviews(client: QueryClient, userId?: string | null) {
  const filters = initialSearchReviewFilters(userId);
  return client.prefetchInfiniteQuery({
    queryKey: searchReviewsQueryKey(filters, DEFAULT_SEARCH_REVIEWS_REFRESH_SEED),
    initialPageParam: { cursor: null } as SearchReviewsPageParam,
    queryFn: ({ pageParam }) => fetchSearchReviewsPage(filters, DEFAULT_SEARCH_REVIEWS_REFRESH_SEED, pageParam),
    getNextPageParam: (lastPage: SearchReviewsPage) => {
      if (!lastPage.nextCursor) return undefined;
      return {
        cursor: lastPage.nextCursor
      } satisfies SearchReviewsPageParam;
    }
  });
}

export function initialSearchReviewFilters(userId?: string | null): SearchReviewFilters {
  return {
    query: "",
    categoryId: null,
    priceMin: null,
    priceMax: null,
    userId: userId ?? null
  };
}

function searchReviewsQueryKey(filters: SearchReviewFilters, refreshSeed?: string, mediaOnly = false) {
  return [
    "search",
    "reviews",
    normalizeSearchReviewFilters(filters),
    refreshSeed ?? "stable",
    mediaOnly ? "media-only" : "all"
  ] as const;
}

async function fetchSearchReviewsPage(
  filters: SearchReviewFilters,
  refreshSeed: string | undefined,
  pageParam: SearchReviewsPageParam,
  options: { mediaOnly?: boolean } = {}
) {
  const normalizedFilters = normalizeSearchReviewFilters(filters);
  const params = new URLSearchParams({ limit: String(REVIEW_LIST_PAGE_LIMIT) });
  if (normalizedFilters.query) params.set("q", normalizedFilters.query);
  if (normalizedFilters.categoryId) params.set("categoryId", normalizedFilters.categoryId);
  if (normalizedFilters.priceMin !== null) params.set("priceMin", String(normalizedFilters.priceMin));
  if (normalizedFilters.priceMax !== null) params.set("priceMax", String(normalizedFilters.priceMax));
  for (const facetFilter of normalizedFilters.facetFilters) {
    params.append("facetFilters", `${facetFilter.key}:${facetFilter.value}`);
  }
  if (refreshSeed) params.set("refreshSeed", refreshSeed);
  if (pageParam.cursor) params.set("cursor", pageParam.cursor);

  const resultEnvelope = await apiRequest<SearchReviewListEnvelope | ApiEnvelope<SearchReviewListEnvelope>>(`/search/reviews?${params.toString()}`, {
    unwrapEnvelope: false
  });
  const result = unwrapPagedReviewList(resultEnvelope);
  const mappedReviews = (result.data ?? []).map((review, index) => mapApiReviewSummary(review, index));
  return {
    reviews: options.mediaOnly ? mediaReviews(mappedReviews) : mappedReviews,
    nextCursor: result.page?.nextCursor ?? null
  } satisfies SearchReviewsPage;
}

function normalizeSearchReviewFilters(filters: SearchReviewFilters) {
  const query = filters.query.trim();
  return {
    query,
    categoryId: filters.categoryId ?? null,
    priceMin: filters.priceMin ?? null,
    priceMax: filters.priceMax ?? null,
    userId: query ? null : (filters.userId ?? null),
    facetFilters: normalizeFacetFilters(filters.facetFilters ?? [])
  };
}

function normalizeFacetFilters(filters: SearchReviewFacetFilter[]) {
  return [...filters]
    .filter((filter) => filter.key.trim() && filter.value.trim())
    .map((filter) => ({ key: filter.key.trim(), value: filter.value.trim() }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.value.localeCompare(right.value));
}

function unwrapPagedReviewList(value: SearchReviewListEnvelope | ApiEnvelope<SearchReviewListEnvelope>): SearchReviewListEnvelope {
  if (Array.isArray(value)) {
    return { data: value };
  }
  if (value && typeof value === "object" && "meta" in value && "data" in value) {
    const record = value as unknown as Record<string, unknown>;
    if ("page" in record || "searchMeta" in record) {
      return {
        data: Array.isArray(record["data"]) ? (record["data"] as SearchReviewListEnvelope["data"]) : [],
        page: record["page"] as SearchReviewListEnvelope["page"],
        searchMeta: record["searchMeta"] as SearchReviewListEnvelope["searchMeta"]
      };
    }
    return (value as ApiEnvelope<SearchReviewListEnvelope>).data;
  }
  return value as SearchReviewListEnvelope;
}

function unwrapResponseEnvelope<T>(value: T | ApiEnvelope<T>): T {
  if (value && typeof value === "object" && "meta" in value && "data" in value) {
    return (value as ApiEnvelope<T>).data;
  }
  return value as T;
}

export function useReviewDetail(reviewId?: string) {
  return useQuery({
    queryKey: ["review", "detail", reviewId],
    queryFn: async () => {
      if (!reviewId) throw new Error("reviewId is required");
      const result = await apiRequest<ApiReviewDetail>(`/reviews/${reviewId}`, { auth: false });
      return mapApiReviewDetail(result);
    },
    enabled: Boolean(reviewId),
    retry: 1
  });
}

export function useReviewActivityState(enabled: boolean) {
  return useQuery({
    queryKey: ["reviews", "viewer-activity"],
    enabled,
    queryFn: async () => {
      const response = await apiRequest<
        Array<{ id: string; _activityTypes?: string[] }> | { data?: Array<{ id: string; _activityTypes?: string[] }> }
      >("/users/me/activity/reviews?limit=100");
      const reviews = Array.isArray(response) ? response : response.data ?? [];
      const activity: Record<string, { liked?: boolean; saved?: boolean }> = {};

      for (const review of reviews) {
        const activityTypes = new Set(review._activityTypes ?? []);
        activity[review.id] = {
          liked: activityTypes.has("like"),
          saved: activityTypes.has("save")
        };
      }

      return activity;
    },
    retry: 1
  });
}

export function useToggleReviewInteraction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewId,
      interactionType,
      active,
      sourceSurface = "review_detail"
    }: {
      reviewId: string;
      interactionType: ReviewInteractionType;
      active: boolean;
      sourceSurface?: string;
    }) => setReviewInteraction(reviewId, interactionType, active, sourceSurface),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reviews", "viewer-activity"] }),
        queryClient.invalidateQueries({ queryKey: ["review", "detail", variables.reviewId] }),
        queryClient.invalidateQueries({ queryKey: ["home", "reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["users", "me", "activity", "reviews"] })
      ]);
    }
  });
}

export function useReviewReportReasons() {
  return useQuery({
    queryKey: ["reviews", "report-reasons"],
    queryFn: () => apiRequest<ReportReasonOption[]>("/reviews/report-reasons", { auth: false }),
    retry: 1
  });
}

export function submitReviewReport(reviewId: string, reasonCode: string, reasonText?: string) {
  return apiRequest<ReviewReport>(`/reviews/${reviewId}/reports`, {
    method: "POST",
    body: JSON.stringify({
      reasonCode,
      reasonText: reasonText?.trim() || undefined,
      sourceSurface: "review_detail"
    })
  });
}

export function setReviewInteraction(
  reviewId: string,
  interactionType: ReviewInteractionType,
  active: boolean,
  sourceSurface = "review_detail"
) {
  return apiRequest<void>(`/reviews/${reviewId}/interactions/${interactionType}`, {
    method: active ? "PUT" : "DELETE",
    body: active
      ? JSON.stringify({
          sourceSurface,
          clientEventId: `${sourceSurface}-${interactionType}-${reviewId}-${Date.now()}`
        })
      : undefined
  });
}

function uniqueReviews(reviews: ReviewSummary[]) {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    if (seen.has(review.id)) return false;
    seen.add(review.id);
    return true;
  });
}

export function mediaReviews(reviews: ReviewSummary[]) {
  return reviews.filter((review) => Boolean(review.mediaUrl));
}
