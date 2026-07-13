import * as Haptics from "expo-haptics";
import {
  CameraView,
  PermissionStatus,
  useCameraPermissions,
  useMicrophonePermissions
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Images,
  Link as LinkIcon,
  Minus,
  Palette,
  Play,
  Plus,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  X
} from "lucide-react-native";
import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  TextInput,
  TextInputProps,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import {
  Button,
  Chip,
  KeyboardAwareBottomSheet,
  ShoplyText,
  useShoplyTheme
} from "@shoply/design-system";
import { Controller, useForm, useWatch, type Control, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { useSession } from "@/app/providers/session-provider";
import {
  findBrandCandidates,
  findMerchantCandidates,
  useReviewCategoryTree,
  type CategoryOption
} from "@/entities/catalog";
import { getStickerArtworkGeometry } from "@/entities/review";
import {
  addDirectPurchaseLink,
  attachReviewMedia,
  attachPurchaseProof,
  createReviewDraft,
  DraftMediaInput,
  DraftDirectPurchaseLink,
  resolveBrandIdentity,
  resolveDirectPurchaseOffer,
  resolveMerchantIdentity,
  resolveReviewProduct,
  requestReviewPublish,
  uploadReviewStickerImage
} from "@/features/review-create";
import { captureActionEventsQuietly } from "@/features/event-capture";
import type {
  BrandIdentityCandidate,
  MerchantIdentityCandidate
} from "@/shared/api/generated/shoply";
import { LinkStickerCanvas, type MediaCanvasTransform } from "@/widgets/link-sticker-canvas";
import { Image as ExpoImage } from "expo-image";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";

type CreateStep = "media" | "details";
type StickerType = DraftDirectPurchaseLink["stickerType"];
type StickerArtworkVariant = Exclude<
  NonNullable<DraftDirectPurchaseLink["visualVariant"]>,
  "pill" | "emoji"
>;

interface PendingStickerLink {
  stickerType: StickerType;
  label: string;
  assetUri?: string;
  assetFileName?: string | null;
  assetMimeType?: string | null;
  widthRatio?: number;
  heightRatio?: number;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
}

interface StickerTrayOption {
  stickerType: StickerType;
  label: string;
  widthRatio: number;
  heightRatio: number;
  assetUri?: string;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
}

interface DraftReviewMedia {
  id: string;
  uri: string;
  mediaType: "image" | "video";
  fileName?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  trimDurationMs?: number | null;
  mutedByDefault: boolean;
  links: DraftDirectPurchaseLink[];
  transform: MediaCanvasTransform;
  source: "camera" | "gallery";
}

interface PublishedReviewContext {
  reviewId: string;
  productName: string;
  purchasePrice: number;
}

interface MeasuredSize {
  width: number;
  height: number;
}

type IdentityKind = "brand" | "merchant";
type SelectedIdentity = { id: string; name: string };
type IdentityCandidate = BrandIdentityCandidate | MerchantIdentityCandidate;

const reviewDisclosureValues = ["none", "affiliate", "paid_sponsorship", "gifted"] as const;
type ReviewDisclosureValue = (typeof reviewDisclosureValues)[number];

const disclosureOptions: Array<{ label: string; value: ReviewDisclosureValue }> = [
  { label: "해당 없음", value: "none" },
  { label: "제휴 링크", value: "affiliate" },
  { label: "협찬/광고", value: "paid_sponsorship" },
  { label: "제공받은 상품", value: "gifted" }
] as const;

const reviewDetailsFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "리뷰 제목은 2자 이상 입력해주세요.")
    .max(160, "리뷰 제목은 160자 이하로 입력해주세요."),
  purchasePrice: z
    .string()
    .trim()
    .min(1, "구매금액을 입력해주세요.")
    .refine((value) => parsePurchasePrice(value) > 0, "구매금액은 0원보다 큰 숫자로 입력해주세요."),
  categoryId: z.string().trim().min(1, "카테고리를 선택해주세요."),
  body: z
    .string()
    .trim()
    .min(10, "사용 경험을 10자 이상 적어주세요.")
    .max(20_000, "상세 내용은 20,000자 이하로 입력해주세요."),
  disclosure: z.enum(reviewDisclosureValues),
  disclosureConfirmed: z.boolean().refine((value) => value, "광고·협찬 여부를 선택해주세요.")
});

type ReviewDetailsFormValues = z.infer<typeof reviewDetailsFormSchema>;
const postPublishProofImageLimit = 5;

type StickerTrayMode = "menu" | "button" | "sticker" | "emoji" | "text";

const buttonStickerPresets = [
  { label: "상품 보기", widthRatio: 0.27, heightRatio: 0.082, visualVariant: "chrome" },
  { label: "구매처", widthRatio: 0.23, heightRatio: 0.078, visualVariant: "arrow" },
  { label: "가격 확인", widthRatio: 0.27, heightRatio: 0.078, visualVariant: "ribbon" },
  { label: "상세 정보", widthRatio: 0.27, heightRatio: 0.078, visualVariant: "badge" },
  { label: "링크 열기", widthRatio: 0.27, heightRatio: 0.078, visualVariant: "pointer" },
  { label: "구매 정보", widthRatio: 0.27, heightRatio: 0.078, visualVariant: "pill" },
  { label: "사용 후기", widthRatio: 0.27, heightRatio: 0.078, visualVariant: "burst" },
  { label: "장바구니", widthRatio: 0.28, heightRatio: 0.078, visualVariant: "cart" }
] as const;

const cutoutStickerPresets = [
  { label: "", widthRatio: 0.16, heightRatio: 0.16, visualVariant: "spark" },
  { label: "PICK", widthRatio: 0.2, heightRatio: 0.074, visualVariant: "arrow" },
  { label: "써봤어요", widthRatio: 0.25, heightRatio: 0.074, visualVariant: "burst" },
  { label: "BAG", widthRatio: 0.18, heightRatio: 0.074, visualVariant: "bag" },
  { label: "반짝", widthRatio: 0.2, heightRatio: 0.074, visualVariant: "chrome" },
  { label: "CART", widthRatio: 0.18, heightRatio: 0.074, visualVariant: "cart" },
  { label: "내 취향", widthRatio: 0.22, heightRatio: 0.074, visualVariant: "badge" },
  { label: "포인트", widthRatio: 0.22, heightRatio: 0.074, visualVariant: "ribbon" },
  { label: "열어보기", widthRatio: 0.24, heightRatio: 0.074, visualVariant: "pointer" }
] as const;

const emojiStickerPresets = [
  "🔥",
  "💖",
  "✨",
  "🛍️",
  "😮",
  "👏",
  "😍",
  "🥹",
  "🤍",
  "💜",
  "💙",
  "💚",
  "💛",
  "🧡",
  "🎀",
  "⭐️",
  "🌟",
  "⚡️",
  "💯",
  "✅",
  "👀",
  "🙌",
  "🫶",
  "🎉"
] as const;
const textStickerPreset = {
  label: "새 텍스트",
  widthRatio: 0.38,
  heightRatio: 0.09
} as const;
const defaultTextStickerColor = "#FFFFFF";
const defaultTextStickerScale = 1;
const defaultTextStickerFontSizePx = 34;
const textStickerColorOptions = [
  "#FFFFFF",
  "#111722",
  "#6266F1",
  "#FF6F4E",
  "#17B879",
  "#FDE047",
  "#F472B6",
  "#38BDF8",
  "#A78BFA",
  "#FB7185",
  "#F8FAFC",
  "#020617"
] as const;
const textStickerFontSizeRange = {
  min: 18,
  max: 72,
  step: 2
} as const;
const defaultMediaTransform: MediaCanvasTransform = {
  scale: 1,
  translateXRatio: 0,
  translateYRatio: 0
};
const captureCanvasSize = {
  width: 360,
  height: 450
} as const;
const captureOutputSize = {
  width: 1080,
  height: 1350
} as const;
const reviewMediaLimit = 5;
const identitySelectionLimit = 5;
const reviewVideoMaxDurationSeconds = 20;
const reviewVideoMaxDurationMs = reviewVideoMaxDurationSeconds * 1000;

const initialLinks: DraftDirectPurchaseLink[] = [];

function parsePurchasePrice(value?: string) {
  return Number((value ?? "").replace(/[^\d]/g, "")) || 0;
}

function normalizeIdentityInput(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueIdentityIds(items: SelectedIdentity[]) {
  const ids = new Set<string>();
  const names = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const normalizedName = normalizeIdentityInput(item.name);
    if (!item.id || ids.has(item.id) || (normalizedName && names.has(normalizedName))) continue;
    ids.add(item.id);
    if (normalizedName) names.add(normalizedName);
    unique.push(item.id);
    if (unique.length >= identitySelectionLimit) break;
  }
  return unique;
}

function identityCandidateEntity(candidate: IdentityCandidate) {
  return (
    (candidate as BrandIdentityCandidate).brand ??
    (candidate as MerchantIdentityCandidate).merchantSite ??
    null
  );
}

function createDraftMedia(input: {
  uri: string;
  mediaType: "image" | "video";
  fileName?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  trimDurationMs?: number | null;
  mutedByDefault?: boolean;
  source: DraftReviewMedia["source"];
}): DraftReviewMedia {
  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    uri: input.uri,
    mediaType: input.mediaType,
    fileName: input.fileName,
    mimeType: input.mimeType,
    durationMs: input.durationMs ?? null,
    trimDurationMs: input.trimDurationMs ?? null,
    mutedByDefault: input.mediaType === "video" ? input.mutedByDefault !== false : true,
    source: input.source,
    links: [],
    transform: { ...defaultMediaTransform }
  };
}

function createDraftMediaFromAsset(
  asset: ImagePicker.ImagePickerAsset,
  source: DraftReviewMedia["source"],
  index: number
) {
  const mediaType = asset.type === "video" ? "video" : "image";
  const durationMs = mediaType === "video" ? (asset.duration ?? null) : null;
  return createDraftMedia({
    uri: asset.uri,
    mediaType,
    fileName: asset.fileName ?? `${source}-${index + 1}.${mediaType === "video" ? "mp4" : "jpg"}`,
    mimeType: asset.mimeType ?? (mediaType === "video" ? "video/mp4" : "image/jpeg"),
    durationMs,
    trimDurationMs: mediaType === "video" ? reviewVideoMaxDurationMs : null,
    source
  });
}

function waitForCaptureLayout() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 140);
  });
}

function isDefaultMediaTransform(transform: MediaCanvasTransform) {
  return (
    Math.abs(transform.scale - 1) < 0.01 &&
    Math.abs(transform.translateXRatio) < 0.002 &&
    Math.abs(transform.translateYRatio) < 0.002
  );
}

function mediaNeedsImageCapture(mediaItem: DraftReviewMedia) {
  return (
    mediaItem.mediaType === "image" &&
    (!isDefaultMediaTransform(mediaItem.transform) || mediaItem.links.some(isDecorativeSticker))
  );
}

function isEmojiSticker(sticker: {
  stickerType: StickerType;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
}) {
  return sticker.visualVariant === "emoji" || Boolean(sticker.emoji);
}

function isDecorativeSticker(sticker: {
  stickerType: StickerType;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
}) {
  return sticker.stickerType === "text" || isEmojiSticker(sticker);
}

function requiresPurchaseUrl(sticker: {
  stickerType: StickerType;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
}) {
  return !isDecorativeSticker(sticker);
}

function isPurchaseLinkSticker(link: DraftDirectPurchaseLink) {
  return stickerHasValidPurchaseUrl(link);
}

function stickerSupportsUrlInput(sticker: {
  stickerType: StickerType;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
}) {
  return requiresPurchaseUrl(sticker) || isDecorativeSticker(sticker);
}

function stickerUrlValue(link: Pick<DraftDirectPurchaseLink, "url">) {
  return link.url.trim();
}

function stickerHasEnteredUrl(link: Pick<DraftDirectPurchaseLink, "url">) {
  return stickerUrlValue(link).length > 0;
}

function stickerHasValidPurchaseUrl(link: Pick<DraftDirectPurchaseLink, "url">) {
  return /^https?:\/\//i.test(stickerUrlValue(link));
}

function stickerNeedsUrlFix(link: DraftDirectPurchaseLink) {
  return requiresPurchaseUrl(link) || stickerHasEnteredUrl(link)
    ? !stickerHasValidPurchaseUrl(link)
    : false;
}

function isTextSticker(link: DraftDirectPurchaseLink) {
  return link.stickerType === "text";
}

function clampTextFontSizePx(value: number) {
  return Math.min(
    textStickerFontSizeRange.max,
    Math.max(textStickerFontSizeRange.min, Math.round(value))
  );
}

function textStickerFontSizePx(sticker: Pick<DraftDirectPurchaseLink, "fontSizePx" | "textScale">) {
  return clampTextFontSizePx(
    sticker.fontSizePx ??
      defaultTextStickerFontSizePx * (sticker.textScale ?? defaultTextStickerScale)
  );
}

function textStickerSizeForLabel(label: string, fontSizePx: number) {
  const width = Math.min(
    captureCanvasSize.width * 0.9,
    Math.max(64, textStickerLabelWidth(label, fontSizePx) + 26)
  );
  const height = Math.max(34, fontSizePx * 1.18 + 10);

  return {
    widthRatio: Number((width / captureCanvasSize.width).toFixed(3)),
    heightRatio: Number((height / captureCanvasSize.height).toFixed(3))
  };
}

function textStickerSizePatch(
  label: string,
  fontSizePx: number,
  current?: Pick<DraftDirectPurchaseLink, "widthRatio" | "heightRatio">
) {
  const next = textStickerSizeForLabel(label, fontSizePx);

  return {
    widthRatio: Math.max(current?.widthRatio ?? 0, next.widthRatio),
    heightRatio: Math.max(current?.heightRatio ?? 0, next.heightRatio)
  };
}

function textStickerLabelWidth(label: string, fontSizePx: number) {
  return Array.from(label.trim() || "Aa").reduce((total, character) => {
    if (character === " ") return total + fontSizePx * 0.36;
    return total + fontSizePx * (character.charCodeAt(0) > 127 ? 0.92 : 0.58);
  }, 0);
}

function flattenCategoryOptions(categories: CategoryOption[]) {
  return categories.flatMap((category) => [category, ...(category.children ?? [])]);
}

function getReviewBodyPlaceholder(category?: CategoryOption | null) {
  const categoryGroup = category?.slug.split("-")[0];

  switch (categoryGroup) {
    case "fashion":
      return "평소 사이즈와 구매 사이즈, 핏·착용감, 소재감과 아쉬운 점을 알려주세요.";
    case "beauty":
      return "피부·헤어 타입과 사용감, 느낀 효과, 자극 여부와 아쉬운 점을 알려주세요.";
    case "life":
      return "사용한 공간과 기간, 크기·내구성·편의성, 아쉬운 점을 알려주세요.";
    case "digital":
      return "사용 환경과 기간, 성능·배터리·호환성, 아쉬운 점을 알려주세요.";
    case "food":
      return "맛과 식감, 양·신선도·조리 편의, 재구매 의사를 알려주세요.";
    case "kids":
      return "아이 연령과 사용 환경, 안전성·편의성·내구성, 아쉬운 점을 알려주세요.";
    case "pet":
      return "반려동물 종류와 나이, 기호성·사용성·안전성, 아쉬운 점을 알려주세요.";
    default:
      return "직접 사용한 기간과 장점, 아쉬운 점을 구체적으로 알려주세요.";
  }
}

function getReviewBodyGuide(category?: CategoryOption | null) {
  const categoryGroup = category?.slug.split("-")[0];

  switch (categoryGroup) {
    case "fashion":
      return [
        "키·몸무게(선택), 평소 사이즈와 구매 사이즈",
        "기장·품·허리 등 실제 핏과 움직일 때 착용감",
        "소재 두께·비침·신축성, 계절감과 아쉬운 점"
      ];
    case "beauty":
      return [
        "피부·두피·모발 타입과 사용 기간",
        "발림성·향·흡수감, 사용 전후 느낀 변화",
        "자극 여부, 잘 맞을 것 같은 대상과 아쉬운 점"
      ];
    case "life":
      return [
        "사용한 공간·환경과 사용 기간",
        "크기·설치·세척·보관 등 실제 편의성",
        "내구성, 만족한 점과 개선됐으면 하는 점"
      ];
    case "digital":
      return [
        "사용 기기·환경과 사용 기간",
        "속도·화질·음질·배터리·호환성",
        "발열·휴대성, 만족한 점과 아쉬운 점"
      ];
    case "food":
      return [
        "맛·향·식감과 1회 섭취량",
        "신선도·포장·보관 또는 조리 편의",
        "가격 대비 만족도와 재구매 의사"
      ];
    case "kids":
      return [
        "아이 연령대와 사용 기간·환경",
        "사이즈·조작·세척 등 보호자 편의",
        "안전성·내구성, 아이 반응과 아쉬운 점"
      ];
    case "pet":
      return [
        "반려동물 종류·나이·체형",
        "기호성·적응 과정과 실제 사용 환경",
        "안전성·관리 편의, 아쉬운 점과 재구매 의사"
      ];
    default:
      return [
        "얼마나, 어떤 환경에서 사용했는지",
        "가장 만족한 점과 실제로 불편했던 점",
        "어떤 사람에게 추천하는지와 재구매 의사"
      ];
  }
}

