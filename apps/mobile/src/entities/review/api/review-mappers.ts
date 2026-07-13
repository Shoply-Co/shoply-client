import type {
  Category,
  DisclosureState as ApiDisclosureState,
  HomeEnvelopeData,
  ReviewDetail as ApiReviewDetail,
  ReviewLink as ApiReviewLink,
  ReviewMedia as ApiReviewMedia,
  ReviewSummary as ApiReviewSummary
} from "@/shared/api/generated/shoply";
import { DisclosureState, ReviewLinkSticker, ReviewMediaItem, ReviewSummary } from "../model/types";
import { firstNonEmptyString, isLikelyImageUrl, isLikelyVideoUrl } from "../lib/media-url";

export function mapApiDisclosure(state?: ApiDisclosureState | string): DisclosureState {
  if (!state || state === "none" || state === "direct_purchase") return "none";
  if (state === "affiliate") return "affiliate";
  if (state === "paid_sponsorship") return "sponsored";
  if (state === "gifted") return "provided";
  if (state === "staff_editorial") return "none";
  return "none";
}

export function mapApiReviewSummary(
  review: ApiReviewSummary,
  _index = 0,
  categoriesById = new Map<string, Category>()
): ReviewSummary {
  const raw = review as ApiReviewSummary & {
    body?: string;
    productId?: string | null;
    brandId?: string | null;
  };
  const preview = review.bodyPreview ?? raw.body ?? "";
  const productName = review.product?.name ?? review.title ?? preview.slice(0, 24) ?? "Shoply 리뷰";
  const brandName = getReviewBrandName(review);
  const brandNames = getReviewBrandNames(review);
  const merchantSiteNames = uniqueNames((review.merchantSites ?? []).map((item) => item.name));
  const metrics = review.metrics ?? {};
  const media = mapApiReviewMedia(review.media ?? []);
  const primaryMedia = media[0];
  const mediaUrl =
    firstNonEmptyString(primaryMedia?.previewUrl, review.representativeMediaUrl) ?? "";
  const mediaType = primaryMedia?.mediaType ?? inferMediaTypeFromUrl(mediaUrl);

  const purchaseVerifiedStatus = String(review.purchaseVerifiedStatus ?? "none");

  return {
    id: review.id,
    authorId: review.author.userId,
    productId: raw.productId ?? review.product?.id ?? null,
    brandId: raw.brandId ?? review.brand?.id ?? review.product?.brand?.id ?? null,
    productName,
    brandName,
    brandNames,
    merchantSiteNames,
    creatorNickname: review.author.nickname,
    creatorProfileImageUrl: review.author.profileImageUrl,
    creatorBadge: purchaseVerificationLabel(purchaseVerifiedStatus),
    purchaseVerifiedStatus,
    mediaUrl,
    mediaType,
    media,
    categoryId: review.categoryId,
    category:
      categoriesById.get(review.categoryId)?.name ??
      review.product?.categoryId ??
      review.categoryId,
    price: Number(review.purchasePrice ?? 0),
    body: preview,
    disclosureState: mapApiDisclosure(review.disclosureState),
    likes: metrics.likeCount ?? 0,
    saves: metrics.saveCount ?? 0,
    linkClicks: metrics.validLinkClickCount ?? metrics.rawLinkClickCount ?? 0,
    hasLinks: Boolean(review.activeLinkCount),
    stickers: [],
    publishedAt: review.publishedAt ?? undefined
  };
}

function getReviewBrandName(review: ApiReviewSummary) {
  return getReviewBrandNames(review)[0] ?? "";
}

function getReviewBrandNames(review: ApiReviewSummary) {
  return uniqueNames([
    ...(review.brands ?? []).map((item) => item.name),
    review.brand?.name,
    review.product?.brand?.name
  ]);
}

function uniqueNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.reduce<string[]>((names, value) => {
    const name = value?.trim();
    const key = name?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
    if (!name || !key || seen.has(key)) return names;
    seen.add(key);
    names.push(name);
    return names;
  }, []);
}

function purchaseVerificationLabel(status?: string | null) {
  if (status === "verified") return "구매 인증";
  if (status === "pending") return "인증 대기";
  if (status === "review_required") return "인증 검토";
  if (status === "rejected") return "인증 반려";
  return undefined;
}

export function mapApiReviewDetail(review: ApiReviewDetail, index = 0): ReviewSummary {
  const summary = mapApiReviewSummary(review, index);
  const media = mapApiReviewMedia(review.media);
  const primaryMedia = media[0];

  return {
    ...summary,
    body: review.body,
    mediaUrl: primaryMedia?.previewUrl ?? summary.mediaUrl,
    mediaType: primaryMedia?.mediaType ?? summary.mediaType,
    media,
    stickers: review.links.map(mapApiReviewLink).filter(Boolean) as ReviewLinkSticker[],
    hasLinks: review.links.some(
      (link) => link.status === "active" || link.status === "review_required"
    )
  };
}

function urlFromStorageKey(value?: string | null) {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value) ? value : undefined;
}

