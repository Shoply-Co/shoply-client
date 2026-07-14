export interface ProfileImageMetadataInput {
  uri: string;
  fileName?: string | null;
  fallbackFileName?: string | null;
  mimeType?: string | null;
}

export type ProfileImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/heic"
  | "image/heic-sequence"
  | "image/heif"
  | "image/heif-sequence";

const MIME_BY_EXTENSION: Record<string, ProfileImageMimeType> = {
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const PROFILE_IMAGE_MIME_TYPES = new Set<ProfileImageMimeType>([
  ...Object.values(MIME_BY_EXTENSION),
  "image/heic-sequence",
  "image/heif-sequence"
]);

export function resolveProfileImageUploadMetadata(image: ProfileImageMetadataInput) {
  const candidate =
    image.fileName?.trim() || image.fallbackFileName?.trim() || fileNameFromUri(image.uri);
  const mimeType = resolveMimeType(image, candidate);
  const extension = extensionForMimeType(mimeType);
  const baseName = (candidate?.replace(/\.[^.]+$/, "") ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return {
    fileName: `${baseName || "profile-image"}.${extension}`,
    mimeType
  };
}

function resolveMimeType(
  image: ProfileImageMetadataInput,
  fileName?: string | null
): ProfileImageMimeType {
  const uriExtension = extensionFromPath(image.uri);
  if (uriExtension && MIME_BY_EXTENSION[uriExtension]) {
    return MIME_BY_EXTENSION[uriExtension];
  }

  const fileNameExtension = extensionFromPath(fileName);
  if (fileNameExtension && MIME_BY_EXTENSION[fileNameExtension]) {
    return MIME_BY_EXTENSION[fileNameExtension];
  }

  const normalized = image.mimeType?.trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized && PROFILE_IMAGE_MIME_TYPES.has(normalized as ProfileImageMimeType)) {
    return normalized as ProfileImageMimeType;
  }
  return "image/jpeg";
}

function extensionFromPath(value?: string | null) {
  return value
    ?.trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)(?:[?#].*)?$/)?.[1];
}

function extensionForMimeType(mimeType: ProfileImageMimeType) {
  return {
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heic-sequence": "heic",
    "image/heif": "heif",
    "image/heif-sequence": "heif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[mimeType];
}

function fileNameFromUri(uri: string) {
  const lastSegment = uri.split(/[?#]/)[0]?.split("/").pop() ?? "";
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}
