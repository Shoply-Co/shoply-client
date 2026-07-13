import type { ReviewLinkSticker } from "./types";

export type StickerArtworkVariant = Exclude<
  NonNullable<ReviewLinkSticker["visualVariant"]>,
  "pill" | "emoji"
>;

interface StickerArtworkGeometry {
  viewBox: string;
  labelMaxWidth: number;
}

const stickerArtworkGeometryByVariant: Record<StickerArtworkVariant, StickerArtworkGeometry> = {
  spark: { viewBox: "24 2 90 85", labelMaxWidth: 0 },
  cart: { viewBox: "31 7 78 78", labelMaxWidth: 70 },
  bag: { viewBox: "24 13 92 70", labelMaxWidth: 84 },
  arrow: { viewBox: "10 16 110 58", labelMaxWidth: 82 },
  chrome: { viewBox: "12 20 116 52", labelMaxWidth: 108 },
  ribbon: { viewBox: "17 25 106 42", labelMaxWidth: 96 },
  badge: { viewBox: "32 8 76 76", labelMaxWidth: 68 },
  pointer: { viewBox: "18 23 94 44", labelMaxWidth: 82 },
  burst: { viewBox: "5 6 131 82", labelMaxWidth: 108 }
};

export function getStickerArtworkGeometry(variant: StickerArtworkVariant) {
  return stickerArtworkGeometryByVariant[variant];
}