function mapApiReviewMedia(media: ApiReviewMedia[]): ReviewMediaItem[] {
  return media
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status !== "deleted" && item.status !== "blocked")
    .sort(
      (left, right) =>
        Number(left.item.sortOrder ?? left.index) - Number(right.item.sortOrder ?? right.index)
    )
    .map(({ item, index }) => {
      const rawItem = item as ApiReviewMedia & {
        variantsPayload?: { playback?: { mutedByDefault?: boolean } };
      };
      const mediaType = normalizeMediaType(item.mediaType) ?? "image";
      const responsiveUrls = item.responsiveUrls ?? {};
      const directUrl = item.url ?? undefined;
      const storageUrl = firstNonEmptyString(item.storageUrl, urlFromStorageKey(item.storageKey));
      const thumbnailUrl = firstNonEmptyString(
        item.thumbnailUrl,
        responsiveUrls.thumbnail,
        urlFromStorageKey(item.thumbnailKey)
      );
      const directImageUrl = directUrl && !isLikelyVideoUrl(directUrl) ? directUrl : undefined;
      const directVideoUrl = directUrl && !isLikelyImageUrl(directUrl) ? directUrl : undefined;
      const imageUrl = firstNonEmptyString(
        responsiveUrls.large,
        responsiveUrls.medium,
        responsiveUrls.small,
        directImageUrl,
        storageUrl && !isLikelyVideoUrl(storageUrl) ? storageUrl : undefined,
        thumbnailUrl
      );
      const videoUrl = firstNonEmptyString(
        storageUrl,
        responsiveUrls.video_1080p,
        responsiveUrls.video_720p,
        responsiveUrls.video,
        directVideoUrl
      );
      const url = mediaType === "video" ? videoUrl : imageUrl;
      const previewUrl =
        mediaType === "video"
          ? firstNonEmptyString(thumbnailUrl, directImageUrl, imageUrl, videoUrl)
          : imageUrl;
      if (!url || !previewUrl) return null;

      return {
        id: item.id ?? `${mediaType}-${index}`,
        mediaType,
        url,
        previewUrl,
        thumbnailUrl,
        storageUrl,
        width: item.width ?? null,
        height: item.height ?? null,
        durationMs: item.durationMs ?? null,
        mutedByDefault: rawItem.variantsPayload?.playback?.mutedByDefault !== false
      } satisfies ReviewMediaItem;
    })
    .filter(Boolean) as ReviewMediaItem[];
}

function normalizeMediaType(value?: string | null): ReviewMediaItem["mediaType"] | undefined {
  if (value === "video") return "video";
  if (value === "image") return "image";
  return undefined;
}

function inferMediaTypeFromUrl(value: string): ReviewMediaItem["mediaType"] {
  return isLikelyVideoUrl(value) ? "video" : "image";
}

export function extractHomeReviewSummaries(home?: HomeEnvelopeData): ReviewSummary[] {
  if (!home) return [];
  const categoriesById = new Map(
    (home.categories ?? []).map((category) => [category.id, category])
  );
  const seen = new Set<string>();

  return (
    home.sections
      ?.flatMap((section) => section.items)
      .filter((item) => item.itemType === "review")
      .map((item, index) =>
        mapApiReviewSummary(item.data as ApiReviewSummary, index, categoriesById)
      )
      .filter((review) => {
        if (seen.has(review.id)) return false;
        seen.add(review.id);
        return true;
      }) ?? []
  );
}

function mapApiReviewLink(link: ApiReviewLink): ReviewLinkSticker | null {
  if (link.status === "deleted" || link.status === "replaced") return null;

  const merchantName =
    link.destination?.merchantSite?.name ??
    link.offer?.merchantSite?.name ??
    link.label ??
    "상품 링크";
  const url = link.destination?.normalizedUrl;
  if (!url) return null;
  const domain = link.destination?.domain ?? link.destination?.merchantSite?.domain ?? "unknown";
  const stickerType = normalizeStickerType(link.stickerType, link.inputMethod);

  return {
    id: link.id,
    mediaId: link.mediaId ?? undefined,
    label: link.label,
    merchantName,
    domain,
    url,
    xRatio: Number(link.xRatio ?? 0.52),
    yRatio: Number(link.yRatio ?? 0.56),
    widthRatio: Number(link.widthRatio ?? 0.34),
    heightRatio: Number(link.heightRatio ?? 0.08),
    type: stickerType,
    visualVariant: normalizeVisualVariant(link.visualVariant),
    emoji: link.emoji ?? undefined,
    assetUrl: link.assetUrl ?? null
  };
}

function normalizeStickerType(
  value: string | null | undefined,
  inputMethod?: string | null
): ReviewLinkSticker["type"] {
  if (value === "button") return "button";
  if (value === "asset_cutout") return "asset_cutout";
  if (value === "uploaded_image") return "uploaded_image";
  if (value === "uploaded_video") return "uploaded_video";
  if (value === "hotspot_dot") return "hotspot_dot";
  if (value === "text") return "text";
  return inputMethod === "media_sticker" ? "asset_cutout" : "button";
}

function normalizeVisualVariant(
  value: string | null | undefined
): ReviewLinkSticker["visualVariant"] {
  if (value === "pill") return "pill";
  if (value === "arrow") return "arrow";
  if (value === "burst") return "burst";
  if (value === "bag") return "bag";
  if (value === "chrome") return "chrome";
  if (value === "cart") return "cart";
  if (value === "emoji") return "emoji";
  if (value === "ribbon") return "ribbon";
  if (value === "badge") return "badge";
  if (value === "pointer") return "pointer";
  if (value === "spark") return "spark";
  return undefined;
}
