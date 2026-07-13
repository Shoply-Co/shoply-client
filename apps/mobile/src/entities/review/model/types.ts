export type DisclosureState =
  "none" | "direct_purchase" | "affiliate" | "sponsored" | "ad" | "provided";
export type PurchaseVerificationDisplayStatus =
  "none" | "pending" | "verified" | "review_required" | "rejected";

export interface ReviewLinkSticker {
  id: string;
  mediaId?: string;
  label: string;
  merchantName: string;
  domain: string;
  url: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  type: "button" | "asset_cutout" | "uploaded_image" | "uploaded_video" | "hotspot_dot" | "text";
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
  assetUrl?: string | null;
}

export interface ReviewMediaItem {
  id: string;
  mediaType: "image" | "video";
  url: string;
  previewUrl: string;
  thumbnailUrl?: string | null;
  storageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  mutedByDefault?: boolean;
}

export interface ReviewSummary {
  id: string;
  authorId?: string;
  productId?: string | null;
  brandId?: string | null;
  productName: string;
  brandName: string;
  brandNames: string[];
  merchantSiteNames: string[];
  creatorNickname: string;
  creatorProfileImageUrl?: string | null;
  creatorBadge?: string;
  purchaseVerifiedStatus?: PurchaseVerificationDisplayStatus | string;
  mediaUrl: string;
  mediaType: "image" | "video";
  media: ReviewMediaItem[];
  categoryId?: string;
  category: string;
  price: number;
  body: string;
  disclosureState: DisclosureState;
  likes: number;
  saves: number;
  linkClicks?: number;
  hasLinks: boolean;
  stickers: ReviewLinkSticker[];
  publishedAt?: string | null;
  viewerActivity?: {
    liked?: boolean;
    saved?: boolean;
  };
}