function getReviewBodyKeywords(category?: CategoryOption | null) {
  const categoryGroup = category?.slug.split("-")[0];

  switch (categoryGroup) {
    case "fashion":
      return ["사이즈", "핏·착용감", "소재", "아쉬운 점"];
    case "beauty":
      return ["피부·헤어 타입", "사용감", "변화", "자극 여부"];
    case "life":
      return ["사용 환경", "편의성", "내구성", "아쉬운 점"];
    case "digital":
      return ["사용 환경", "성능", "배터리", "호환성"];
    case "food":
      return ["맛·식감", "양", "신선도", "재구매 의사"];
    case "kids":
      return ["아이 연령", "사용 환경", "안전성", "내구성"];
    case "pet":
      return ["반려동물 정보", "기호성", "안전성", "재구매 의사"];
    default:
      return ["사용 기간", "사용 환경", "장점", "아쉬운 점"];
  }
}

function getReviewBodyExample(category?: CategoryOption | null) {
  const categoryGroup = category?.slug.split("-")[0];

  switch (categoryGroup) {
    case "fashion":
      return "키 160cm, 몸무게 50kg대이고 평소 55 사이즈를 입어요. M을 구매했는데 허리는 편하게 맞고 기장은 발목까지 와서 운동화와 잘 어울렸어요. 소재가 가볍고 신축성이 좋아 오래 걸어도 편했지만, 밝은 색은 비침이 조금 있어요.";
    case "beauty":
      return "건성 피부에 3주 동안 저녁마다 사용했어요. 발림성이 가볍고 흡수가 빨라 끈적임이 적었고, 다음 날 당김도 덜했어요. 향은 은은했지만 민감한 날에는 볼 주변이 조금 따끔했어요.";
    case "life":
      return "작은 주방에서 한 달 정도 매일 사용했어요. 설치가 간단하고 세척할 부품이 적어 관리하기 편했어요. 크기 대비 수납력도 만족스럽지만, 무거운 물건을 넣으면 서랍이 조금 뻑뻑해요.";
    case "digital":
      return "출퇴근과 카페 작업에 한 달 동안 사용했어요. 연결이 빠르고 배터리는 제 사용 기준 이틀 정도 갔어요. 휴대성과 음질은 만족스럽지만, 장시간 착용하면 귀가 조금 답답했어요.";
    case "food":
      return "배송받은 날 바로 먹어봤어요. 단맛이 과하지 않고 식감이 촉촉했으며 포장도 깔끔했어요. 한 팩 양은 간식으로 적당하지만 가격은 조금 높은 편이라 할인할 때 재구매하려고 해요.";
    case "kids":
      return "두 돌 아이가 2주 동안 집에서 사용했어요. 모서리가 둥글고 조작이 단순해 아이가 금방 익숙해졌어요. 세척도 편했지만 부피가 커서 보관 공간은 미리 확인하는 게 좋아요.";
    case "pet":
      return "세 살 소형견에게 2주 동안 급여했어요. 처음부터 거부감 없이 잘 먹었고 소분 포장이라 보관하기 편했어요. 다만 알갱이가 조금 커서 작은 아이에게는 잘라 주는 게 좋을 것 같아요.";
    default:
      return "한 달 동안 출퇴근할 때 거의 매일 사용했어요. 사용법이 간단하고 기대했던 기능은 충분히 만족스러웠어요. 다만 오래 사용하면 조금 무겁게 느껴졌고, 이 점을 제외하면 비슷한 용도로 찾는 분께 추천하고 싶어요.";
  }
}

