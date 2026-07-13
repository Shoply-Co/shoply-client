import { apiRequest } from "@/shared/api/client";
import type {
  Brand,
  CommerceDestination,
  MerchantSite,
  Product,
  ProductOffer,
  ReviewDetail,
  ReviewLink,
  ReviewMedia
} from "@/shared/api/generated/shoply";

export interface DraftDirectPurchaseLink {
  id: string;
  label: string;
  url: string;
  stickerType:
    "button" | "asset_cutout" | "uploaded_image" | "uploaded_video" | "hotspot_dot" | "text";
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  assetUri?: string;
  assetFileName?: string | null;
  assetMimeType?: string | null;
  visualVariant?:
    | "pill"
    | "arrow"
    | "burst"
    | "bag"
    | "chrome"
    | "cart"
    | "emoji"
    | "ribbon"
    | "badge"
    | "pointer"
    | "spark";
  emoji?: string;
  textColor?: string;
  textScale?: number;
  fontSizePx?: number;
  assetUrl?: string | null;
  merchantSiteId?: string;
  merchantName?: string;
}

export interface CreateReviewInput {
  categoryId: string;
  productId?: string;
  brandId?: string | null;
  brandIds?: string[];
  merchantSiteIds?: string[];
  title?: string;
  body?: string;
  purchasePrice?: number;
  disclosureState: string;
}

export interface DraftMediaInput {
  uri: string;
  mediaType: "image" | "video";
  fileName?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  trimDurationMs?: number | null;
  mutedByDefault?: boolean;
  sortOrder?: number;
}

export interface DraftPurchaseProofInput {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  proofType?: "receipt";
  productName?: string;
  purchaseAmount?: number;
  currency?: string;
}

type ReviewLinkInputMethod = "button" | "media_sticker" | "direct_url";

interface ReviewMediaUploadResult {
  storageKey: string;
  publicUrl?: string | null;
  thumbnailKey?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  variantsPayload?: unknown;
}

export async function uploadReviewStickerImage(input: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}) {
  const uploaded = await uploadReviewMedia({
    uri: input.uri,
    mediaType: "image",
    fileName: input.fileName ?? "review-link-sticker.jpg",
    mimeType: input.mimeType ?? "image/jpeg"
  });

  if (!uploaded.publicUrl) {
    throw new Error("사진 스티커 업로드 주소를 만들지 못했어요.");
  }

  return uploaded.publicUrl;
}

interface PurchaseProofUploadResult {
  storageKey: string;
  publicUrl?: string;
  thumbnailKey?: string | null;
  sha256?: string;
  originalSha256?: string;
}

export interface ResolveProductInput {
  productName: string;
  brandId?: string;
  brandName?: string;
  categoryId: string;
}

export interface ResolveDirectPurchaseOfferInput {
  productId: string;
  productName: string;
  merchantName?: string;
  link: DraftDirectPurchaseLink;
  price?: number;
}

export async function createReviewDraft(input: CreateReviewInput) {
  return apiRequest<ReviewDetail>("/reviews", {
    method: "POST",
    body: JSON.stringify({
      productId: input.productId,
      brandId: input.brandId,
      brandIds: input.brandIds ?? [],
      merchantSiteIds: input.merchantSiteIds ?? [],
      categoryId: input.categoryId,
      title: input.title,
      body: input.body ?? "",
      purchasePrice: input.purchasePrice,
      disclosureState: input.disclosureState
    })
  });
}

export async function resolveReviewProduct(input: ResolveProductInput) {
  return apiRequest<Product>("/products/resolve", {
    method: "POST",
    body: JSON.stringify({
      name: input.productName,
      brandId: input.brandId,
      brandName: input.brandName?.trim() || undefined,
      categoryId: input.categoryId
    })
  });
}

export async function resolveDirectPurchaseOffer(input: ResolveDirectPurchaseOfferInput) {
  return apiRequest<{ offer: ProductOffer; destination: CommerceDestination }>(
    "/product-offers/resolve",
    {
      method: "POST",
      body: JSON.stringify({
        productId: input.productId,
        offerType: "external_link",
        title: input.productName,
        merchantName: input.merchantName ?? input.link.merchantName,
        merchantSiteId: input.link.merchantSiteId,
        price: input.price,
        currency: "KRW",
        originalUrl: input.link.url,
        destinationType: "external_url"
      })
    }
  );
}

export function resolveBrandIdentity(name: string, createNew = false) {
  return apiRequest<Brand>("/brands/resolve", {
    method: "POST",
    body: JSON.stringify({ name, createNew })
  });
}

