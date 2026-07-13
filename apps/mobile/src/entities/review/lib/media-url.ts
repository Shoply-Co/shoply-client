const VIDEO_URL_PATTERN = /\.(mp4|m4v|mov|webm|m3u8)(?:[?#]|$)|\/video\//i;
const IMAGE_URL_PATTERN = /\.(avif|gif|heic|jpe?g|png|webp)(?:[?#]|$)|\/image\//i;

export function firstNonEmptyString(...values: Array<string | null | undefined>) {
  return values.find((value): value is string => Boolean(value?.trim()));
}

export function isLikelyVideoUrl(value?: string | null) {
  return Boolean(value && VIDEO_URL_PATTERN.test(value));
}

export function isLikelyImageUrl(value?: string | null) {
  return Boolean(value && IMAGE_URL_PATTERN.test(value));
}