export function ReviewEditor() {
  const theme = useShoplyTheme();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const cameraRef = useRef<CameraView>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const transformCaptureRef = useRef<View>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const categoryQuery = useReviewCategoryTree();
  const categoryOptions = categoryQuery.data ?? [];
  const flatCategoryOptions = useMemo(
    () => flattenCategoryOptions(categoryOptions),
    [categoryOptions]
  );
  const [step, setStep] = useState<CreateStep>("media");
  const [mediaItems, setMediaItems] = useState<DraftReviewMedia[]>([]);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [cameraCaptureMode, setCameraCaptureMode] = useState<"picture" | "video">("picture");
  const [transformCaptureMedia, setTransformCaptureMedia] = useState<DraftReviewMedia | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(
    Platform.OS === "web" ? null : true
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPermissionPrompted, setCameraPermissionPrompted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid }
  } = useForm<ReviewDetailsFormValues>({
    resolver: zodResolver(reviewDetailsFormSchema),
    defaultValues: {
      title: "",
      purchasePrice: "",
      categoryId: "",
      body: "",
      disclosure: "none",
      disclosureConfirmed: false
    },
    mode: "onChange",
    reValidateMode: "onChange"
  });
  const categoryId = watch("categoryId") || null;
  const disclosure = watch("disclosure");
  const [selectedBrands, setSelectedBrands] = useState<SelectedIdentity[]>([]);
  const [selectedMerchantSites, setSelectedMerchantSites] = useState<SelectedIdentity[]>([]);
  const [publishedReview, setPublishedReview] = useState<PublishedReviewContext | null>(null);
  const [submittingPurchaseProof, setSubmittingPurchaseProof] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(initialLinks[0]?.id ?? null);
  const [stickerTrayMode, setStickerTrayMode] = useState<StickerTrayMode | null>(null);
  const [pendingSticker, setPendingSticker] = useState<PendingStickerLink | null>(null);
  const [pendingLabel, setPendingLabel] = useState("");
  const [pendingUrl, setPendingUrl] = useState("");
  const [pendingTextColor, setPendingTextColor] = useState(defaultTextStickerColor);
  const [pendingTextFontSizePx, setPendingTextFontSizePx] = useState(defaultTextStickerFontSizePx);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingUrl, setEditingUrl] = useState("");
  const [editingTextColor, setEditingTextColor] = useState(defaultTextStickerColor);
  const [editingTextFontSizePx, setEditingTextFontSizePx] = useState(defaultTextStickerFontSizePx);
  const [submitting, setSubmitting] = useState(false);
  const selectedMedia = activeMediaId ? mediaItems.find((item) => item.id === activeMediaId) : null;
  const activeMedia = cameraMode ? null : (selectedMedia ?? mediaItems[0] ?? null);
  const activeLinks = activeMedia?.links ?? [];
  const allLinks = mediaItems.flatMap((item) => item.links);
  const selectedLink = selectedLinkId
    ? (activeLinks.find((link) => link.id === selectedLinkId) ?? null)
    : null;
  const editingLink = allLinks.find((link) => link.id === editingLinkId) ?? null;
  const selectedCategory = useMemo(
    () => flatCategoryOptions.find((item) => item.id === categoryId) ?? null,
    [categoryId, flatCategoryOptions]
  );
  const purchaseLinks = allLinks.filter(isPurchaseLinkSticker);
  const invalidStickerLinks = allLinks.filter(stickerNeedsUrlFix);
  const stickerLinksReady = invalidStickerLinks.length === 0;
  const canSubmitDetails = isValid && stickerLinksReady && !submitting;
  const sheetSticker = pendingSticker ?? editingLink;
  const sheetRequiresUrl = sheetSticker ? requiresPurchaseUrl(sheetSticker) : false;
  const sheetShowsUrlField = sheetSticker ? stickerSupportsUrlInput(sheetSticker) : false;
  const sheetIsText = sheetSticker?.stickerType === "text";
  const sheetIsEmoji = sheetSticker ? isEmojiSticker(sheetSticker) : false;
  const sheetIsUploadedImage = sheetSticker?.stickerType === "uploaded_image";

  const addSelectedIdentity = (kind: IdentityKind, identity: SelectedIdentity) => {
    const setter = kind === "brand" ? setSelectedBrands : setSelectedMerchantSites;
    setter((current) =>
      current.some(
        (item) =>
          item.id === identity.id ||
          normalizeIdentityInput(item.name) === normalizeIdentityInput(identity.name)
      )
        ? current
        : [...current, identity].slice(0, identitySelectionLimit)
    );
  };

  const removeSelectedIdentity = (kind: IdentityKind, id: string) => {
    const setter = kind === "brand" ? setSelectedBrands : setSelectedMerchantSites;
    setter((current) => current.filter((item) => item.id !== id));
  };

  const addDirectIdentity = async (kind: IdentityKind, rawName: string) => {
    const inputName = rawName.trim();
    if (!inputName) return;
    const selected = kind === "brand" ? selectedBrands : selectedMerchantSites;
    if (
      selected.some(
        (item) => normalizeIdentityInput(item.name) === normalizeIdentityInput(inputName)
      )
    ) {
      return;
    }
    if (selected.length >= identitySelectionLimit) {
      Alert.alert(
        `${kind === "brand" ? "브랜드" : "구매처"}는 최대 5개`,
        `등록한 항목을 하나 삭제한 뒤 추가해주세요.`
      );
      return;
    }
    try {
      const entity =
        kind === "brand"
          ? await resolveBrandIdentity(inputName, true)
          : await resolveMerchantIdentity({ name: inputName, createNew: true });
      addSelectedIdentity(kind, { id: entity.id, name: entity.name });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        `${kind === "brand" ? "브랜드" : "구매처"} 등록 실패`,
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    }
  };

  const selectIdentitySuggestion = (kind: IdentityKind, identity: SelectedIdentity) => {
    addSelectedIdentity(kind, identity);
    void Haptics.selectionAsync();
  };

  const syncMerchantFromLink = (linkId: string, url: string) => {
    if (!url) return;
    void resolveMerchantIdentity({ url })
      .then((merchant) => {
        addSelectedIdentity("merchant", { id: merchant.id, name: merchant.name });
        setMediaItems((items) =>
          items.map((item) => ({
            ...item,
            links: item.links.map((link) =>
              link.id === linkId
                ? {
                    ...link,
                    merchantSiteId: merchant.id,
                    merchantName: merchant.name
                  }
                : link
            )
          }))
        );
      })
      .catch(() => {
        // A link remains usable even when optional merchant enrichment is unavailable.
      });
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      setCameraAvailable(true);
      return;
    }

    let mounted = true;
    void CameraView.isAvailableAsync()
      .then((available) => {
        if (mounted) setCameraAvailable(available);
      })
      .catch(() => {
        if (mounted) setCameraAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!cameraPermission?.granted) {
      setCameraReady(false);
    }
  }, [cameraPermission?.granted]);

  useEffect(() => {
    setCameraReady(false);
  }, [cameraCaptureMode]);

  useEffect(() => {
    if (!activeMediaId && mediaItems[0]) {
      setActiveMediaId(mediaItems[0].id);
    }
  }, [activeMediaId, mediaItems]);

  useEffect(() => {
    if (step !== "media" || mediaItems.length || cameraPermissionPrompted) return;

    setCameraPermissionPrompted(true);
    void requestCameraPermission();
  }, [cameraPermissionPrompted, mediaItems.length, requestCameraPermission, step]);

  const pickMedia = async () => {
    const availableSlots = Math.max(0, reviewMediaLimit - mediaItems.length);
    if (!availableSlots) {
      Alert.alert("미디어는 최대 5개", "등록할 미디어를 하나 삭제한 뒤 추가해주세요.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "미디어 접근 권한 필요",
        "리뷰 사진이나 영상을 선택하려면 갤러리 접근 권한이 필요합니다."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.86,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: availableSlots,
      videoMaxDuration: reviewVideoMaxDurationSeconds
    });

    if (!result.canceled) {
      const nextItems = result.assets
        .slice(0, availableSlots)
        .map((asset, index) => createDraftMediaFromAsset(asset, "gallery", index));
      setMediaItems((items) => {
        const availableSlots = Math.max(0, reviewMediaLimit - items.length);
        return [...items, ...nextItems.slice(0, availableSlots)];
      });
      if (nextItems[0]) {
        setActiveMediaId(nextItems[0].id);
        setCameraMode(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  const openPublishedReview = (reviewId: string) => {
    setPublishedReview(null);
    router.push({
      pathname: "/review/[reviewId]",
      params: { reviewId }
    });
  };

  const submitPurchaseProofAfterPublish = async () => {
    if (!publishedReview || submittingPurchaseProof) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "사진 접근 권한 필요",
        "구매내역이나 영수증 사진을 첨부하려면 갤러리 접근 권한이 필요합니다."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.88,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: postPublishProofImageLimit
    });

    if (result.canceled) return;
    const assets = result.assets
      .slice(0, postPublishProofImageLimit)
      .filter((asset) => Boolean(asset.uri));
    if (!assets.length) return;

    setSubmittingPurchaseProof(true);
    try {
      await Promise.all(
        assets.map((asset) =>
          attachPurchaseProof(publishedReview.reviewId, {
            uri: asset.uri,
            fileName: asset.fileName ?? "purchase-receipt.jpg",
            mimeType: asset.mimeType ?? "image/jpeg",
            proofType: "receipt",
            productName: publishedReview.productName,
            purchaseAmount: publishedReview.purchasePrice,
            currency: "KRW"
          })
        )
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("구매인증 접수", "증빙을 확인한 뒤 리뷰에 구매인증을 표시해요.");
      openPublishedReview(publishedReview.reviewId);
    } catch (error) {
      Alert.alert(
        "구매인증 접수 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmittingPurchaseProof(false);
    }
  };

  const capturePhoto = useCallback(async () => {
    if (mediaItems.length >= reviewMediaLimit) {
      Alert.alert("미디어는 최대 5개", "등록할 미디어를 하나 삭제한 뒤 추가해주세요.");
      return;
    }

    if (!cameraAvailable) {
      Alert.alert("사진이나 영상을 선택해주세요", undefined, [
        { text: "취소", style: "cancel" },
        { text: "갤러리", onPress: () => void pickMedia() }
      ]);
      return;
    }

    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        Alert.alert("사진이나 영상을 선택해주세요", undefined, [
          { text: "취소", style: "cancel" },
          { text: "갤러리", onPress: () => void pickMedia() }
        ]);
        return;
      }
    }

    if (!cameraRef.current || !cameraReady || capturing) return;

    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false
      });
      const next = createDraftMedia({
        uri: photo.uri,
        mediaType: "image",
        fileName: "review-camera.jpg",
        mimeType: "image/jpeg",
        source: "camera"
      });
      setMediaItems((items) => [...items, next].slice(0, reviewMediaLimit));
      setActiveMediaId(next.id);
      setCameraMode(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("촬영 실패", "사진을 찍지 못했어요. 다시 시도하거나 갤러리에서 선택해주세요.");
    } finally {
      setCapturing(false);
    }
  }, [
    cameraAvailable,
    cameraPermission?.granted,
    cameraReady,
    capturing,
    mediaItems.length,
    pickMedia,
    requestCameraPermission
  ]);

  const captureVideo = useCallback(async () => {
    if (recordingVideo) {
      cameraRef.current?.stopRecording();
      return;
    }

    if (mediaItems.length >= reviewMediaLimit) {
      Alert.alert("미디어는 최대 5개", "등록할 미디어를 하나 삭제한 뒤 추가해주세요.");
      return;
    }

    if (!cameraAvailable) {
      Alert.alert("사진이나 영상을 선택해주세요", undefined, [
        { text: "취소", style: "cancel" },
        { text: "갤러리", onPress: () => void pickMedia() }
      ]);
      return;
    }

    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        Alert.alert("사진이나 영상을 선택해주세요", undefined, [
          { text: "취소", style: "cancel" },
          { text: "갤러리", onPress: () => void pickMedia() }
        ]);
        return;
      }
    }

    if (!microphonePermission?.granted) {
      const nextPermission = await requestMicrophonePermission();
      if (!nextPermission.granted) {
        Alert.alert("마이크 권한 필요", "영상 리뷰를 촬영하려면 마이크 접근 권한이 필요합니다.");
        return;
      }
    }

    if (!cameraRef.current || !cameraReady || capturing) return;

    setRecordingVideo(true);
    recordingStartedAtRef.current = Date.now();
    try {
      const recorded = await cameraRef.current.recordAsync({
        maxDuration: reviewVideoMaxDurationSeconds
      });
      if (!recorded?.uri) return;

      const elapsedMs = recordingStartedAtRef.current
        ? Date.now() - recordingStartedAtRef.current
        : reviewVideoMaxDurationMs;
      const durationMs = Math.min(reviewVideoMaxDurationMs, Math.max(0, elapsedMs));
      const next = createDraftMedia({
        uri: recorded.uri,
        mediaType: "video",
        fileName: "review-camera.mp4",
        mimeType: "video/mp4",
        durationMs: durationMs > 0 ? durationMs : null,
        trimDurationMs: reviewVideoMaxDurationMs,
        source: "camera"
      });
      setMediaItems((items) => [...items, next].slice(0, reviewMediaLimit));
      setActiveMediaId(next.id);
      setCameraMode(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(
        "촬영 실패",
        "영상을 촬영하지 못했어요. 다시 시도하거나 갤러리에서 선택해주세요."
      );
    } finally {
      recordingStartedAtRef.current = null;
      setRecordingVideo(false);
    }
  }, [
    cameraAvailable,
    cameraPermission?.granted,
    cameraReady,
    capturing,
    mediaItems.length,
    microphonePermission?.granted,
    pickMedia,
    recordingVideo,
    requestCameraPermission,
    requestMicrophonePermission
  ]);

  const updateActiveLinks = (
    updater: (links: DraftDirectPurchaseLink[]) => DraftDirectPurchaseLink[]
  ) => {
    if (!activeMedia) return;
    setMediaItems((items) =>
      items.map((item) =>
        item.id === activeMedia.id ? { ...item, links: updater(item.links) } : item
      )
    );
  };

  const toggleActiveVideoMuted = useCallback(() => {
    if (!activeMedia || activeMedia.mediaType !== "video") return;
    setMediaItems((items) =>
      items.map((item) =>
        item.id === activeMedia.id ? { ...item, mutedByDefault: !item.mutedByDefault } : item
      )
    );
    void Haptics.selectionAsync();
  }, [activeMedia]);

  const updateActiveMediaTransform = (transform: MediaCanvasTransform) => {
    if (!activeMedia) return;
    setMediaItems((items) =>
      items.map((item) => (item.id === activeMedia.id ? { ...item, transform } : item))
    );
  };

  const selectActiveMedia = (id: string | null) => {
    setActiveMediaId(id);
    setCameraMode(id === null);
  };

  const updateLink = (id: string, patch: Partial<DraftDirectPurchaseLink>) => {
    updateActiveLinks((links) =>
      links.map((link) => (link.id === id ? { ...link, ...patch } : link))
    );
  };

  const canAddLink = () => {
    if (!activeMedia) {
      Alert.alert("미디어가 필요해요", "촬영하거나 갤러리에서 사진/영상을 먼저 선택해주세요.");
      return false;
    }
    if (activeLinks.length >= 5) {
      Alert.alert(
        "스티커는 최대 5개",
        "미디어 1개당 링크와 스티커를 합쳐 최대 5개까지 배치할 수 있어요."
      );
      return false;
    }

    return true;
  };

  const buildDirectLink = (patch?: Partial<DraftDirectPurchaseLink>): DraftDirectPurchaseLink => {
    const nextIndex = activeLinks.length + 1;
    const stickerType = patch?.stickerType ?? "button";

    return {
      id: `direct-link-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label:
        patch?.label ??
        (stickerType === "asset_cutout"
          ? "추천"
          : stickerType === "text"
            ? "텍스트"
            : stickerType === "hotspot_dot"
              ? `${nextIndex}`
              : "상품 보기"),
      url: patch?.url ?? "",
      stickerType,
      xRatio: 0.5,
      yRatio: 0.5,
      widthRatio:
        stickerType === "hotspot_dot"
          ? 0.1
          : stickerType === "text"
            ? 0.22
            : stickerType === "uploaded_image"
              ? 0.2
              : stickerType === "asset_cutout"
                ? 0.2
                : 0.16,
      heightRatio:
        stickerType === "hotspot_dot"
          ? 0.074
          : stickerType === "text"
            ? 0.062
            : stickerType === "uploaded_image"
              ? 0.1
              : stickerType === "asset_cutout"
                ? 0.074
                : 0.056,
      textColor: stickerType === "text" ? defaultTextStickerColor : undefined,
      fontSizePx: stickerType === "text" ? defaultTextStickerFontSizePx : undefined,
      ...patch
    };
  };

  const openStickerLinkSheet = (sticker: PendingStickerLink) => {
    if (!canAddLink()) return;

    if (requiresPurchaseUrl(sticker)) {
      setPendingSticker(sticker);
      setPendingLabel(sticker.label);
      setPendingUrl("");
      setPendingTextColor(defaultTextStickerColor);
      setPendingTextFontSizePx(defaultTextStickerFontSizePx);
      setStickerTrayMode(null);
      return;
    }

    if (activeMedia?.mediaType !== "image") {
      Alert.alert(
        "사진에서만 사용할 수 있어요",
        "스티커와 텍스트는 사진에 적용해 등록합니다. 영상에는 버튼만 배치할 수 있어요."
      );
      return;
    }

    if (stickerSupportsUrlInput(sticker)) {
      setPendingSticker(sticker);
      setPendingLabel(sticker.label);
      setPendingUrl("");
      setPendingTextColor(defaultTextStickerColor);
      setPendingTextFontSizePx(defaultTextStickerFontSizePx);
      setStickerTrayMode(null);
      return;
    }

    if (sticker.stickerType === "uploaded_image" && !sticker.assetUri) {
      Alert.alert("스티커를 다시 선택해주세요", "선택한 이미지 정보를 읽지 못했어요.");
      return;
    }

    const next = buildDirectLink({
      stickerType: sticker.stickerType,
      label: sticker.label,
      url: "",
      assetUri: sticker.assetUri,
      assetFileName: sticker.assetFileName,
      assetMimeType: sticker.assetMimeType,
      widthRatio: sticker.widthRatio,
      heightRatio: sticker.heightRatio,
      visualVariant: sticker.visualVariant,
      emoji: sticker.emoji
    });
    updateActiveLinks((links) => [...links, next]);
    setSelectedLinkId(next.id);
    setStickerTrayMode(null);
    void Haptics.selectionAsync();
  };

  const pickStickerImage = async () => {
    if (!canAddLink()) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("사진 접근 권한 필요", "사진 스티커를 추가하려면 갤러리 접근 권한이 필요합니다.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: false
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.uri) return;

    openStickerLinkSheet({
      stickerType: "uploaded_image",
      label: "",
      assetUri: asset.uri,
      assetFileName: asset.fileName,
      assetMimeType: asset.mimeType,
      widthRatio: 0.24,
      heightRatio: 0.16
    });
  };

  const returnToCamera = () => {
    setCameraMode(true);
    setSelectedLinkId(null);
    setStickerTrayMode(null);
    setCameraReady(false);
  };

  const removeMedia = (mediaId: string) => {
    setMediaItems((items) => {
      const nextItems = items.filter((item) => item.id !== mediaId);
      if (activeMediaId === mediaId) {
        setActiveMediaId(nextItems[0]?.id ?? null);
      }
      return nextItems;
    });
    setSelectedLinkId(null);
    setStickerTrayMode(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCameraReady = useCallback(() => {
    setCameraAvailable(true);
    setCameraReady(true);
  }, []);

  const handleCameraMountError = useCallback(() => {
    setCameraAvailable(false);
    setCameraReady(false);
  }, []);

  const closeStickerLinkSheet = () => {
    setPendingSticker(null);
    setPendingLabel("");
    setPendingUrl("");
    setPendingTextColor(defaultTextStickerColor);
    setPendingTextFontSizePx(defaultTextStickerFontSizePx);
  };

  const openEditLinkSheet = (link: DraftDirectPurchaseLink) => {
    setEditingLinkId(link.id);
    setEditingLabel(link.label);
    setEditingUrl(link.url);
    setEditingTextColor(link.textColor ?? defaultTextStickerColor);
    setEditingTextFontSizePx(textStickerFontSizePx(link));
  };

  const closeEditLinkSheet = () => {
    setEditingLinkId(null);
    setEditingLabel("");
    setEditingUrl("");
    setEditingTextColor(defaultTextStickerColor);
    setEditingTextFontSizePx(defaultTextStickerFontSizePx);
  };

  const closeLinkSheet = () => {
    closeStickerLinkSheet();
    closeEditLinkSheet();
  };

  const confirmPendingSticker = () => {
    if (!pendingSticker) return;

    const normalizedUrl = pendingUrl.trim();
    const isText = pendingSticker.stickerType === "text";
    const requiresUrl = requiresPurchaseUrl(pendingSticker);
    const hasEnteredUrl = normalizedUrl.length > 0;
    if ((requiresUrl || hasEnteredUrl) && !/^https?:\/\//i.test(normalizedUrl)) {
      Alert.alert("URL을 확인해주세요", "http 또는 https로 시작하는 상품 URL을 입력해주세요.");
      return;
    }
    if (isText && pendingLabel.trim().length < 1) {
      Alert.alert("텍스트를 입력해주세요", "사진 위에 올릴 텍스트를 입력해주세요.");
      return;
    }

    const nextLabel = pendingLabel.trim() || pendingSticker.label;
    const next = buildDirectLink({
      stickerType: pendingSticker.stickerType,
      label: nextLabel,
      url: requiresUrl || hasEnteredUrl ? normalizedUrl : "",
      assetUri: pendingSticker.assetUri,
      assetFileName: pendingSticker.assetFileName,
      assetMimeType: pendingSticker.assetMimeType,
      widthRatio: pendingSticker.widthRatio,
      heightRatio: pendingSticker.heightRatio,
      visualVariant: pendingSticker.visualVariant,
      emoji: pendingSticker.emoji,
      textColor: isText ? pendingTextColor : undefined,
      fontSizePx: isText ? pendingTextFontSizePx : undefined,
      ...(isText ? textStickerSizePatch(nextLabel, pendingTextFontSizePx) : {})
    });
    updateActiveLinks((links) => [...links, next]);
    setSelectedLinkId(next.id);
    if (normalizedUrl) syncMerchantFromLink(next.id, normalizedUrl);
    closeStickerLinkSheet();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const confirmEditingLink = () => {
    if (!editingLinkId) return;
    if (!editingLink) {
      closeEditLinkSheet();
      return;
    }

    const normalizedUrl = editingUrl.trim();
    const requiresUrl = requiresPurchaseUrl(editingLink);
    const hasEnteredUrl = normalizedUrl.length > 0;
    if ((requiresUrl || hasEnteredUrl) && !/^https?:\/\//i.test(normalizedUrl)) {
      Alert.alert("URL을 확인해주세요", "http 또는 https로 시작하는 상품 URL을 입력해주세요.");
      return;
    }

    if (!requiresUrl) {
      const nextLabel = editingLabel.trim() || editingLink.label;
      updateLink(editingLinkId, {
        label: nextLabel,
        url: hasEnteredUrl ? normalizedUrl : "",
        textColor: isTextSticker(editingLink) ? editingTextColor : editingLink.textColor,
        fontSizePx: isTextSticker(editingLink) ? editingTextFontSizePx : editingLink.fontSizePx,
        ...(isTextSticker(editingLink)
          ? textStickerSizePatch(nextLabel, editingTextFontSizePx, editingLink)
          : {})
      });
      if (normalizedUrl) syncMerchantFromLink(editingLinkId, normalizedUrl);
      closeEditLinkSheet();
      void Haptics.selectionAsync();
      return;
    }

    updateLink(editingLinkId, {
      label: editingLabel.trim() || "버튼",
      url: normalizedUrl
    });
    syncMerchantFromLink(editingLinkId, normalizedUrl);
    closeEditLinkSheet();
    void Haptics.selectionAsync();
  };

  const exitReviewCreate = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/home");
  }, []);

  const handleBackPress = useCallback(() => {
    if (pendingSticker || editingLinkId) {
      setPendingSticker(null);
      setPendingLabel("");
      setPendingUrl("");
      setPendingTextColor(defaultTextStickerColor);
      setPendingTextFontSizePx(defaultTextStickerFontSizePx);
      setEditingLinkId(null);
      setEditingLabel("");
      setEditingUrl("");
      setEditingTextColor(defaultTextStickerColor);
      setEditingTextFontSizePx(defaultTextStickerFontSizePx);
      return true;
    }
    if (stickerTrayMode) {
      setStickerTrayMode(null);
      return true;
    }
    if (selectedLinkId) {
      setSelectedLinkId(null);
      return true;
    }
    if (step === "details") {
      setStep("media");
      void Haptics.selectionAsync();
      return true;
    }
    if (activeMedia) {
      setCameraMode(true);
      setSelectedLinkId(null);
      setStickerTrayMode(null);
      setCameraReady(false);
      void Haptics.selectionAsync();
      return true;
    }

    exitReviewCreate();
    return true;
  }, [
    activeMedia,
    editingLinkId,
    exitReviewCreate,
    pendingSticker,
    selectedLinkId,
    stickerTrayMode,
    step
  ]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
      return () => subscription.remove();
    }, [handleBackPress])
  );

  const prepareMediaForUpload = async (
    mediaItem: DraftReviewMedia,
    index: number
  ): Promise<DraftMediaInput> => {
    if (!mediaNeedsImageCapture(mediaItem)) {
      return {
        uri: mediaItem.uri,
        mediaType: mediaItem.mediaType,
        fileName: mediaItem.fileName,
        mimeType: mediaItem.mimeType,
        durationMs: mediaItem.durationMs,
        trimDurationMs: mediaItem.trimDurationMs,
        mutedByDefault: mediaItem.mutedByDefault,
        sortOrder: index
      };
    }

    try {
      setTransformCaptureMedia(mediaItem);
      await waitForCaptureLayout();

      if (!transformCaptureRef.current) {
        throw new Error("편집한 이미지를 업로드용으로 준비하지 못했어요.");
      }

      const uri = await captureRef(transformCaptureRef.current, {
        format: "jpg",
        quality: 0.92,
        result: "tmpfile",
        width: captureOutputSize.width,
        height: captureOutputSize.height
      });

      return {
        uri,
        mediaType: "image",
        fileName: `shoply-edited-${index + 1}.jpg`,
        mimeType: "image/jpeg",
        sortOrder: index
      };
    } finally {
      setTransformCaptureMedia(null);
    }
  };

  const removeSelectedLink = () => {
    if (!selectedLinkId) return;
    const nextLinks = activeLinks.filter((link) => link.id !== selectedLinkId);
    updateActiveLinks(() => nextLinks);
    setSelectedLinkId(nextLinks[0]?.id ?? null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goDetails = () => {
    if (!mediaItems.length) {
      Alert.alert("미디어가 필요해요", "리뷰 사진이나 영상을 먼저 선택해주세요.");
      return;
    }
    if (invalidStickerLinks.length > 0) {
      Alert.alert("스티커 링크 확인 필요", "상품 스티커 URL은 http 또는 https로 시작해야 해요.");
      return;
    }
    setStep("details");
    void Haptics.selectionAsync();
  };

  const publishReview = async (values: ReviewDetailsFormValues) => {
    if (!user) {
      Alert.alert(
        "로그인이 필요해요",
        "로그인 화면에서 카카오 또는 구글 로그인 후 등록할 수 있어요.",
        [
          { text: "취소", style: "cancel" },
          { text: "로그인", onPress: () => router.push("/login") }
        ]
      );
      return;
    }
    if (!mediaItems.length) {
      setStep("media");
      Alert.alert("미디어가 필요해요", "리뷰 사진이나 영상을 하나 이상 선택해주세요.");
      return;
    }
    if (!selectedCategory) {
      Alert.alert("카테고리 선택 필요", "카테고리를 선택해야 게시 요청까지 진행할 수 있어요.");
      return;
    }
    if (invalidStickerLinks.length > 0) {
      Alert.alert("스티커 URL 확인 필요", "URL을 입력한 스티커는 http 또는 https로 시작해야 해요.");
      return;
    }
    const normalizedTitle = values.title.trim();
    const normalizedBody = values.body?.trim() ?? "";
    const normalizedPrice = parsePurchasePrice(values.purchasePrice);

    setSubmitting(true);
    try {
      const resolvedLinkMerchants = await Promise.all(
        purchaseLinks.map(async (link) => {
          if (link.merchantSiteId && link.merchantName) {
            return { id: link.merchantSiteId, name: link.merchantName };
          }
          const merchant = await resolveMerchantIdentity({ url: link.url });
          return { id: merchant.id, name: merchant.name };
        })
      );
      const brandIds = uniqueIdentityIds(selectedBrands);
      const merchantSiteIds = uniqueIdentityIds([
        ...selectedMerchantSites,
        ...resolvedLinkMerchants
      ]);
      const productIdentityName =
        purchaseLinks[0]?.label?.trim() ||
        [selectedBrands[0]?.name, selectedCategory.name].filter(Boolean).join(" ");
      const product = purchaseLinks.length
        ? await resolveReviewProduct({
            productName: productIdentityName,
            brandId: selectedBrands[0]?.id,
            brandName: selectedBrands[0]?.name,
            categoryId: selectedCategory.id
          })
        : null;
      const draft = await createReviewDraft({
        productId: product?.id,
        brandId: brandIds[0] ?? product?.brand?.id,
        brandIds,
        merchantSiteIds,
        categoryId: selectedCategory.id,
        title: normalizedTitle,
        body: normalizedBody,
        purchasePrice: normalizedPrice || undefined,
        disclosureState: values.disclosure
      });
      const preparedMedia: Array<{ mediaItem: DraftReviewMedia; uploadMedia: DraftMediaInput }> =
        [];
      for (const [index, mediaItem] of mediaItems.entries()) {
        preparedMedia.push({
          mediaItem,
          uploadMedia: await prepareMediaForUpload(mediaItem, index)
        });
      }

      const attachedMedia = await Promise.all(
        preparedMedia.map(async ({ mediaItem, uploadMedia }) => ({
          mediaItem,
          media: await attachReviewMedia(draft.id, uploadMedia)
        }))
      );

      const linkTasks: Array<Promise<void>> = [];
      linkTasks.push(
        ...attachedMedia.flatMap(({ mediaItem, media }) =>
          mediaItem.links.filter(isPurchaseLinkSticker).map(async (link) => {
            const linkMerchant =
              resolvedLinkMerchants[purchaseLinks.findIndex((item) => item.id === link.id)];
            const linkWithMerchant = linkMerchant
              ? {
                  ...link,
                  merchantSiteId: linkMerchant.id,
                  merchantName: linkMerchant.name
                }
              : link;
            const assetUrl =
              linkWithMerchant.stickerType === "uploaded_image" && linkWithMerchant.assetUri
                ? await uploadReviewStickerImage({
                    uri: linkWithMerchant.assetUri,
                    fileName: linkWithMerchant.assetFileName,
                    mimeType: linkWithMerchant.assetMimeType
                  })
                : linkWithMerchant.assetUrl;
            const enrichedLink = { ...linkWithMerchant, assetUrl };
            const resolved = await resolveDirectPurchaseOffer({
              productId: product!.id,
              productName: productIdentityName,
              link: enrichedLink,
              price: normalizedPrice || undefined
            });
            await addDirectPurchaseLink(draft.id, enrichedLink, {
              productId: product!.id,
              productOfferId: resolved.offer.id,
              commerceDestinationId: resolved.destination.id,
              mediaId: media.id
            });
          })
        )
      );
      await Promise.all(linkTasks);

      const published = await requestReviewPublish(draft.id);
      captureActionEventsQuietly([
        {
          eventType: "review_submission_accepted",
          targetType: "review",
          targetId: published.id ?? draft.id,
          reviewId: published.id ?? draft.id,
          sourceSurface: "review_create"
        }
      ]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPublishedReview({
        reviewId: published.id ?? draft.id,
        productName: normalizedTitle,
        purchasePrice: normalizedPrice
      });
    } catch (error) {
      captureActionEventsQuietly([
        {
          eventType: "review_publish_failed",
          targetType: "review",
          sourceSurface: "review_create",
          payload: { stage: "submission" }
        }
      ]);
      Alert.alert(
        "게시 요청 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "media") {
    return (
      <>
        <NativeStatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={[styles.mediaEditorScreen, { backgroundColor: "#050507" }]}>
          <HiddenMediaCaptureCanvases
            transformCaptureRef={transformCaptureRef}
            transformCaptureMedia={transformCaptureMedia}
          />
          <MediaEditorStep
            mediaItems={mediaItems}
            activeMedia={activeMedia}
            activeMediaId={activeMediaId}
            cameraRef={cameraRef}
            cameraPermissionStatus={cameraPermission?.status ?? null}
            cameraAvailable={cameraAvailable}
            cameraReady={cameraReady}
            cameraCaptureMode={cameraCaptureMode}
            capturing={capturing}
            recordingVideo={recordingVideo}
            directLinks={activeLinks}
            selectedLink={selectedLink}
            selectedLinkId={selectedLinkId}
            stickerTrayMode={stickerTrayMode}
            topInset={insets.top}
            bottomInset={insets.bottom}
            pickMedia={pickMedia}
            pickStickerImage={pickStickerImage}
            openStickerLinkSheet={openStickerLinkSheet}
            removeMedia={removeMedia}
            removeSelectedLink={removeSelectedLink}
            setStickerTrayMode={setStickerTrayMode}
            setActiveMediaId={selectActiveMedia}
            setSelectedLinkId={setSelectedLinkId}
            setCameraCaptureMode={setCameraCaptureMode}
            updateLink={updateLink}
            updateActiveMediaTransform={updateActiveMediaTransform}
            toggleActiveVideoMuted={toggleActiveVideoMuted}
            openEditLinkSheet={openEditLinkSheet}
            capturePhoto={capturePhoto}
            captureVideo={captureVideo}
            onCameraReady={handleCameraReady}
            onCameraMountError={handleCameraMountError}
            returnToCamera={returnToCamera}
            onBack={handleBackPress}
            goDetails={goDetails}
          />
          <LinkInputSheet
            visible={Boolean(pendingSticker) || Boolean(editingLinkId)}
            bottomInset={insets.bottom}
            title={
              sheetIsUploadedImage
                ? "상품 링크 연결"
                : sheetIsText
                  ? pendingSticker
                    ? "텍스트"
                    : "텍스트 수정"
                  : sheetIsEmoji
                    ? pendingSticker
                      ? "이모지"
                      : "이모지 수정"
                    : sheetRequiresUrl
                      ? pendingSticker?.stickerType === "button" ||
                        editingLink?.stickerType === "button"
                        ? pendingSticker
                          ? "버튼"
                          : "버튼 수정"
                        : pendingSticker
                          ? "스티커 링크"
                          : "스티커 수정"
                      : "스티커 수정"
            }
            caption={
              sheetIsUploadedImage
                ? "사진에 연결할 상품 URL만 입력해주세요."
                : sheetIsText
                  ? "문구, 색상, 크기를 정하고 필요하면 상품 URL을 연결하세요."
                  : sheetIsEmoji
                    ? "사진 위 이모지에 필요하면 상품 URL을 연결하세요."
                    : sheetRequiresUrl
                      ? "중앙 라벨과 상품 URL을 입력한 뒤 사진 위에서 위치를 조정하세요."
                      : "선택한 스티커의 라벨을 수정합니다."
            }
            actionLabel={
              pendingSticker
                ? sheetIsText
                  ? "텍스트 추가"
                  : sheetIsEmoji
                    ? "이모지 추가"
                    : pendingSticker.stickerType === "button"
                      ? "버튼 추가"
                      : "스티커 추가"
                : "수정 완료"
            }
            label={pendingSticker ? pendingLabel : editingLabel}
            url={pendingSticker ? pendingUrl : editingUrl}
            onChangeLabel={pendingSticker ? setPendingLabel : setEditingLabel}
            onChangeUrl={pendingSticker ? setPendingUrl : setEditingUrl}
            showLabelField={
              !sheetIsUploadedImage &&
              (sheetIsText ||
                sheetRequiresUrl ||
                (!sheetIsEmoji && !pendingSticker && !sheetRequiresUrl))
            }
            showUrlField={sheetShowsUrlField}
            labelPlaceholder={
              sheetIsText ? "문구 입력" : sheetRequiresUrl ? "버튼 라벨" : "링크 이름"
            }
            textControls={
              sheetIsText
                ? {
                    color: pendingSticker ? pendingTextColor : editingTextColor,
                    fontSizePx: pendingSticker ? pendingTextFontSizePx : editingTextFontSizePx,
                    onChangeColor: pendingSticker ? setPendingTextColor : setEditingTextColor,
                    onChangeFontSizePx: (value) => {
                      const nextFontSizePx = clampTextFontSizePx(value);
                      if (pendingSticker) {
                        setPendingTextFontSizePx(nextFontSizePx);
                      } else {
                        setEditingTextFontSizePx(nextFontSizePx);
                      }
                    }
                  }
                : undefined
            }
            onClose={closeLinkSheet}
            onSubmit={pendingSticker ? confirmPendingSticker : confirmEditingLink}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <HiddenMediaCaptureCanvases
        transformCaptureRef={transformCaptureRef}
        transformCaptureMedia={transformCaptureMedia}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + 18,
              paddingBottom: Math.max(insets.bottom + 24, 40)
            }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.detailsHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="리뷰 등록 이전 화면으로 돌아가기"
              hitSlop={10}
              onPress={handleBackPress}
              style={({ pressed }) => [styles.detailsBackButton, { opacity: pressed ? 0.68 : 1 }]}
            >
              <ChevronLeft size={24} color={theme.semantic.color.text} />
            </Pressable>
            <View style={styles.detailsHeaderCopy}>
              <ShoplyText variant="titleLg">리뷰 등록</ShoplyText>
            </View>
          </View>

          <DetailsStep
            control={control}
            errors={errors}
            selectedBrands={selectedBrands}
            selectedMerchantSites={selectedMerchantSites}
            onRemoveIdentity={removeSelectedIdentity}
            onCommitIdentity={addDirectIdentity}
            onSelectIdentitySuggestion={selectIdentitySuggestion}
            categoryOptions={categoryOptions}
            categoryId={categoryId}
            setCategoryId={(value) => {
              setValue("categoryId", value, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true
              });
            }}
            disclosure={disclosure}
            setDisclosure={(value) => {
              setValue("disclosure", value, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true
              });
              setValue("disclosureConfirmed", true, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true
              });
            }}
          />

          <View style={styles.footerActions}>
            <Button
              label="이전"
              variant="secondary"
              onPress={() => setStep("media")}
              style={{ flex: 1 }}
            />
            <Button
              label="등록"
              size="lg"
              loading={submitting}
              disabled={!canSubmitDetails}
              onPress={handleSubmit(publishReview, () => {
                Alert.alert(
                  "필수 정보를 확인해주세요",
                  "카테고리, 리뷰 제목과 본문, 구매금액, 광고·협찬 여부를 확인해주세요."
                );
              })}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PostPublishPurchaseProofSheet
        visible={Boolean(publishedReview)}
        bottomInset={insets.bottom}
        submitting={submittingPurchaseProof}
        onSubmit={submitPurchaseProofAfterPublish}
        onSkip={() => {
          if (publishedReview) openPublishedReview(publishedReview.reviewId);
        }}
      />
    </>
  );
}

function MediaEditorStep({
  mediaItems,
  activeMedia,
  activeMediaId,
  cameraRef,
  cameraPermissionStatus,
  cameraAvailable,
  cameraReady,
  cameraCaptureMode,
  capturing,
  recordingVideo,
  directLinks,
  selectedLink,
  selectedLinkId,
  stickerTrayMode,
  topInset,
  bottomInset,
  pickMedia,
  pickStickerImage,
  openStickerLinkSheet,
  removeMedia,
  removeSelectedLink,
  setStickerTrayMode,
  setActiveMediaId,
  setSelectedLinkId,
  setCameraCaptureMode,
  updateLink,
  updateActiveMediaTransform,
  toggleActiveVideoMuted,
  openEditLinkSheet,
  capturePhoto,
  captureVideo,
  onCameraReady,
  onCameraMountError,
  returnToCamera,
  onBack,
  goDetails
}: {
  mediaItems: DraftReviewMedia[];
  activeMedia: DraftReviewMedia | null;
  activeMediaId: string | null;
  cameraRef: RefObject<CameraView | null>;
  cameraPermissionStatus: PermissionStatus | null;
  cameraAvailable: boolean | null;
  cameraReady: boolean;
  cameraCaptureMode: "picture" | "video";
  capturing: boolean;
  recordingVideo: boolean;
  directLinks: DraftDirectPurchaseLink[];
  selectedLink: DraftDirectPurchaseLink | null;
  selectedLinkId: string | null;
  stickerTrayMode: StickerTrayMode | null;
  topInset: number;
  bottomInset: number;
  pickMedia: () => void;
  pickStickerImage: () => void;
  openStickerLinkSheet: (sticker: PendingStickerLink) => void;
  removeMedia: (mediaId: string) => void;
  removeSelectedLink: () => void;
  setStickerTrayMode: (mode: StickerTrayMode | null) => void;
  setActiveMediaId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
  setCameraCaptureMode: (mode: "picture" | "video") => void;
  updateLink: (id: string, patch: Partial<DraftDirectPurchaseLink>) => void;
  updateActiveMediaTransform: (transform: MediaCanvasTransform) => void;
  toggleActiveVideoMuted: () => void;
  openEditLinkSheet: (link: DraftDirectPurchaseLink) => void;
  capturePhoto: () => void;
  captureVideo: () => void;
  onCameraReady: () => void;
  onCameraMountError: () => void;
  returnToCamera: () => void;
  onBack: () => void;
  goDetails: () => void;
}) {
  const [mediaSlotSize, setMediaSlotSize] = useState<MeasuredSize>({ width: 0, height: 0 });
  const turnActiveMedia = (direction: -1 | 1) => {
    if (mediaItems.length <= 1 || !activeMedia) return;
    const activeIndex = Math.max(
      0,
      mediaItems.findIndex((item) => item.id === activeMedia.id)
    );
    const nextIndex =
      direction > 0
        ? activeIndex >= mediaItems.length - 1
          ? 0
          : activeIndex + 1
        : activeIndex <= 0
          ? mediaItems.length - 1
          : activeIndex - 1;
    const nextItem = mediaItems[nextIndex];
    if (!nextItem) return;
    setActiveMediaId(nextItem.id);
    void Haptics.selectionAsync();
  };
  const togglePlusMenu = () => {
    if (!activeMedia) {
      Alert.alert(
        "미디어를 먼저 준비해주세요",
        "촬영하거나 갤러리에서 사진/영상을 선택한 뒤 버튼이나 스티커를 추가할 수 있어요."
      );
      return;
    }
    setStickerTrayMode(stickerTrayMode === "menu" ? null : "menu");
  };
  const openCanvasStickerEditor = (id: string) => {
    const link = directLinks.find((item) => item.id === id);
    if (link && isTextSticker(link)) {
      openEditLinkSheet(link);
    }
  };
  const handleMediaSlotLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMediaSlotSize((current) =>
      Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height }
    );
  }, []);
  const showStickerTools = Boolean(stickerTrayMode || selectedLink);
  const showCameraControls = Boolean(
    activeMedia ||
    (cameraAvailable === true && cameraPermissionStatus === PermissionStatus.GRANTED && cameraReady)
  );
  const mediaFrameStyle = useMemo(() => mediaFrameSizeStyle(mediaSlotSize), [mediaSlotSize]);

  return (
    <View style={styles.mediaStage}>
      <View style={[styles.mediaHeader, { paddingTop: Math.max(topInset, 8) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="리뷰 등록에서 뒤로가기"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.mediaBackButton, { opacity: pressed ? 0.68 : 1 }]}
        >
          <ChevronLeft size={24} color="white" />
        </Pressable>
        {activeMedia ? (
          <Button
            label="다음"
            size="sm"
            icon={<ChevronRight size={16} color="white" />}
            iconPosition="right"
            accessibilityHint="리뷰 제목과 본문 입력으로 이동합니다"
            onPress={goDetails}
            style={styles.mediaTopNextButton}
          />
        ) : null}
      </View>
      <View style={styles.mediaCanvasSlot} onLayout={handleMediaSlotLayout}>
        {activeMedia ? (
          <View
            style={[styles.mediaCanvasFrame, mediaFrameStyle ?? styles.mediaCanvasFrameFallback]}
          >
            <LinkStickerCanvas
              fill
              mediaUri={activeMedia.uri}
              mediaType={activeMedia.mediaType}
              mediaMuted={activeMedia.mutedByDefault}
              mediaTransform={activeMedia.transform}
              mediaTransformEnabled={false}
              stickers={directLinks}
              selectedStickerId={selectedLinkId}
              onSelectSticker={setSelectedLinkId}
              onEditSticker={openCanvasStickerEditor}
              onChangeSticker={updateLink}
              onChangeMediaTransform={updateActiveMediaTransform}
              onSwipeMedia={turnActiveMedia}
            />
            {activeMedia.mediaType === "video" ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="영상 음소거 등록"
                accessibilityState={{ checked: activeMedia.mutedByDefault }}
                hitSlop={8}
                onPress={toggleActiveVideoMuted}
                style={({ pressed }) => [
                  styles.editorVideoMuteButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                {activeMedia.mutedByDefault ? (
                  <VolumeX size={17} color="white" />
                ) : (
                  <Volume2 size={17} color="white" />
                )}
                <ShoplyText variant="caption" style={styles.overlayText}>
                  {activeMedia.mutedByDefault ? "무음으로 등록" : "소리 포함"}
                </ShoplyText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <CameraPreview
            cameraRef={cameraRef}
            cameraPermissionStatus={cameraPermissionStatus}
            cameraAvailable={cameraAvailable}
            cameraCaptureMode={cameraCaptureMode}
            onCameraReady={onCameraReady}
            onCameraMountError={onCameraMountError}
            pickMedia={pickMedia}
          />
        )}
      </View>

      <View style={[styles.mediaBottomOverlay, { paddingBottom: Math.max(bottomInset + 10, 16) }]}>
        {stickerTrayMode ? (
          <StickerTray
            mode={stickerTrayMode}
            openStickerLinkSheet={openStickerLinkSheet}
            pickStickerImage={pickStickerImage}
            onSelectMode={setStickerTrayMode}
            onBack={() => setStickerTrayMode(null)}
          />
        ) : showStickerTools ? (
          <StickerInspector
            directLinks={directLinks}
            selectedLink={selectedLink}
            selectedLinkId={selectedLinkId}
            setSelectedLinkId={setSelectedLinkId}
            openEditLinkSheet={openEditLinkSheet}
            removeSelectedLink={removeSelectedLink}
            onDone={() => setSelectedLinkId(null)}
          />
        ) : (
          <MediaRail
            mediaItems={mediaItems}
            activeMediaId={activeMediaId}
            setActiveMediaId={setActiveMediaId}
            removeMedia={removeMedia}
            pickMedia={pickMedia}
          />
        )}

        {showStickerTools || !showCameraControls ? null : (
          <CameraControls
            cameraReady={cameraReady}
            capturing={capturing}
            recordingVideo={recordingVideo}
            hasMedia={Boolean(activeMedia)}
            pickMedia={pickMedia}
            captureMedia={
              activeMedia
                ? returnToCamera
                : cameraCaptureMode === "video"
                  ? captureVideo
                  : capturePhoto
            }
            captureMode={cameraCaptureMode}
            setCaptureMode={setCameraCaptureMode}
            togglePlusMenu={togglePlusMenu}
          />
        )}
      </View>
    </View>
  );
}

function CameraPreview({
  cameraRef,
  cameraPermissionStatus,
  cameraAvailable,
  cameraCaptureMode,
  onCameraReady,
  onCameraMountError,
  pickMedia
}: {
  cameraRef: RefObject<CameraView | null>;
  cameraPermissionStatus: PermissionStatus | null;
  cameraAvailable: boolean | null;
  cameraCaptureMode: "picture" | "video";
  onCameraReady: () => void;
  onCameraMountError: () => void;
  pickMedia: () => void;
}) {
  const cameraPermissionDenied = cameraPermissionStatus === PermissionStatus.DENIED;

  if (cameraAvailable === false || cameraPermissionDenied) {
    return (
      <View style={styles.cameraFallback}>
        <View style={styles.cameraFallbackText}>
          <ShoplyText variant="titleMd" style={styles.overlayText}>
            사진이나 영상으로 리뷰를 시작해요
          </ShoplyText>
        </View>
        <Button
          label="앨범에서 선택"
          icon={<Images size={17} color="white" />}
          onPress={pickMedia}
        />
      </View>
    );
  }

  if (cameraAvailable !== true || cameraPermissionStatus !== PermissionStatus.GRANTED) {
    return <View style={styles.cameraPermissionPending} />;
  }

  return (
    <CameraView
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      facing="back"
      mode={cameraCaptureMode}
      animateShutter={cameraCaptureMode === "picture"}
      videoQuality="720p"
      onCameraReady={onCameraReady}
      onMountError={onCameraMountError}
    />
  );
}

function CameraControls({
  cameraReady,
  capturing,
  recordingVideo,
  hasMedia,
  pickMedia,
  captureMedia,
  captureMode,
  setCaptureMode,
  togglePlusMenu
}: {
  cameraReady: boolean;
  capturing: boolean;
  recordingVideo: boolean;
  hasMedia: boolean;
  pickMedia: () => void;
  captureMedia: () => void;
  captureMode: "picture" | "video";
  setCaptureMode: (mode: "picture" | "video") => void;
  togglePlusMenu: () => void;
}) {
  const disabled = !hasMedia && !recordingVideo && (!cameraReady || capturing);

  return (
    <View style={styles.captureControlsWrap}>
      {hasMedia ? null : (
        <View style={styles.captureModeSwitch}>
          <CaptureModeButton
            label="사진"
            selected={captureMode === "picture"}
            disabled={recordingVideo}
            onPress={() => setCaptureMode("picture")}
          />
          <CaptureModeButton
            label="영상"
            selected={captureMode === "video"}
            disabled={recordingVideo}
            onPress={() => setCaptureMode("video")}
          />
        </View>
      )}
      <View style={styles.captureControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="갤러리에서 리뷰 사진이나 영상 선택"
          disabled={recordingVideo}
          onPress={pickMedia}
          style={[styles.galleryControl, recordingVideo ? styles.captureButtonDisabled : null]}
        >
          <Images size={16} color="white" />
          <ShoplyText variant="caption" style={styles.overlayText}>
            앨범
          </ShoplyText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hasMedia
              ? "카메라로 돌아가기"
              : recordingVideo
                ? "영상 촬영 종료"
                : captureMode === "video"
                  ? "영상 촬영 시작"
                  : "사진 촬영"
          }
          disabled={disabled}
          onPress={captureMedia}
          style={[
            styles.captureButton,
            recordingVideo ? styles.captureButtonRecording : null,
            disabled ? styles.captureButtonDisabled : null
          ]}
        >
          <View
            style={[
              styles.captureButtonInner,
              captureMode === "video" ? styles.captureButtonInnerVideo : null,
              recordingVideo ? styles.captureButtonInnerRecording : null
            ]}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스티커 추가 메뉴"
          disabled={recordingVideo}
          onPress={togglePlusMenu}
          style={[styles.plusControl, recordingVideo ? styles.captureButtonDisabled : null]}
        >
          <Plus size={19} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

function CaptureModeButton({
  label,
  selected,
  disabled,
  onPress
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.captureModeButton,
        selected ? styles.captureModeButtonSelected : null,
        disabled ? styles.captureModeButtonDisabled : null
      ]}
    >
      <ShoplyText
        variant="caption"
        style={selected ? styles.captureModeButtonTextSelected : styles.overlayMutedText}
      >
        {label}
      </ShoplyText>
    </Pressable>
  );
}

function MediaRail({
  mediaItems,
  activeMediaId,
  setActiveMediaId,
  removeMedia,
  pickMedia
}: {
  mediaItems: DraftReviewMedia[];
  activeMediaId: string | null;
  setActiveMediaId: (id: string | null) => void;
  removeMedia: (mediaId: string) => void;
  pickMedia: () => void;
}) {
  const theme = useShoplyTheme();
  if (!mediaItems.length) return null;

  const activeIndex = Math.max(
    0,
    mediaItems.findIndex((item) => item.id === activeMediaId)
  );
  const activeItem = mediaItems[activeIndex] ?? mediaItems[0];
  const goPrevious = () => {
    const next = mediaItems[Math.max(0, activeIndex - 1)];
    if (next) setActiveMediaId(next.id);
  };
  const goNext = () => {
    const next = mediaItems[Math.min(mediaItems.length - 1, activeIndex + 1)];
    if (next) setActiveMediaId(next.id);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={[styles.mediaRail, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}
    >
      <View style={styles.mediaRailHeader}>
        <View style={styles.mediaStepper}>
          <OverlayIconButton
            accessibilityLabel="이전 미디어"
            icon={<ChevronLeft size={17} color="white" />}
            onPress={goPrevious}
          />
          <ShoplyText variant="caption" style={styles.overlayMutedText}>
            {activeIndex + 1}/{mediaItems.length}
          </ShoplyText>
          <OverlayIconButton
            accessibilityLabel="다음 미디어"
            icon={<ChevronRight size={17} color="white" />}
            onPress={goNext}
          />
        </View>
        <View style={styles.mediaRailActions}>
          <Button
            label="추가"
            size="sm"
            variant="ghost"
            icon={<Images size={15} color="white" />}
            onPress={pickMedia}
          />
          {activeItem ? (
            <Button
              size="icon"
              variant="ghost"
              accessibilityLabel="현재 미디어 삭제"
              icon={<Trash2 size={16} color="white" />}
              onPress={() => removeMedia(activeItem.id)}
            />
          ) : null}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mediaThumbList}
      >
        {mediaItems.map((item, index) => {
          const selected = item.id === activeMediaId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}번째 미디어 선택`}
              onPress={() => setActiveMediaId(item.id)}
              style={[
                styles.mediaThumb,
                {
                  borderColor: selected ? theme.semantic.color.whiteStroke : "transparent"
                }
              ]}
            >
              {item.mediaType === "image" ? (
                <ExpoImage
                  source={{ uri: item.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.videoThumb}>
                  <Play size={15} color="white" />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

function TransformedMediaCaptureCanvas({
  refView,
  mediaItem
}: {
  refView: RefObject<View | null>;
  mediaItem: DraftReviewMedia | null;
}) {
  return (
    <View pointerEvents="none" style={styles.transformCaptureHost}>
      <View ref={refView} collapsable={false} style={styles.transformCaptureCanvas}>
        {mediaItem ? (
          <>
            <View
              style={[StyleSheet.absoluteFill, transformedMediaCaptureStyle(mediaItem.transform)]}
            >
              <ExpoImage
                source={{ uri: mediaItem.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </View>
            {mediaItem.links.filter(isDecorativeSticker).map((sticker) => (
              <CaptureDecorativeSticker key={sticker.id} sticker={sticker} />
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}

function HiddenMediaCaptureCanvases({
  transformCaptureRef,
  transformCaptureMedia
}: {
  transformCaptureRef: RefObject<View | null>;
  transformCaptureMedia: DraftReviewMedia | null;
}) {
  return (
    <TransformedMediaCaptureCanvas
      refView={transformCaptureRef}
      mediaItem={transformCaptureMedia}
    />
  );
}

function CaptureDecorativeSticker({ sticker }: { sticker: DraftDirectPurchaseLink }) {
  const baseWidth = Math.max(24, captureCanvasSize.width * sticker.widthRatio);
  const baseHeight = Math.max(24, captureCanvasSize.height * sticker.heightRatio);
  const left = clampNumber(
    sticker.xRatio * captureCanvasSize.width - baseWidth / 2,
    0,
    captureCanvasSize.width - baseWidth
  );
  const top = clampNumber(
    sticker.yRatio * captureCanvasSize.height - baseHeight / 2,
    0,
    captureCanvasSize.height - baseHeight
  );

  if (isEmojiSticker(sticker)) {
    const width = baseWidth;
    const height = baseHeight;
    const fontSize = Math.max(28, Math.min(width, height) * 0.82);
    return (
      <View
        pointerEvents="none"
        style={[styles.captureVisualSticker, { height, left, top, width }]}
      >
        <ShoplyText
          variant="titleLg"
          numberOfLines={1}
          style={[styles.captureEmojiStickerLabel, { fontSize, lineHeight: fontSize * 1.08 }]}
        >
          {sticker.emoji ?? sticker.label}
        </ShoplyText>
      </View>
    );
  }

  const fontSize = captureTextFontSize(baseHeight, sticker.textScale, sticker.fontSizePx);
  const width = Math.max(
    baseWidth,
    Math.min(captureCanvasSize.width * 0.9, textStickerLabelWidth(sticker.label, fontSize) + 26)
  );
  const height = Math.max(baseHeight, fontSize * 1.18 + 10);
  const textLeft = clampNumber(
    sticker.xRatio * captureCanvasSize.width - width / 2,
    0,
    captureCanvasSize.width - width
  );
  const textTop = clampNumber(
    sticker.yRatio * captureCanvasSize.height - height / 2,
    0,
    captureCanvasSize.height - height
  );
  return (
    <View
      pointerEvents="none"
      style={[styles.captureTextSticker, { height, left: textLeft, top: textTop, width }]}
    >
      <ShoplyText
        variant="titleMd"
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[
          styles.captureTextStickerLabel,
          {
            color: sticker.textColor ?? defaultTextStickerColor,
            fontSize,
            lineHeight: fontSize * 1.12
          }
        ]}
      >
        {sticker.label}
      </ShoplyText>
    </View>
  );
}

function captureTextFontSize(stickerHeight: number, textScale = 1, fontSizePx?: number) {
  return clampTextFontSizePx(fontSizePx ?? stickerHeight * 0.58 * textScale);
}

function transformedMediaCaptureStyle(transform: MediaCanvasTransform) {
  return {
    transform: [
      { translateX: transform.translateXRatio * captureCanvasSize.width },
      { translateY: transform.translateYRatio * captureCanvasSize.height },
      { scale: transform.scale }
    ]
  } as const;
}

function mediaFrameSizeStyle(slotSize: MeasuredSize) {
  if (slotSize.width <= 0 || slotSize.height <= 0) return null;

  const aspectRatio = captureCanvasSize.width / captureCanvasSize.height;
  const widthLimitedHeight = slotSize.width / aspectRatio;
  if (widthLimitedHeight <= slotSize.height) {
    return {
      height: widthLimitedHeight,
      width: slotSize.width
    };
  }

  return {
    height: slotSize.height,
    width: slotSize.height * aspectRatio
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(min, value), Math.max(min, max));
}

function OverlayIconButton({
  accessibilityLabel,
  icon,
  onPress
}: {
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.overlayIconButton}
    >
      {icon}
    </Pressable>
  );
}

function StickerTray({
  mode,
  openStickerLinkSheet,
  pickStickerImage,
  onSelectMode,
  onBack
}: {
  mode: StickerTrayMode;
  openStickerLinkSheet: (sticker: PendingStickerLink) => void;
  pickStickerImage: () => void;
  onSelectMode: (mode: StickerTrayMode) => void;
  onBack: () => void;
}) {
  const theme = useShoplyTheme();
  if (mode === "menu") {
    return (
      <View
        style={[
          styles.stickerTray,
          {
            backgroundColor: theme.semantic.color.mediaScrimStrong
          }
        ]}
      >
        <View style={styles.stickerTrayHeader}>
          <Button label="닫기" size="sm" variant="ghost" onPress={onBack} />
          <ShoplyText variant="caption" style={styles.overlayMutedText}>
            추가
          </ShoplyText>
        </View>
        <View style={styles.stickerTrayContent}>
          <StickerTrayItem
            label="사진"
            icon={<Images size={25} color="white" strokeWidth={2.4} />}
            emphasized
            toolOnly
            onPress={pickStickerImage}
          />
          <StickerTrayItem
            label="스티커"
            visualVariant="burst"
            toolOnly
            onPress={() => onSelectMode("sticker")}
          />
          <StickerTrayItem
            label="이모지"
            emoji="✨"
            toolOnly
            onPress={() => onSelectMode("emoji")}
          />
          <StickerTrayItem
            label="버튼"
            visualVariant="chrome"
            toolOnly
            onPress={() => onSelectMode("button")}
          />
          <StickerTrayItem
            label="텍스트"
            icon={<Type size={25} color="white" strokeWidth={2.6} />}
            toolOnly
            onPress={() => onSelectMode("text")}
          />
        </View>
      </View>
    );
  }

  const items: StickerTrayOption[] =
    mode === "button"
      ? buttonStickerPresets.map((item) => ({
          label: item.label,
          stickerType: "button" as StickerType,
          widthRatio: item.widthRatio,
          heightRatio: item.heightRatio,
          visualVariant: item.visualVariant as DraftDirectPurchaseLink["visualVariant"]
        }))
      : mode === "sticker"
        ? cutoutStickerPresets.map((item) => ({
            label: item.label,
            stickerType: "asset_cutout" as StickerType,
            widthRatio: item.widthRatio,
            heightRatio: item.heightRatio,
            visualVariant: item.visualVariant as DraftDirectPurchaseLink["visualVariant"]
          }))
        : mode === "text"
          ? [
              {
                label: textStickerPreset.label,
                stickerType: "text" as StickerType,
                widthRatio: textStickerPreset.widthRatio,
                heightRatio: textStickerPreset.heightRatio
              }
            ]
          : emojiStickerPresets.map((emoji) => ({
              label: emoji,
              stickerType: "asset_cutout" as StickerType,
              widthRatio: 0.14,
              heightRatio: 0.088,
              visualVariant: "emoji" as DraftDirectPurchaseLink["visualVariant"],
              emoji
            }));

  return (
    <View
      style={[
        styles.stickerTray,
        {
          backgroundColor: theme.semantic.color.mediaScrimStrong
        }
      ]}
    >
      <View style={styles.stickerTrayHeader}>
        <Button label="뒤로" size="sm" variant="ghost" onPress={onBack} />
        <ShoplyText variant="caption" style={styles.overlayMutedText}>
          {mode === "button"
            ? "버튼 선택"
            : mode === "sticker"
              ? "스티커 선택"
              : mode === "text"
                ? "텍스트 추가"
                : "이모지 선택"}
        </ShoplyText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stickerTrayContent}
      >
        {items.map((item) => (
          <StickerTrayItem
            key={item.label}
            label={item.label}
            assetUri={item.assetUri}
            visualVariant={item.visualVariant}
            emoji={item.emoji}
            icon={
              item.stickerType === "text" ? (
                <Type size={25} color="white" strokeWidth={2.6} />
              ) : undefined
            }
            onPress={() =>
              openStickerLinkSheet({
                stickerType: item.stickerType,
                label: item.label,
                widthRatio: item.widthRatio,
                heightRatio: item.heightRatio,
                assetUri: item.assetUri,
                visualVariant: item.visualVariant,
                emoji: item.emoji
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

function StickerTrayItem({
  label,
  assetUri,
  visualVariant,
  emoji,
  icon,
  emphasized,
  toolOnly,
  onPress
}: {
  label: string;
  assetUri?: string;
  visualVariant?: DraftDirectPurchaseLink["visualVariant"];
  emoji?: string;
  icon?: ReactNode;
  emphasized?: boolean;
  toolOnly?: boolean;
  onPress: () => void;
}) {
  const theme = useShoplyTheme();
  const firePress = () => {
    void Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 추가`} onPress={firePress}>
      <View
        style={[
          styles.stickerTrayItem,
          toolOnly ? styles.stickerTrayToolItem : null,
          {
            backgroundColor: emphasized
              ? theme.semantic.color.primary
              : "rgba(255, 255, 255, 0.12)",
            borderColor: "transparent"
          }
        ]}
      >
        {icon ? (
          <View style={styles.stickerTrayIcon}>{icon}</View>
        ) : assetUri ? (
          <View style={styles.stickerTrayAssetWrap}>
            <ExpoImage
              source={{ uri: assetUri }}
              style={styles.stickerTrayAsset}
              contentFit="contain"
            />
            <View pointerEvents="none" style={styles.presetArtworkLabelOverlay}>
              <ShoplyText
                variant="caption"
                adjustsFontSizeToFit
                minimumFontScale={0.58}
                style={styles.stickerTrayAssetLabel}
                numberOfLines={1}
              >
                {label.trim() || "LINK"}
              </ShoplyText>
            </View>
          </View>
        ) : visualVariant && visualVariant !== "pill" && visualVariant !== "emoji" ? (
          <View style={styles.stickerTrayArtwork}>
            <PresetArtwork variant={visualVariant as StickerArtworkVariant} label={label} />
          </View>
        ) : (
          <ShoplyText
            variant={emoji ? "titleMd" : "caption"}
            style={styles.stickerTrayItemLabel}
            numberOfLines={1}
          >
            {emoji ?? label}
          </ShoplyText>
        )}
      </View>
    </Pressable>
  );
}

function PresetArtwork({ variant, label }: { variant: StickerArtworkVariant; label: string }) {
  const geometry = getStickerArtworkGeometry(variant);
  const textColor = variant === "chrome" ? "#080B12" : "#FFFFFF";
  const labelBackground =
    variant === "chrome" ? "rgba(255, 255, 255, 0.72)" : "rgba(5, 5, 7, 0.44)";

  return (
    <View style={styles.presetArtwork}>
      <Svg width="100%" height="100%" viewBox={geometry.viewBox} style={StyleSheet.absoluteFill}>
        {variant === "spark" ? (
          <Polygon
            points="70,5 82,31 111,25 91,47 109,73 78,61 55,84 56,54 27,40 57,34"
            fill="#FFD84D"
            stroke="#16171C"
            strokeWidth="6"
            strokeLinejoin="round"
          />
        ) : variant === "cart" ? (
          <G>
            <Circle cx="70" cy="46" r="38" fill="#FFFFFF" />
            <Circle cx="73" cy="49" r="32" fill="#0B0B0F" opacity="0.28" />
            <Circle cx="68" cy="43" r="31" fill="#F8FAFC" />
            <Circle cx="68" cy="43" r="25" fill="#FDE047" />
            <Path
              d="M50 33h7l4 19h23l6-14H62"
              stroke="#101318"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Circle cx="65" cy="62" r="4.5" fill="#101318" />
            <Circle cx="82" cy="62" r="4.5" fill="#101318" />
            <Path d="M46 22c14-10 34-9 46 2" stroke="#FFFFFF" strokeWidth="5" opacity="0.72" />
          </G>
        ) : variant === "bag" ? (
          <G>
            <Path
              d="M24 27c0-8 7-14 15-14h60c8 0 15 6 15 14v42c0 8-7 14-15 14H39c-8 0-15-6-15-14V27Z"
              fill="#FFFFFF"
            />
            <Path d="M38 27h68l8 47H29l9-47Z" fill="#0B0B0F" opacity="0.3" />
            <Path d="M34 25h57l-4 50H27l7-50Z" fill="#55E2B2" />
            <Path d="M88 25h19l9 48H86l2-48Z" fill="#7C3AED" />
            <Path d="M52 32c0-17 34-17 34 0" stroke="#0B0B0F" strokeWidth="7" fill="none" />
            <Path d="M43 31h42" stroke="#A7F3D0" strokeWidth="4" opacity="0.8" />
          </G>
        ) : variant === "arrow" ? (
          <G>
            <Path d="M12 39 39 16h47l19 14 15 14-28 30H39L12 58Z" fill="#FFFFFF" />
            <Path d="M20 43 43 22h39l30 22-29 25H43L20 55Z" fill="#0B0B0F" />
            <Path d="M16 37 43 17h37l33 25-32 28H42L16 53Z" fill="#0F7BFF" />
            <Circle cx="41" cy="45" r="9" fill="#FFFFFF" />
            <Circle cx="41" cy="45" r="5" fill="#0B0B0F" />
            <Path d="M25 49c-20 13-12 25 14 4" stroke="#0B0B0F" strokeWidth="6" fill="none" />
            <Path d="M25 49c-13 10-7 16 9 5" stroke="#FFFFFF" strokeWidth="3" fill="none" />
          </G>
        ) : variant === "chrome" ? (
          <G>
            <Rect x="12" y="20" width="116" height="52" rx="26" fill="#FFFFFF" />
            <Rect x="20" y="25" width="100" height="42" rx="21" fill="#0B0B0F" opacity="0.2" />
            <Rect x="18" y="22" width="100" height="42" rx="21" fill="#F8FAFC" />
            <Path d="M22 52c17-18 48-26 90-23" stroke="#B9C4FF" strokeWidth="12" opacity="0.8" />
            <Path d="M28 34c26 6 48 4 78-3" stroke="#111827" strokeWidth="4" opacity="0.18" />
          </G>
        ) : variant === "ribbon" ? (
          <G>
            <Path d="M17 25h94l12 21-12 21H17l14-21Z" fill="#FFFFFF" />
            <Path d="M25 29h81l10 17-10 17H25l12-17Z" fill="#14B8A6" />
            <Path d="M35 36h58" stroke="#9FFFE6" strokeWidth="4" opacity="0.7" />
          </G>
        ) : variant === "badge" ? (
          <G>
            <Circle cx="70" cy="46" r="38" fill="#FFFFFF" />
            <Circle cx="70" cy="46" r="31" fill="#111827" />
            <Path d="M70 16 80 36l22 3-16 16 4 22-20-10-20 10 4-22-16-16 22-3Z" fill="#F97316" />
          </G>
        ) : variant === "pointer" ? (
          <G>
            <Path d="M18 23h72c12 0 22 10 22 22s-10 22-22 22H18l22-22Z" fill="#FFFFFF" />
            <Path d="M28 29h58c9 0 17 7 17 16S95 61 86 61H28l18-16Z" fill="#8B5CF6" />
            <Circle cx="87" cy="45" r="8" fill="#FFFFFF" opacity="0.82" />
          </G>
        ) : (
          <G>
            <Polygon
              points="70,6 83,25 105,15 111,37 132,43 113,58 119,80 94,75 77,88 64,68 40,82 42,58 12,53 36,37 29,18 55,25"
              fill="#FFFFFF"
            />
            <Polygon
              points="70,12 82,29 100,22 105,40 124,46 107,58 112,75 91,70 77,82 65,63 45,75 47,56 20,51 42,38 36,23 57,30"
              fill="#0B0B0F"
              opacity="0.32"
            />
            <Polygon
              points="69,10 81,28 100,20 105,40 124,45 107,58 112,76 90,71 77,84 64,64 43,77 45,57 17,51 41,37 35,20 57,29"
              fill="#FF5F57"
            />
            <Path d="M112 26 127 18" stroke="#FDE047" strokeWidth="7" strokeLinecap="round" />
            <Path d="M22 68 9 80" stroke="#FDE047" strokeWidth="7" strokeLinecap="round" />
            <Path d="M119 66 132 76" stroke="#8B5CF6" strokeWidth="7" strokeLinecap="round" />
          </G>
        )}
        {variant === "spark" ? null : (
          <SvgArtworkLabel
            label={label}
            backgroundColor={labelBackground}
            textColor={textColor}
            maxWidth={geometry.labelMaxWidth}
          />
        )}
      </Svg>
    </View>
  );
}

function SvgArtworkLabel({
  label,
  backgroundColor,
  textColor,
  maxWidth
}: {
  label: string;
  backgroundColor: string;
  textColor: string;
  maxWidth: number;
}) {
  const metrics = artworkLabelMetrics(label, 12, maxWidth);

  return (
    <G pointerEvents="none">
      <Rect
        x={(140 - metrics.width) / 2}
        y={35}
        width={metrics.width}
        height={22}
        rx={11}
        fill={backgroundColor}
      />
      <SvgText
        x={70}
        y={46 + metrics.fontSize * 0.36}
        fill={textColor}
        fontSize={metrics.fontSize}
        fontWeight="800"
        textAnchor="middle"
      >
        {metrics.text}
      </SvgText>
    </G>
  );
}

function artworkLabelMetrics(label: string, baseFontSize: number, maxWidth: number) {
  const rawText = label.trim() || "LINK";
  const minWidth = 34;
  const horizontalPadding = 16;
  const minFontSize = 9;
  const text = fitArtworkLabel(rawText, (maxWidth - horizontalPadding) / minFontSize);
  const units = Math.max(1, textWidthUnits(text));
  const maxTextWidth = maxWidth - horizontalPadding;
  const fontSize = Math.max(minFontSize, Math.min(baseFontSize, maxTextWidth / units));
  const width = Math.min(maxWidth, Math.max(minWidth, units * fontSize + horizontalPadding));

  return { text, width, fontSize };
}

function fitArtworkLabel(text: string, maxUnits: number) {
  if (textWidthUnits(text) <= maxUnits) return text;

  const suffix = "...";
  let next = "";
  for (const character of Array.from(text)) {
    if (textWidthUnits(`${next}${character}${suffix}`) > maxUnits) break;
    next += character;
  }

  return next ? `${next}${suffix}` : suffix;
}

function textWidthUnits(text: string) {
  return Array.from(text).reduce((total, character) => {
    if (character === " ") return total + 0.42;
    return total + (character.charCodeAt(0) > 127 ? 0.98 : 0.62);
  }, 0);
}

function StickerInspector({
  directLinks,
  selectedLink,
  selectedLinkId,
  setSelectedLinkId,
  openEditLinkSheet,
  removeSelectedLink,
  onDone
}: {
  directLinks: DraftDirectPurchaseLink[];
  selectedLink: DraftDirectPurchaseLink | null;
  selectedLinkId: string | null;
  setSelectedLinkId: (id: string | null) => void;
  openEditLinkSheet: (link: DraftDirectPurchaseLink) => void;
  removeSelectedLink: () => void;
  onDone: () => void;
}) {
  const theme = useShoplyTheme();

  if (!selectedLink) {
    return null;
  }
  const canEditSelected = stickerSupportsUrlInput(selectedLink);

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={[
        styles.stickerInspector,
        {
          backgroundColor: theme.semantic.color.mediaScrimStrong,
          borderColor: "transparent"
        }
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.linkList}
      >
        {directLinks.map((link, index) => (
          <Animated.View key={link.id} entering={FadeIn.delay(index * 35).duration(160)}>
            <Pressable
              onPress={() => setSelectedLinkId(link.id)}
              style={[
                styles.linkPill,
                selectedLinkId === link.id
                  ? { backgroundColor: theme.semantic.color.whiteStroke }
                  : { backgroundColor: "rgba(255, 255, 255, 0.13)" }
              ]}
            >
              <ShoplyText
                variant="caption"
                style={[
                  styles.linkPillText,
                  {
                    color:
                      selectedLinkId === link.id
                        ? theme.component.sticker.buttonText
                        : theme.semantic.color.textInverse
                  }
                ]}
                numberOfLines={1}
              >
                {index + 1}. {link.label}
              </ShoplyText>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>

      <View style={styles.stickerInspectorHeader}>
        <View style={styles.readyLine}>
          <Check size={16} color={theme.semantic.color.successFill} />
          <ShoplyText variant="caption" style={styles.overlayMutedText}>
            선택한 스티커를 조정 중
          </ShoplyText>
        </View>
        <Button label="완료" size="sm" variant="ghost" onPress={onDone} />
        {canEditSelected ? (
          <Button
            label="수정"
            size="sm"
            variant="ghost"
            icon={<LinkIcon size={16} color="white" />}
            onPress={() => openEditLinkSheet(selectedLink)}
          />
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          accessibilityLabel="선택한 스티커 삭제"
          icon={<Trash2 size={16} color="white" />}
          onPress={removeSelectedLink}
        />
      </View>
    </Animated.View>
  );
}

function LinkInputSheet({
  visible,
  bottomInset,
  title,
  caption,
  actionLabel,
  label,
  url,
  onChangeLabel,
  onChangeUrl,
  showLabelField = true,
  showUrlField = true,
  labelPlaceholder = "스티커 라벨",
  textControls,
  onClose,
  onSubmit
}: {
  visible: boolean;
  bottomInset: number;
  title: string;
  caption: string;
  actionLabel: string;
  label: string;
  url: string;
  onChangeLabel: (value: string) => void;
  onChangeUrl: (value: string) => void;
  showLabelField?: boolean;
  showUrlField?: boolean;
  labelPlaceholder?: string;
  textControls?: {
    color: string;
    fontSizePx: number;
    onChangeColor: (value: string) => void;
    onChangeFontSizePx: (value: number) => void;
  };
  onClose: () => void;
  onSubmit: () => void;
}) {
  const theme = useShoplyTheme();

  return (
    <KeyboardAwareBottomSheet
      visible={visible}
      accessibilityLabel="링크 입력 닫기"
      onClose={onClose}
      contentStyle={[
        styles.linkSheet,
        {
          backgroundColor: theme.semantic.color.surface,
          paddingBottom: Math.max(bottomInset + 16, 24)
        },
        theme.semantic.shadow.overlay
      ]}
    >
      <View style={[styles.sheetHandle, { backgroundColor: theme.semantic.color.borderStrong }]} />
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <ShoplyText variant="titleMd">{title}</ShoplyText>
          <ShoplyText variant="caption" color="textMuted">
            {caption}
          </ShoplyText>
        </View>
        <Button label="닫기" size="sm" variant="tertiary" onPress={onClose} />
      </View>
      <ScrollView
        bounces={false}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.linkSheetContent}
      >
        {showLabelField ? (
          <Field
            value={label}
            onChangeText={onChangeLabel}
            placeholder={labelPlaceholder}
            autoFocus={Boolean(textControls)}
          />
        ) : null}
        {textControls ? <TextStickerControls {...textControls} /> : null}
        {showUrlField ? (
          <Field
            value={url}
            onChangeText={onChangeUrl}
            placeholder="https://example.com/product"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        ) : null}
        <Button label={actionLabel} size="lg" onPress={onSubmit} />
      </ScrollView>
    </KeyboardAwareBottomSheet>
  );
}

function TextStickerControls({
  color,
  fontSizePx,
  onChangeColor,
  onChangeFontSizePx
}: {
  color: string;
  fontSizePx: number;
  onChangeColor: (value: string) => void;
  onChangeFontSizePx: (value: number) => void;
}) {
  const theme = useShoplyTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const decreaseDisabled = fontSizePx <= textStickerFontSizeRange.min;
  const increaseDisabled = fontSizePx >= textStickerFontSizeRange.max;

  const setFontSize = (nextFontSizePx: number) => {
    onChangeFontSizePx(clampTextFontSizePx(nextFontSizePx));
    void Haptics.selectionAsync();
  };

  return (
    <View style={styles.textControlPanel}>
      <View style={styles.textControlHeader}>
        <View style={[styles.textControlPreview, { borderColor: color }]}>
          <ShoplyText
            variant="titleMd"
            numberOfLines={1}
            style={{
              color,
              fontSize: Math.min(30, fontSizePx),
              lineHeight: Math.min(34, fontSizePx * 1.12),
              textShadowColor: "rgba(0, 0, 0, 0.28)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2
            }}
          >
            Aa
          </ShoplyText>
        </View>
        <View style={styles.textSizeControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="텍스트 크기 줄이기"
            disabled={decreaseDisabled}
            onPress={() => setFontSize(fontSizePx - textStickerFontSizeRange.step)}
            style={[
              styles.textSizeButton,
              {
                backgroundColor: theme.semantic.color.surfaceMuted,
                opacity: decreaseDisabled ? 0.42 : 1
              }
            ]}
          >
            <Minus size={17} color={theme.semantic.color.text} />
          </Pressable>
          <View
            style={[
              styles.textSizeValueBox,
              {
                backgroundColor: theme.semantic.color.surface,
                borderColor: theme.semantic.color.border
              }
            ]}
          >
            <TextInput
              accessibilityLabel="텍스트 크기 픽셀 입력"
              keyboardType="number-pad"
              onChangeText={(value) => {
                const parsed = Number(value.replace(/[^0-9]/g, ""));
                if (Number.isFinite(parsed) && parsed > 0) {
                  onChangeFontSizePx(clampTextFontSizePx(parsed));
                }
              }}
              selectTextOnFocus
              style={[styles.textSizeInput, { color: theme.semantic.color.text }]}
              value={String(fontSizePx)}
            />
            <ShoplyText variant="caption" color="textMuted">
              px
            </ShoplyText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="텍스트 크기 키우기"
            disabled={increaseDisabled}
            onPress={() => setFontSize(fontSizePx + textStickerFontSizeRange.step)}
            style={[
              styles.textSizeButton,
              {
                backgroundColor: theme.semantic.color.surfaceMuted,
                opacity: increaseDisabled ? 0.42 : 1
              }
            ]}
          >
            <Plus size={17} color={theme.semantic.color.text} />
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="텍스트 색상 팔레트 열기"
        onPress={() => {
          setPaletteOpen((open) => !open);
          void Haptics.selectionAsync();
        }}
        style={[
          styles.paletteTrigger,
          {
            backgroundColor: theme.semantic.color.surfaceMuted,
            borderColor: paletteOpen ? theme.semantic.color.primary : theme.semantic.color.border
          }
        ]}
      >
        <View style={[styles.palettePreview, { backgroundColor: color }]} />
        <ShoplyText variant="labelMd" style={{ flex: 1 }}>
          텍스트 색상
        </ShoplyText>
        <Palette size={18} color={theme.semantic.color.text} />
      </Pressable>
      {paletteOpen ? (
        <View style={styles.textColorRow}>
          {textStickerColorOptions.map((option) => {
            const selected = option.toLowerCase() === color.toLowerCase();
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`텍스트 색상 ${option}`}
                onPress={() => {
                  onChangeColor(option);
                  setPaletteOpen(false);
                  void Haptics.selectionAsync();
                }}
                style={[
                  styles.textColorSwatch,
                  {
                    backgroundColor: option,
                    borderColor: selected
                      ? theme.semantic.color.primary
                      : theme.semantic.color.borderStrong
                  }
                ]}
              >
                {selected ? (
                  <Check
                    size={15}
                    color={option === "#111722" || option === "#020617" ? "white" : "#111722"}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function MultiIdentityInput({
  kind,
  label,
  placeholder,
  selected,
  onRemove,
  onCommit,
  onSelectSuggestion
}: {
  kind: IdentityKind;
  label: string;
  placeholder: string;
  selected: SelectedIdentity[];
  onRemove: (id: string) => void;
  onCommit: (value: string) => void | Promise<void>;
  onSelectSuggestion: (identity: SelectedIdentity) => void;
}) {
  const theme = useShoplyTheme();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<SelectedIdentity[]>([]);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [suggestionFailed, setSuggestionFailed] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const normalizedValue = normalizeIdentityInput(value);
  const duplicateInput = selected.some(
    (item) => normalizeIdentityInput(item.name) === normalizedValue
  );

  useEffect(() => {
    if (!normalizedValue || duplicateInput || selected.length >= identitySelectionLimit) {
      setSuggestions([]);
      setIsSuggestionLoading(false);
      setSuggestionFailed(false);
      return;
    }

    let active = true;
    setIsSuggestionLoading(true);
    setSuggestionFailed(false);
    const timer = setTimeout(() => {
      const findCandidates =
        kind === "brand" ? findBrandCandidates(value.trim()) : findMerchantCandidates(value.trim());

      void findCandidates
        .then((candidates) => {
          if (!active) return;
          const selectedKeys = new Set(selected.map((item) => normalizeIdentityInput(item.name)));
          const next = candidates
            .map(identityCandidateEntity)
            .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
            .filter((entity) => !selectedKeys.has(normalizeIdentityInput(entity.name)))
            .map((entity) => ({ id: entity.id, name: entity.name }))
            .filter(
              (identity, index, identities) =>
                identities.findIndex(
                  (item) =>
                    normalizeIdentityInput(item.name) === normalizeIdentityInput(identity.name)
                ) === index
            )
            .slice(0, 4);
          setSuggestions(next);
          setSuggestionFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setSuggestions([]);
          setSuggestionFailed(true);
        })
        .finally(() => {
          if (active) setIsSuggestionLoading(false);
        });
    }, 160);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [duplicateInput, kind, normalizedValue, selected, value]);

  const commit = async () => {
    const next = value.trim();
    if (!next || duplicateInput || isCommitting) return;
    setIsCommitting(true);
    try {
      await onCommit(next);
      setValue("");
      setSuggestions([]);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <View style={styles.identityInputBlock}>
      <ShoplyText variant="caption" color="textMuted">
        {label} · {selected.length}/{identitySelectionLimit}
      </ShoplyText>
      {selected.length > 0 ? (
        <View style={styles.chipWrap}>
          {selected.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} ${kind === "brand" ? "브랜드" : "구매처"} 삭제`}
              onPress={() => onRemove(item.id)}
              style={[
                styles.identitySelectedChip,
                {
                  backgroundColor: theme.semantic.color.surface,
                  borderColor: theme.semantic.color.border
                }
              ]}
            >
              <ShoplyText variant="labelMd">{item.name}</ShoplyText>
              <ShoplyText variant="labelMd" color="textMuted">
                ×
              </ShoplyText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selected.length < identitySelectionLimit ? (
        <View style={styles.identityInputRow}>
          <View style={styles.identityInputField}>
            <Field
              value={value}
              onChangeText={setValue}
              onSubmitEditing={() => void commit()}
              returnKeyType="done"
              placeholder={placeholder}
              focusScale={false}
            />
          </View>
          <Button
            label="추가"
            variant="tertiary"
            loading={isCommitting}
            disabled={!normalizedValue || duplicateInput || isSuggestionLoading}
            onPress={() => void commit()}
          />
        </View>
      ) : (
        <ShoplyText variant="caption" color="textMuted">
          최대 5개까지 등록할 수 있어요.
        </ShoplyText>
      )}
      {normalizedValue && duplicateInput ? (
        <ShoplyText variant="caption" color="textMuted">
          이미 추가한 {label}이에요.
        </ShoplyText>
      ) : normalizedValue && isSuggestionLoading ? (
        <View style={styles.identitySuggestionStatus}>
          <ActivityIndicator size="small" color={theme.semantic.color.primary} />
          <ShoplyText variant="caption" color="textMuted">
            등록된 {label}을 찾고 있어요
          </ShoplyText>
        </View>
      ) : normalizedValue && suggestions.length > 0 ? (
        <View style={styles.identitySuggestionBlock}>
          <ShoplyText variant="caption" color="textMuted">
            먼저 추천드려요
          </ShoplyText>
          <View style={styles.identitySuggestionWrap}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                accessibilityRole="button"
                accessibilityLabel={`${suggestion.name} ${label} 추천 추가`}
                onPress={() => {
                  setValue("");
                  setSuggestions([]);
                  onSelectSuggestion(suggestion);
                }}
                style={({ pressed }) => [
                  styles.identitySuggestionChip,
                  {
                    backgroundColor: theme.semantic.color.surfaceMuted,
                    borderColor: theme.semantic.color.border,
                    opacity: pressed ? 0.64 : 1
                  }
                ]}
              >
                <Plus size={14} color={theme.semantic.color.primary} />
                <ShoplyText variant="labelMd" numberOfLines={1}>
                  {suggestion.name}
                </ShoplyText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : normalizedValue && !isSuggestionLoading ? (
        <ShoplyText variant="caption" color="textMuted">
          {suggestionFailed
            ? `추천을 불러오지 못했어요. 입력한 ${label}을 바로 추가할 수 있어요.`
            : `등록된 추천이 없으면 입력한 ${label}을 바로 추가할 수 있어요.`}
        </ShoplyText>
      ) : null}
    </View>
  );
}

function DetailsStep({
  control,
  errors,
  selectedBrands,
  selectedMerchantSites,
  onRemoveIdentity,
  onCommitIdentity,
  onSelectIdentitySuggestion,
  categoryOptions,
  categoryId,
  setCategoryId,
  disclosure,
  setDisclosure
}: {
  control: Control<ReviewDetailsFormValues>;
  errors: FieldErrors<ReviewDetailsFormValues>;
  selectedBrands: SelectedIdentity[];
  selectedMerchantSites: SelectedIdentity[];
  onRemoveIdentity: (kind: IdentityKind, id: string) => void;
  onCommitIdentity: (kind: IdentityKind, value: string) => void | Promise<void>;
  onSelectIdentitySuggestion: (kind: IdentityKind, identity: SelectedIdentity) => void;
  categoryOptions: CategoryOption[];
  categoryId: string | null;
  setCategoryId: (value: string) => void;
  disclosure: ReviewDisclosureValue;
  setDisclosure: (value: ReviewDisclosureValue) => void;
}) {
  const theme = useShoplyTheme();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [bodyGuideOpen, setBodyGuideOpen] = useState(false);
  const disclosureConfirmed = useWatch({ control, name: "disclosureConfirmed" });
  const selectedParentCategory =
    categoryOptions.find(
      (item) => item.id === categoryId || item.children?.some((child) => child.id === categoryId)
    ) ?? null;
  const childCategoryOptions = selectedParentCategory?.children ?? [];
  const selectedCategory =
    childCategoryOptions.find((item) => item.id === categoryId) ?? selectedParentCategory;
  const bodyPlaceholder = getReviewBodyPlaceholder(selectedCategory);
  const bodyGuides = getReviewBodyGuide(selectedCategory);
  const bodyKeywords = getReviewBodyKeywords(selectedCategory);
  const bodyExample = getReviewBodyExample(selectedCategory);
  const brandSummary = selectedBrands.map((item) => item.name).join(", ");
  const merchantSummary = selectedMerchantSites.map((item) => item.name).join(", ");
  const identityCount = selectedBrands.length + selectedMerchantSites.length;
  const identitySummary = [
    brandSummary ? `브랜드 ${brandSummary}` : null,
    merchantSummary ? `구매처 ${merchantSummary}` : null
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <View style={styles.stepContent}>
        <Animated.View entering={FadeInUp.delay(40).duration(220)} style={styles.requiredSection}>
          <View style={styles.requiredSectionHeader}>
            <View style={styles.requiredSectionCopy}>
              <ShoplyText variant="titleMd">리뷰 정보</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                상품 정보와 직접 사용한 경험을 순서대로 알려주세요.
              </ShoplyText>
            </View>
          </View>

          <View style={styles.requiredFieldBlock}>
            <View style={styles.fieldHeading}>
              <ShoplyText variant="labelMd">카테고리</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                필수
              </ShoplyText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selectedCategory
                  ? `카테고리 변경, 현재 ${selectedCategory.name}`
                  : "필수 카테고리 선택"
              }
              onPress={() => setCategoryOpen(true)}
              style={({ pressed }) => [
                styles.categoryTrigger,
                {
                  backgroundColor: pressed
                    ? theme.semantic.color.primarySoft
                    : selectedCategory
                      ? theme.semantic.color.primarySoft
                      : theme.semantic.color.surfaceMuted,
                  borderColor: errors.categoryId ? theme.semantic.color.danger : "transparent"
                }
              ]}
            >
              <View style={styles.categoryTriggerCopy}>
                <ShoplyText
                  variant="bodyMd"
                  color={selectedCategory ? "text" : "textMuted"}
                  numberOfLines={1}
                >
                  {selectedCategory?.name ?? "카테고리를 선택해주세요"}
                </ShoplyText>
                {selectedCategory ? (
                  <ShoplyText variant="caption" color="textMuted">
                    눌러서 변경할 수 있어요
                  </ShoplyText>
                ) : null}
              </View>
              <ChevronRight
                size={20}
                color={
                  selectedCategory ? theme.semantic.color.primary : theme.semantic.color.textMuted
                }
              />
            </Pressable>
            {errors.categoryId?.message ? <FieldError message={errors.categoryId.message} /> : null}
          </View>

          <View style={styles.requiredFieldBlock}>
            <View style={styles.fieldHeading}>
              <ShoplyText variant="labelMd">브랜드 · 구매처</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                선택
              </ShoplyText>
            </View>
            <ShoplyText variant="caption" color="textMuted">
              선택 항목까지 작성하면 검색과 추천에서 노출될 가능성이 높아져요.
            </ShoplyText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                identitySummary
                  ? `브랜드와 구매처 변경, 현재 ${identitySummary}`
                  : "브랜드와 구매처 추가"
              }
              onPress={() => setIdentityOpen(true)}
              style={({ pressed }) => [
                styles.identityTrigger,
                {
                  backgroundColor: pressed
                    ? theme.semantic.color.primarySoft
                    : theme.semantic.color.surfaceMuted
                }
              ]}
            >
              <View style={styles.identityTriggerCopy}>
                <ShoplyText variant="labelMd">
                  {identityCount
                    ? `브랜드 · 구매처 ${identityCount}개 선택`
                    : "브랜드 · 구매처 추가"}
                </ShoplyText>
                <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
                  {identitySummary || "한 번에 찾아서 선택할 수 있어요"}
                </ShoplyText>
              </View>
              <ChevronRight
                size={20}
                color={
                  identityCount ? theme.semantic.color.primary : theme.semantic.color.textMuted
                }
              />
            </Pressable>
          </View>

          <View style={styles.requiredFieldBlock}>
            <View style={styles.fieldHeading}>
              <ShoplyText variant="labelMd">리뷰 제목</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                필수
              </ShoplyText>
            </View>
            <Controller
              control={control}
              name="title"
              render={({ field: { value, onChange, onBlur } }) => (
                <Field
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="리뷰 제목을 입력해주세요"
                  error={errors.title?.message}
                />
              )}
            />
          </View>

          <View style={styles.requiredFieldBlock}>
            <View style={styles.fieldHeading}>
              <ShoplyText variant="labelMd">리뷰 본문</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                필수
              </ShoplyText>
            </View>
            <View
              style={[
                styles.bodyPromptCard,
                {
                  backgroundColor: theme.semantic.color.surfaceMuted,
                  borderColor: theme.semantic.color.border
                }
              ]}
            >
              <View style={styles.bodyPromptHeader}>
                <ShoplyText variant="labelMd">이 키워드를 포함해보세요</ShoplyText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="리뷰 본문 작성 예시 보기"
                  hitSlop={6}
                  onPress={() => setBodyGuideOpen(true)}
                  style={({ pressed }) => [styles.bodyExampleLink, { opacity: pressed ? 0.58 : 1 }]}
                >
                  <ShoplyText variant="labelMd" style={{ color: theme.semantic.color.primary }}>
                    작성 예시 보기
                  </ShoplyText>
                  <ChevronRight size={16} color={theme.semantic.color.primary} />
                </Pressable>
              </View>
              <View style={styles.bodyKeywordWrap}>
                {bodyKeywords.map((keyword) => (
                  <View
                    key={keyword}
                    style={[
                      styles.bodyKeyword,
                      {
                        backgroundColor: theme.semantic.color.surface,
                        borderColor: theme.semantic.color.border
                      }
                    ]}
                  >
                    <View
                      style={[
                        styles.bodyKeywordDot,
                        { backgroundColor: theme.semantic.color.primary }
                      ]}
                    />
                    <ShoplyText variant="caption">{keyword}</ShoplyText>
                  </View>
                ))}
              </View>
            </View>
            <Controller
              control={control}
              name="body"
              render={({ field: { value, onChange, onBlur } }) => (
                <Field
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder={bodyPlaceholder}
                  multiline
                  error={errors.body?.message}
                />
              )}
            />
          </View>

          <View style={styles.requiredFieldBlock}>
            <View style={styles.fieldHeading}>
              <ShoplyText variant="labelMd">구매금액</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                필수
              </ShoplyText>
            </View>
            <Controller
              control={control}
              name="purchasePrice"
              render={({ field: { value, onChange, onBlur } }) => (
                <Field
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="대략적인 금액을 입력해주세요"
                  keyboardType="number-pad"
                  error={errors.purchasePrice?.message}
                />
              )}
            />
          </View>

          <View style={styles.requiredFieldBlock}>
            <View style={styles.fieldHeading}>
              <ShoplyText variant="labelMd">광고·협찬 여부</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                필수
              </ShoplyText>
            </View>
            <ShoplyText variant="caption" color="textMuted">
              해당 없음도 직접 선택해주세요. 선택한 표기는 리뷰에 명확히 표시돼요.
            </ShoplyText>
            <View style={styles.chipWrap}>
              {disclosureOptions.map((item) => (
                <Chip
                  key={item.label}
                  label={item.label}
                  selected={disclosureConfirmed && disclosure === item.value}
                  onPress={() => setDisclosure(item.value)}
                />
              ))}
            </View>
            {errors.disclosureConfirmed?.message ? (
              <FieldError message={errors.disclosureConfirmed.message} />
            ) : null}
          </View>
        </Animated.View>
      </View>

      <Modal
        visible={categoryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryOpen(false)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setCategoryOpen(false)} />
          <View
            style={[
              styles.categorySheet,
              { backgroundColor: theme.semantic.color.surface },
              theme.semantic.shadow.overlay
            ]}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: theme.semantic.color.borderStrong }]}
            />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <ShoplyText variant="titleMd">카테고리 선택</ShoplyText>
                <ShoplyText variant="caption" color="textMuted">
                  리뷰한 상품과 가장 가까운 카테고리를 선택해주세요.
                </ShoplyText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="카테고리 선택 닫기"
                onPress={() => setCategoryOpen(false)}
                style={({ pressed }) => [
                  styles.sheetCloseButton,
                  {
                    backgroundColor: theme.semantic.color.surfaceMuted,
                    opacity: pressed ? 0.64 : 1
                  }
                ]}
              >
                <X size={19} color={theme.semantic.color.text} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categorySheetContent}
            >
              <ShoplyText variant="labelMd">대분류</ShoplyText>
              {categoryOptions.length ? (
                <View style={styles.chipWrap}>
                  {categoryOptions.map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      selected={selectedParentCategory?.id === item.id}
                      style={styles.categoryChoice}
                      onPress={() => {
                        setCategoryId(item.id);
                        if (!item.children?.length) setCategoryOpen(false);
                        void Haptics.selectionAsync();
                      }}
                    />
                  ))}
                </View>
              ) : (
                <ShoplyText variant="bodyMd" color="textMuted">
                  카테고리를 불러오고 있어요.
                </ShoplyText>
              )}

              {childCategoryOptions.length ? (
                <>
                  <ShoplyText variant="labelMd">세부 카테고리</ShoplyText>
                  <View style={styles.chipWrap}>
                    <Chip
                      label="전체"
                      selected={categoryId === selectedParentCategory?.id}
                      style={styles.categoryChoice}
                      onPress={() => {
                        if (selectedParentCategory) {
                          setCategoryId(selectedParentCategory.id);
                          setCategoryOpen(false);
                          void Haptics.selectionAsync();
                        }
                      }}
                    />
                    {childCategoryOptions.map((item) => (
                      <Chip
                        key={item.id}
                        label={item.name}
                        selected={categoryId === item.id}
                        style={styles.categoryChoice}
                        onPress={() => {
                          setCategoryId(item.id);
                          setCategoryOpen(false);
                          void Haptics.selectionAsync();
                        }}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <KeyboardAwareBottomSheet
        visible={identityOpen}
        accessibilityLabel="브랜드와 구매처 입력 닫기"
        onClose={() => setIdentityOpen(false)}
        contentStyle={[
          styles.detailsMetaSheet,
          { backgroundColor: theme.semantic.color.surface },
          theme.semantic.shadow.overlay
        ]}
      >
        <View
          style={[styles.sheetHandle, { backgroundColor: theme.semantic.color.borderStrong }]}
        />
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ShoplyText variant="titleMd">브랜드 · 구매처</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              상품을 더 정확히 찾을 수 있도록 알고 있는 정보를 적어주세요.
            </ShoplyText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="브랜드와 구매처 입력 닫기"
            onPress={() => setIdentityOpen(false)}
            style={({ pressed }) => [
              styles.sheetCloseButton,
              {
                backgroundColor: theme.semantic.color.surfaceMuted,
                opacity: pressed ? 0.64 : 1
              }
            ]}
          >
            <X size={19} color={theme.semantic.color.text} />
          </Pressable>
        </View>
        <ScrollView
          bounces={false}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailsMetaContent}
        >
          <View style={[styles.identityTip, { backgroundColor: theme.semantic.color.primarySoft }]}>
            <ShoplyText variant="labelMd">추천을 먼저 확인해보세요</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              입력하면 등록된 항목을 바로 찾아드려요. 같은 항목이 없다면 입력한 이름으로 추가하면
              돼요.
            </ShoplyText>
          </View>
          <MultiIdentityInput
            kind="brand"
            label="브랜드"
            placeholder="브랜드명을 입력해주세요"
            selected={selectedBrands}
            onRemove={(id) => onRemoveIdentity("brand", id)}
            onCommit={(value) => onCommitIdentity("brand", value)}
            onSelectSuggestion={(identity) => onSelectIdentitySuggestion("brand", identity)}
          />
          <MultiIdentityInput
            kind="merchant"
            label="구매처"
            placeholder="구매한 스토어나 사이트를 입력해주세요"
            selected={selectedMerchantSites}
            onRemove={(id) => onRemoveIdentity("merchant", id)}
            onCommit={(value) => onCommitIdentity("merchant", value)}
            onSelectSuggestion={(identity) => onSelectIdentitySuggestion("merchant", identity)}
          />
        </ScrollView>
      </KeyboardAwareBottomSheet>

      <Modal
        visible={bodyGuideOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBodyGuideOpen(false)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setBodyGuideOpen(false)} />
          <View
            style={[
              styles.bodyGuideSheet,
              { backgroundColor: theme.semantic.color.surface },
              theme.semantic.shadow.overlay
            ]}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: theme.semantic.color.borderStrong }]}
            />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <ShoplyText variant="titleMd">리뷰 본문 작성 가이드</ShoplyText>
                <ShoplyText variant="caption" color="textMuted">
                  핵심 키워드와 가이드를 따를수록 노출 가능성이 높아져요.
                </ShoplyText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="리뷰 본문 작성 가이드 닫기"
                onPress={() => setBodyGuideOpen(false)}
                style={({ pressed }) => [
                  styles.sheetCloseButton,
                  {
                    backgroundColor: theme.semantic.color.surfaceMuted,
                    opacity: pressed ? 0.64 : 1
                  }
                ]}
              >
                <X size={19} color={theme.semantic.color.text} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.bodyGuideSheetContent}
            >
              <View style={styles.bodyGuideSection}>
                <ShoplyText variant="labelMd">핵심 키워드</ShoplyText>
                <View style={styles.bodyKeywordWrap}>
                  {bodyKeywords.map((keyword) => (
                    <View
                      key={keyword}
                      style={[
                        styles.bodyKeyword,
                        {
                          backgroundColor: theme.semantic.color.surfaceMuted,
                          borderColor: theme.semantic.color.border
                        }
                      ]}
                    >
                      <View
                        style={[
                          styles.bodyKeywordDot,
                          { backgroundColor: theme.semantic.color.primary }
                        ]}
                      />
                      <ShoplyText variant="caption">{keyword}</ShoplyText>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.bodyGuideSection}>
                <ShoplyText variant="labelMd">이 순서로 적어보세요</ShoplyText>
                <View style={styles.bodyGuideList}>
                  {bodyGuides.map((guide, index) => (
                    <View key={guide} style={styles.bodyGuideItem}>
                      <View
                        style={[
                          styles.bodyGuideNumber,
                          { backgroundColor: theme.semantic.color.primarySoft }
                        ]}
                      >
                        <ShoplyText
                          variant="caption"
                          style={{ color: theme.semantic.color.primary }}
                        >
                          {index + 1}
                        </ShoplyText>
                      </View>
                      <ShoplyText variant="bodyMd" style={styles.bodyGuideText}>
                        {guide}
                      </ShoplyText>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.bodyGuideSection}>
                <ShoplyText variant="labelMd">작성 예시</ShoplyText>
                <View
                  style={[
                    styles.bodyExampleCard,
                    { backgroundColor: theme.semantic.color.surfaceMuted }
                  ]}
                >
                  <ShoplyText variant="bodyMd">{bodyExample}</ShoplyText>
                </View>
                <ShoplyText variant="caption" color="textMuted">
                  예시는 문장 흐름만 참고하고, 실제 사용 경험에 맞게 작성해주세요.
                </ShoplyText>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FieldError({ message }: { message: string }) {
  const theme = useShoplyTheme();

  return (
    <ShoplyText
      variant="caption"
      style={[styles.fieldError, { color: theme.semantic.color.danger }]}
    >
      {message}
    </ShoplyText>
  );
}

function PostPublishPurchaseProofSheet({
  visible,
  bottomInset,
  submitting,
  onSubmit,
  onSkip
}: {
  visible: boolean;
  bottomInset: number;
  submitting: boolean;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const theme = useShoplyTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="구매인증 건너뛰기"
          disabled={submitting}
          style={styles.sheetBackdrop}
          onPress={onSkip}
        />
        <View
          style={[
            styles.postPublishProofSheet,
            {
              backgroundColor: theme.semantic.color.surface,
              paddingBottom: Math.max(bottomInset + 16, 24)
            },
            theme.semantic.shadow.overlay
          ]}
        >
          <View
            style={[styles.sheetHandle, { backgroundColor: theme.semantic.color.borderStrong }]}
          />
          <View
            style={[styles.proofSheetIcon, { backgroundColor: theme.semantic.color.surfaceMuted }]}
          >
            <Check size={22} color={theme.semantic.color.primary} strokeWidth={2.5} />
          </View>
          <View style={styles.proofSheetCopy}>
            <ShoplyText variant="titleMd">게시 요청을 보냈어요</ShoplyText>
            <ShoplyText variant="bodyMd" color="textMuted">
              구매내역을 올리면 확인 뒤 구매인증을 표시해요.
            </ShoplyText>
          </View>
          <View style={styles.footerActions}>
            <Button
              label="건너뛰기"
              variant="secondary"
              disabled={submitting}
              onPress={onSkip}
              style={{ flex: 1 }}
            />
            <Button
              label="구매인증 추가"
              size="lg"
              loading={submitting}
              icon={<Images size={17} color={theme.component.button.primary.text} />}
              onPress={onSubmit}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  error,
  focusScale = true,
  ...props
}: TextInputProps & { error?: string; focusScale?: boolean }) {
  const theme = useShoplyTheme();
  const [focused, setFocused] = useState(false);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused && focusScale ? 1.012 : 1, {
      damping: 14,
      stiffness: 240
    });
  }, [focusScale, focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <View style={styles.fieldBlock}>
      <Animated.View
        style={[
          styles.field,
          {
            backgroundColor: theme.component.input.background,
            borderColor: error
              ? theme.semantic.color.danger
              : focused
                ? theme.semantic.color.primary
                : theme.component.input.border
          },
          animatedStyle
        ]}
      >
        <TextInput
          {...props}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          placeholderTextColor={theme.component.input.placeholder}
          style={[
            styles.input,
            {
              color: theme.component.input.text,
              minHeight: props.multiline ? 132 : 44
            }
          ]}
        />
      </Animated.View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mediaEditorScreen: {
    flex: 1
  },
  mediaStage: {
    backgroundColor: "#050507",
    flex: 1
  },
  mediaHeader: {
    alignItems: "center",
    backgroundColor: "#050507",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    paddingHorizontal: 14,
    zIndex: 20
  },
  mediaTopNextButton: {
    backgroundColor: "rgba(98, 102, 241, 0.94)",
    minHeight: 34,
    minWidth: 58,
    paddingHorizontal: 8
  },
  mediaBackButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  mediaCanvasSlot: {
    alignItems: "center",
    backgroundColor: "#050507",
    flex: 1,
    justifyContent: "center",
    minHeight: 0,
    overflow: "hidden",
    paddingVertical: 8
  },
  mediaCanvasFrame: {
    backgroundColor: "#050507",
    overflow: "hidden"
  },
  mediaCanvasFrameFallback: {
    aspectRatio: captureCanvasSize.width / captureCanvasSize.height,
    width: "100%"
  },
  editorVideoMuteButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.58)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    position: "absolute",
    right: 12,
    top: 12
  },
  mediaBottomOverlay: {
    backgroundColor: "#050507",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 4
  },
  cameraFallback: {
    alignItems: "center",
    backgroundColor: "#050507",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28
  },
  cameraFallbackText: {
    alignItems: "center",
    gap: 6,
    maxWidth: 280
  },
  cameraPermissionPending: {
    backgroundColor: "#050507",
    flex: 1
  },
  captureControlsWrap: {
    gap: 4
  },
  captureModeSwitch: {
    alignSelf: "center",
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  captureModeButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    minWidth: 54,
    paddingHorizontal: 12
  },
  captureModeButtonSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.92)"
  },
  captureModeButtonDisabled: {
    opacity: 0.56
  },
  captureModeButtonTextSelected: {
    color: "#101318"
  },
  captureControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 66,
    paddingHorizontal: 16
  },
  galleryControl: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    height: 36,
    justifyContent: "center",
    minWidth: 76,
    paddingHorizontal: 14
  },
  captureButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 999,
    borderWidth: 4,
    height: 60,
    justifyContent: "center",
    width: 60
  },
  captureButtonDisabled: {
    opacity: 0.48
  },
  captureButtonRecording: {
    borderColor: "#FF5F57"
  },
  captureButtonInner: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 999,
    height: 44,
    width: 44
  },
  captureButtonInnerVideo: {
    backgroundColor: "#FF5F57"
  },
  captureButtonInnerRecording: {
    borderRadius: 12,
    height: 28,
    width: 28
  },
  plusControl: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  overlayIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.34)",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  mediaRail: {
    borderRadius: 16,
    gap: 5,
    overflow: "hidden",
    padding: 7
  },
  mediaRailHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  mediaStepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  mediaRailActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  mediaThumbList: {
    gap: 8,
    paddingRight: 2
  },
  mediaThumb: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    borderWidth: 2,
    height: 46,
    overflow: "hidden",
    width: 38
  },
  videoThumb: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    flex: 1,
    justifyContent: "center"
  },
  transformCaptureHost: {
    height: captureCanvasSize.height,
    left: -2400,
    position: "absolute",
    top: captureCanvasSize.height + 24,
    width: captureCanvasSize.width
  },
  transformCaptureCanvas: {
    backgroundColor: "#050507",
    borderRadius: 0,
    height: captureCanvasSize.height,
    overflow: "hidden",
    width: captureCanvasSize.width
  },
  captureVisualSticker: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    position: "absolute"
  },
  captureTextSticker: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 4,
    position: "absolute",
    overflow: "visible"
  },
  captureTextStickerLabel: {
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.48)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  captureImageSticker: {
    borderRadius: 10,
    overflow: "hidden"
  },
  captureImageStickerAsset: {
    height: "100%",
    width: "100%"
  },
  captureEmojiStickerLabel: {
    textAlign: "center"
  },
  captureArtworkSticker: {
    height: "100%",
    overflow: "visible",
    width: "100%"
  },
  stickerTray: {
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 8
  },
  stickerTrayHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 6
  },
  stickerTrayContent: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10
  },
  stickerTrayItem: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    height: 64,
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: 8
  },
  stickerTrayToolItem: {
    height: 58,
    minWidth: 64,
    width: 64
  },
  stickerTrayIcon: {
    alignItems: "center",
    justifyContent: "center"
  },
  stickerTrayItemLabel: {
    color: "white",
    maxWidth: 72,
    textAlign: "center"
  },
  stickerTrayArtwork: {
    height: 52,
    overflow: "visible",
    width: 78
  },
  stickerTrayAsset: {
    height: "100%",
    width: "100%"
  },
  stickerTrayAssetWrap: {
    height: 52,
    overflow: "visible",
    width: 78
  },
  stickerTrayAssetLabel: {
    backgroundColor: "rgba(5, 5, 7, 0.46)",
    borderRadius: 999,
    color: "#FFFFFF",
    fontWeight: "800",
    maxWidth: 64,
    minWidth: 28,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0, 0, 0, 0.34)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  presetArtwork: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "visible"
  },
  presetArtworkLabelOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 5,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2
  },
  presetArrow: {
    backgroundColor: "#2563EB",
    borderBottomRightRadius: 18,
    borderRadius: 10,
    transform: [{ skewX: "-8deg" }]
  },
  presetBag: {
    backgroundColor: "#101318",
    borderRadius: 12
  },
  presetBurst: {
    backgroundColor: "#F97316",
    borderRadius: 18,
    transform: [{ rotate: "-4deg" }]
  },
  presetChrome: {
    backgroundColor: "#F8FAFC",
    borderColor: "#D8DEFF",
    borderRadius: 999
  },
  stickerInspector: {
    borderRadius: 16,
    gap: 8,
    padding: 9
  },
  stickerInspectorHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  overlayText: {
    color: "white"
  },
  overlayMutedText: {
    color: "white",
    opacity: 0.82
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  sheetBackdrop: {
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  linkSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 12,
    maxHeight: "90%",
    padding: 16,
    paddingTop: 10
  },
  linkSheetContent: {
    gap: 12,
    paddingBottom: 2
  },
  sheetHandle: {
    alignSelf: "center",
    borderRadius: 999,
    height: 4,
    marginBottom: 4,
    width: 42
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  textControlPanel: {
    gap: 12
  },
  textControlHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  textControlPreview: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.72)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 54,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 10
  },
  textSizeControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  textSizeButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  textSizeValueBox: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    height: 44,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: 8
  },
  textSizeInput: {
    fontSize: 14,
    fontWeight: "700",
    includeFontPadding: false,
    minWidth: 28,
    padding: 0,
    textAlign: "right"
  },
  paletteTrigger: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12
  },
  palettePreview: {
    borderColor: "rgba(17, 23, 34, 0.18)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    width: 24
  },
  textColorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  textColorSwatch: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 122
  },
  detailsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  detailsBackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  detailsHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  stepContent: {
    gap: 14
  },
  requiredSection: {
    gap: 16
  },
  requiredSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  requiredSectionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  requiredProgress: {
    alignItems: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: 10
  },
  requiredFieldBlock: {
    gap: 8
  },
  fieldHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  categoryTrigger: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  categoryTriggerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  inlinePrompt: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2
  },
  inlinePromptDot: {
    borderRadius: 999,
    height: 6,
    marginTop: 6,
    width: 6
  },
  inlinePromptText: {
    flex: 1
  },
  identityTrigger: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  identityTriggerCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  bodyPromptCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    gap: 10,
    padding: 14
  },
  bodyPromptHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  bodyKeywordWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  bodyKeyword: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  bodyKeywordDot: {
    borderRadius: 999,
    height: 5,
    width: 5
  },
  bodyExampleLink: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 32
  },
  metadataTrigger: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  metadataTriggerCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  detailsMetaSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    maxHeight: "84%",
    padding: 16,
    paddingBottom: 28,
    paddingTop: 10
  },
  categorySheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    maxHeight: "72%",
    padding: 16,
    paddingBottom: 28,
    paddingTop: 10
  },
  categorySheetContent: {
    gap: 14,
    paddingBottom: 18
  },
  categoryChoice: {
    borderWidth: 0,
    minHeight: 44,
    paddingHorizontal: 17
  },
  sheetCloseButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  detailsMetaContent: {
    gap: 12,
    paddingBottom: 18
  },
  bodyGuideSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    maxHeight: "82%",
    padding: 16,
    paddingBottom: 28,
    paddingTop: 10
  },
  bodyGuideSheetContent: {
    gap: 22,
    paddingBottom: 18
  },
  bodyGuideSection: {
    gap: 10
  },
  bodyGuideNumber: {
    alignItems: "center",
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  bodyExampleCard: {
    borderRadius: 16,
    padding: 16
  },
  fieldBlock: {
    gap: 5
  },
  fieldError: {
    marginLeft: 4
  },
  field: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  bodyGuide: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 12
  },
  bodyGuideHeader: {
    gap: 2
  },
  bodyGuideList: {
    gap: 7
  },
  bodyGuideItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8
  },
  bodyGuideDot: {
    borderRadius: 999,
    height: 5,
    marginTop: 7,
    width: 5
  },
  bodyGuideText: {
    flex: 1
  },
  identityInputBlock: {
    gap: 8
  },
  identityInputRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8
  },
  identityInputField: {
    flex: 1,
    minWidth: 0
  },
  identitySelectedChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12
  },
  identitySuggestionBlock: {
    gap: 6
  },
  identitySuggestionStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 4
  },
  identitySuggestionWrap: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  identitySuggestionChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 11
  },
  identityTip: {
    borderRadius: 14,
    gap: 4,
    padding: 13
  },
  linkList: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8
  },
  linkPill: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    maxWidth: 140,
    minHeight: 32,
    paddingHorizontal: 12
  },
  linkPillText: {
    maxWidth: 116
  },
  readyLine: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6
  },
  postPublishProofSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 14,
    maxHeight: "86%",
    padding: 16,
    paddingTop: 10
  },
  proofSheetIcon: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  proofSheetCopy: {
    gap: 6
  },
  footerActions: {
    flexDirection: "row",
    gap: 10
  }
});