export function resolveMerchantIdentity(input: {
  name?: string;
  url?: string;
  createNew?: boolean;
}) {
  return apiRequest<MerchantSite>("/merchant-sites/resolve", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function attachReviewMedia(reviewId: string, media: DraftMediaInput) {
  const uploaded = await uploadReviewMedia(media);
  const uploadedVariantsPayload =
    uploaded.variantsPayload &&
    typeof uploaded.variantsPayload === "object" &&
    !Array.isArray(uploaded.variantsPayload)
      ? uploaded.variantsPayload
      : {};

  return apiRequest<ReviewMedia>(`/reviews/${reviewId}/media`, {
    method: "POST",
    body: JSON.stringify({
      mediaType: media.mediaType,
      storageKey: uploaded.storageKey,
      thumbnailKey: uploaded.thumbnailKey ?? undefined,
      variantsPayload: {
        ...uploadedVariantsPayload,
        playback: {
          mutedByDefault: media.mediaType === "video" ? media.mutedByDefault !== false : true
        }
      },
      width: uploaded.width ?? undefined,
      height: uploaded.height ?? undefined,
      durationMs: uploaded.durationMs ?? media.durationMs ?? undefined,
      sortOrder: media.sortOrder ?? 0,
      status: "ready"
    })
  });
}

async function uploadReviewMedia(media: DraftMediaInput) {
  const fileName = media.fileName ?? defaultMediaFileName(media.mediaType);
  const formData = new FormData();
  formData.append("mediaType", media.mediaType);
  formData.append("fileName", fileName);
  if (media.durationMs && media.durationMs > 0) {
    formData.append("durationMs", String(Math.round(media.durationMs)));
  }
  if (media.trimDurationMs && media.trimDurationMs > 0) {
    formData.append("trimDurationMs", String(Math.round(media.trimDurationMs)));
  }
  formData.append("file", {
    uri: media.uri,
    name: fileName,
    type: media.mimeType ?? defaultMediaMimeType(media.mediaType)
  } as unknown as Blob);

  return apiRequest<ReviewMediaUploadResult>("/uploads/review-media", {
    method: "POST",
    body: formData as RequestInit["body"]
  });
}

export async function attachPurchaseProof(reviewId: string, proof: DraftPurchaseProofInput) {
  const uploaded = await uploadPurchaseProofImage(proof);

  return apiRequest(`/reviews/${reviewId}/purchase-proofs`, {
    method: "POST",
    body: JSON.stringify({
      proofType: proof.proofType ?? "receipt",
      originalStorageKey: uploaded.storageKey,
      redactedStorageKey: uploaded.storageKey,
      originalFileHash: uploaded.originalSha256 ?? uploaded.sha256,
      submittedProductName: proof.productName,
      submittedPurchaseAmount: proof.purchaseAmount,
      submittedCurrency: proof.currency ?? "KRW"
    })
  });
}

async function uploadPurchaseProofImage(proof: DraftPurchaseProofInput) {
  const fileName = proof.fileName ?? "purchase-receipt.jpg";
  const formData = new FormData();
  formData.append("proofType", proof.proofType ?? "receipt");
  formData.append("fileName", fileName);
  formData.append("file", {
    uri: proof.uri,
    name: fileName,
    type: proof.mimeType ?? "image/jpeg"
  } as unknown as Blob);

  return apiRequest<PurchaseProofUploadResult>("/uploads/purchase-proofs", {
    method: "POST",
    body: formData as RequestInit["body"]
  });
}

function defaultMediaFileName(mediaType: DraftMediaInput["mediaType"]) {
  return mediaType === "video" ? "review-video.mp4" : "review-image.jpg";
}

function defaultMediaMimeType(mediaType: DraftMediaInput["mediaType"]) {
  return mediaType === "video" ? "video/mp4" : "image/jpeg";
}

export async function addDirectPurchaseLink(
  reviewId: string,
  link: DraftDirectPurchaseLink,
  refs: {
    productId: string;
    productOfferId: string;
    commerceDestinationId: string;
    mediaId?: string;
  },
  options: {
    inputMethod?: ReviewLinkInputMethod;
    includePlacement?: boolean;
  } = {}
) {
  const inputMethod =
    options.inputMethod ?? (link.stickerType === "button" ? "button" : "media_sticker");
  const includePlacement = options.includePlacement ?? inputMethod !== "direct_url";

  return apiRequest<ReviewLink>(`/reviews/${reviewId}/links`, {
    method: "POST",
    body: JSON.stringify({
      productId: refs.productId,
      productOfferId: refs.productOfferId,
      commerceDestinationId: refs.commerceDestinationId,
      mediaId: includePlacement ? refs.mediaId : undefined,
      originalUrl: link.url,
      inputMethod,
      label: link.label,
      stickerType: link.stickerType,
      visualVariant: link.visualVariant,
      emoji: link.emoji,
      assetUrl: link.assetUrl,
      destinationType: "external_url",
      xRatio: includePlacement ? link.xRatio : undefined,
      yRatio: includePlacement ? link.yRatio : undefined,
      widthRatio: includePlacement ? link.widthRatio : undefined,
      heightRatio: includePlacement ? link.heightRatio : undefined
    })
  });
}

export async function requestReviewPublish(reviewId: string) {
  return apiRequest<ReviewDetail>(`/reviews/${reviewId}/publish-requests`, {
    method: "POST"
  });
}
