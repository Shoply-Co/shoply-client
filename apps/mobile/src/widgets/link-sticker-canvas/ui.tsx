import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Image as ImageIcon, Link, Move, Play, ShoppingBag } from "lucide-react-native";
import { useEffect, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { getStickerArtworkGeometry } from "@/entities/review";
import { DraftDirectPurchaseLink } from "@/features/review-create";

type StickerArtworkVariant = Exclude<
  NonNullable<DraftDirectPurchaseLink["visualVariant"]>,
  "pill" | "emoji"
>;

export interface MediaCanvasTransform {
  scale: number;
  translateXRatio: number;
  translateYRatio: number;
}

interface LinkStickerCanvasProps {
  stickers: DraftDirectPurchaseLink[];
  selectedStickerId: string | null;
  mediaUri?: string | null;
  mediaType?: "image" | "video";
  mediaMuted?: boolean;
  mediaTransform?: MediaCanvasTransform;
  mediaTransformEnabled?: boolean;
  fill?: boolean;
  onSelectSticker: (id: string) => void;
  onEditSticker?: (id: string) => void;
  onChangeSticker?: (id: string, patch: Partial<DraftDirectPurchaseLink>) => void;
  onChangeMediaTransform?: (patch: MediaCanvasTransform) => void;
  onSwipeMedia?: (direction: -1 | 1) => void;
}

interface CanvasSize {
  width: number;
  height: number;
}

const mediaScaleRange = {
  min: 1,
  max: 3
} as const;
const mediaScaleSettleThreshold = 1.01;
const mediaSwipeDistance = 48;
const mediaSwipeVelocity = 520;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function ratio(value: number, basis: number) {
  "worklet";
  if (basis <= 0) return 0;
  return Math.min(1, Math.max(0, Number((value / basis).toFixed(3))));
}

function signedRatio(value: number, basis: number) {
  "worklet";
  if (basis <= 0) return 0;
  return Math.min(1, Math.max(-1, Number((value / basis).toFixed(3))));
}

function rounded(value: number) {
  "worklet";
  return Number(value.toFixed(3));
}

function stickerOriginFromCenter(centerRatio: number, canvasLength: number, stickerLength: number) {
  "worklet";
  const maxOffset = Math.max(0, canvasLength - stickerLength);
  return clamp(centerRatio * canvasLength - stickerLength / 2, 0, maxOffset);
}

function stickerCenterRatio(offset: number, stickerLength: number, canvasLength: number) {
  "worklet";
  return ratio(offset + stickerLength / 2, canvasLength);
}

function mediaMaxTranslate(canvasLength: number, scale: number) {
  "worklet";
  if (canvasLength <= 0 || scale <= mediaScaleSettleThreshold) return 0;
  return (canvasLength * (scale - 1)) / 2;
}

function clampMediaTranslate(value: number, canvasLength: number, scale: number) {
  "worklet";
  const maxTranslate = mediaMaxTranslate(canvasLength, scale);
  return clamp(value, -maxTranslate, maxTranslate);
}

function settledMediaScale(scale: number) {
  "worklet";
  return scale <= mediaScaleSettleThreshold
    ? 1
    : clamp(scale, mediaScaleRange.min, mediaScaleRange.max);
}

export function LinkStickerCanvas({
  stickers,
  selectedStickerId,
  mediaUri,
  mediaType = "image",
  mediaMuted = true,
  mediaTransform,
  mediaTransformEnabled = true,
  fill = false,
  onSelectSticker,
  onEditSticker,
  onChangeSticker,
  onChangeMediaTransform,
  onSwipeMedia
}: LinkStickerCanvasProps) {
  const theme = useShoplyTheme();
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const mediaScale = useSharedValue(mediaTransform?.scale ?? 1);
  const mediaStartScale = useSharedValue(mediaTransform?.scale ?? 1);
  const mediaTranslateX = useSharedValue(0);
  const mediaTranslateY = useSharedValue(0);
  const mediaStartX = useSharedValue(0);
  const mediaStartY = useSharedValue(0);
  const canTransformMedia = mediaTransformEnabled && mediaType === "image";

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  useEffect(() => {
    const nextScale = canTransformMedia ? settledMediaScale(mediaTransform?.scale ?? 1) : 1;
    mediaScale.value = nextScale;
    mediaStartScale.value = nextScale;
    mediaTranslateX.value = clampMediaTranslate(
      (canTransformMedia ? (mediaTransform?.translateXRatio ?? 0) : 0) * canvasSize.width,
      canvasSize.width,
      nextScale
    );
    mediaTranslateY.value = clampMediaTranslate(
      (canTransformMedia ? (mediaTransform?.translateYRatio ?? 0) : 0) * canvasSize.height,
      canvasSize.height,
      nextScale
    );
  }, [
    canTransformMedia,
    canvasSize.height,
    canvasSize.width,
    mediaScale,
    mediaStartScale,
    mediaTransform?.scale,
    mediaTransform?.translateXRatio,
    mediaTransform?.translateYRatio,
    mediaTranslateX,
    mediaTranslateY,
    mediaUri
  ]);

  const mediaPinch = Gesture.Pinch()
    .enabled(Boolean(mediaUri) && canTransformMedia)
    .onStart(() => {
      mediaStartScale.value = mediaScale.value;
    })
    .onUpdate((event) => {
      const nextScale = clamp(
        mediaStartScale.value * event.scale,
        mediaScaleRange.min,
        mediaScaleRange.max
      );
      mediaScale.value = nextScale;
      mediaTranslateX.value = clampMediaTranslate(
        mediaTranslateX.value,
        canvasSize.width,
        nextScale
      );
      mediaTranslateY.value = clampMediaTranslate(
        mediaTranslateY.value,
        canvasSize.height,
        nextScale
      );
    })
    .onEnd(() => {
      const nextScale = settledMediaScale(mediaScale.value);
      const nextTranslateX = clampMediaTranslate(
        mediaTranslateX.value,
        canvasSize.width,
        nextScale
      );
      const nextTranslateY = clampMediaTranslate(
        mediaTranslateY.value,
        canvasSize.height,
        nextScale
      );
      mediaScale.value = withTiming(nextScale, { duration: 80 });
      mediaTranslateX.value = withTiming(nextTranslateX, { duration: 80 });
      mediaTranslateY.value = withTiming(nextTranslateY, { duration: 80 });
      if (!onChangeMediaTransform || canvasSize.width <= 0 || canvasSize.height <= 0) return;
      runOnJS(onChangeMediaTransform)({
        scale: rounded(nextScale),
        translateXRatio: signedRatio(nextTranslateX, canvasSize.width),
        translateYRatio: signedRatio(nextTranslateY, canvasSize.height)
      });
    });

  const mediaPan = Gesture.Pan()
    .enabled(Boolean(mediaUri))
    .onStart(() => {
      mediaStartX.value = mediaTranslateX.value;
      mediaStartY.value = mediaTranslateY.value;
    })
    .onUpdate((event) => {
      if (!canTransformMedia || mediaScale.value <= mediaScaleSettleThreshold) {
        mediaTranslateX.value = 0;
        mediaTranslateY.value = 0;
        return;
      }
      mediaTranslateX.value = clamp(
        mediaStartX.value + event.translationX,
        -mediaMaxTranslate(canvasSize.width, mediaScale.value),
        mediaMaxTranslate(canvasSize.width, mediaScale.value)
      );
      mediaTranslateY.value = clamp(
        mediaStartY.value + event.translationY,
        -mediaMaxTranslate(canvasSize.height, mediaScale.value),
        mediaMaxTranslate(canvasSize.height, mediaScale.value)
      );
    })
    .onEnd((event) => {
      if (
        onSwipeMedia &&
        (!canTransformMedia || mediaScale.value <= mediaScaleSettleThreshold) &&
        (Math.abs(event.translationX) >= mediaSwipeDistance ||
          Math.abs(event.velocityX) >= mediaSwipeVelocity)
      ) {
        runOnJS(onSwipeMedia)(event.translationX < 0 ? 1 : -1);
        return;
      }
      if (!canTransformMedia) return;
      const nextScale = settledMediaScale(mediaScale.value);
      const nextTranslateX = clampMediaTranslate(
        mediaTranslateX.value,
        canvasSize.width,
        nextScale
      );
      const nextTranslateY = clampMediaTranslate(
        mediaTranslateY.value,
        canvasSize.height,
        nextScale
      );
      mediaScale.value = withTiming(nextScale, { duration: 80 });
      mediaTranslateX.value = withTiming(nextTranslateX, { duration: 80 });
      mediaTranslateY.value = withTiming(nextTranslateY, { duration: 80 });
      if (!onChangeMediaTransform || canvasSize.width <= 0 || canvasSize.height <= 0) return;
      runOnJS(onChangeMediaTransform)({
        scale: rounded(nextScale),
        translateXRatio: signedRatio(nextTranslateX, canvasSize.width),
        translateYRatio: signedRatio(nextTranslateY, canvasSize.height)
      });
    });

  const mediaGesture = Gesture.Simultaneous(mediaPan, mediaPinch);
  const mediaAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mediaTranslateX.value },
      { translateY: mediaTranslateY.value },
      { scale: mediaScale.value }
    ]
  }));

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.canvas,
        fill ? styles.canvasFill : styles.canvasFrame,
        {
          backgroundColor: fill ? "#050507" : theme.semantic.color.surfaceMuted,
          borderColor: fill ? "transparent" : theme.semantic.color.border
        }
      ]}
    >
      {mediaUri ? (
        <GestureDetector gesture={mediaGesture}>
          <Animated.View style={[StyleSheet.absoluteFill, mediaAnimatedStyle]}>
            <MediaSurface uri={mediaUri} mediaType={mediaType} muted={mediaMuted} />
          </Animated.View>
        </GestureDetector>
      ) : (
        <View style={styles.emptyMedia}>
          <ImageIcon size={28} color={theme.semantic.color.primary} />
          <ShoplyText variant="caption" style={styles.emptyMediaText}>
            미디어를 선택하면 이 위에 스티커를 배치합니다.
          </ShoplyText>
        </View>
      )}
      <View style={[styles.scrim, { backgroundColor: theme.semantic.color.mediaScrim }]} />
      {fill ? null : (
        <View style={[styles.guide, { borderColor: theme.semantic.color.whiteStroke }]} />
      )}
      {stickers.map((sticker) => (
        <DraggableSticker
          key={sticker.id}
          sticker={sticker}
          selected={sticker.id === selectedStickerId}
          canvasSize={canvasSize}
          onSelectSticker={onSelectSticker}
          onEditSticker={onEditSticker}
          onChangeSticker={onChangeSticker}
        />
      ))}
      {fill ? null : (
        <View style={[styles.hint, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}>
          <Move size={13} color="white" />
          <ShoplyText variant="caption" style={styles.hintText}>
            드래그로 이동
          </ShoplyText>
        </View>
      )}
    </View>
  );
}

function MediaSurface({
  uri,
  mediaType,
  muted
}: {
  uri: string;
  mediaType: "image" | "video";
  muted: boolean;
}) {
  if (mediaType === "video") {
    return <VideoSurface uri={uri} muted={muted} />;
  }

  return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />;
}

function VideoSurface({ uri, muted }: { uri: string; muted: boolean }) {
  const player = useVideoPlayer(uri, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = muted;
    nextPlayer.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function DraggableSticker({
  sticker,
  selected,
  canvasSize,
  onSelectSticker,
  onEditSticker,
  onChangeSticker
}: {
  sticker: DraftDirectPurchaseLink;
  selected: boolean;
  canvasSize: CanvasSize;
  onSelectSticker: (id: string) => void;
  onEditSticker?: (id: string) => void;
  onChangeSticker?: (id: string, patch: Partial<DraftDirectPurchaseLink>) => void;
}) {
  const theme = useShoplyTheme();
  const isHotspot = sticker.stickerType === "hotspot_dot";
  const isFloatingText = sticker.stickerType === "text";
  const isButton = sticker.stickerType === "button";
  const isAsset = sticker.stickerType === "asset_cutout";
  const isEmoji = sticker.visualVariant === "emoji" || Boolean(sticker.emoji);
  const hasImageAsset = Boolean(sticker.assetUri);
  const isMedia =
    sticker.stickerType === "uploaded_image" || sticker.stickerType === "uploaded_video";
  const isPresetSticker = (isAsset || isButton || isFloatingText) && !sticker.assetUri && !isEmoji;
  const isArtSticker =
    !isFloatingText &&
    isPresetSticker &&
    Boolean(sticker.visualVariant) &&
    sticker.visualVariant !== "pill" &&
    sticker.visualVariant !== "emoji";
  const isTextSticker = isFloatingText && isPresetSticker && !isArtSticker;
  const isButtonSticker = isButton && isPresetSticker && !isArtSticker;
  const supportsCornerResize =
    !hasImageAsset && !isHotspot && !isEmoji && !isArtSticker && !isTextSticker;
  const showSecondaryLabel =
    !isHotspot && !sticker.assetUri && !isTextSticker && !isEmoji && !isArtSticker;
  const textStickerColor = sticker.textColor ?? "#FFFFFF";
  const stickerForegroundColor = isButtonSticker
    ? theme.semantic.color.textInverse
    : theme.component.sticker.buttonText;
  const resizeHandleColor = hasImageAsset
    ? theme.semantic.color.whiteStroke
    : stickerForegroundColor;
  const stickerBackgroundColor =
    isArtSticker || isMedia || isEmoji || hasImageAsset
      ? "transparent"
      : isButtonSticker
        ? theme.semantic.color.primary
        : isTextSticker
          ? "transparent"
          : theme.component.sticker.buttonBackground;
  const stickerBorderColor = (() => {
    if (isTextSticker) return "transparent";
    if (selected) {
      if (hasImageAsset) return theme.component.sticker.uploadedStroke;
      if (isButtonSticker) return theme.semantic.color.whiteStroke;
      return theme.semantic.color.primary;
    }
    if (hasImageAsset) return theme.component.sticker.uploadedStroke;
    if (isArtSticker || isEmoji) return "transparent";
    return theme.component.sticker.uploadedStroke;
  })();
  const StickerIcon =
    sticker.stickerType === "uploaded_video"
      ? Play
      : isMedia
        ? ImageIcon
        : isAsset
          ? ShoppingBag
          : Link;
  const minimumSize = stickerMinimumSize(sticker);
  const stickerWidth = isHotspot
    ? 42
    : isEmoji
      ? Math.max(minimumSize.width, canvasSize.width * sticker.widthRatio)
      : isTextSticker
        ? Math.max(minimumSize.width, canvasSize.width * sticker.widthRatio)
        : Math.max(minimumSize.width, canvasSize.width * sticker.widthRatio);
  const stickerHeight = isHotspot
    ? 42
    : isEmoji
      ? Math.max(minimumSize.height, canvasSize.height * sticker.heightRatio)
      : isTextSticker
        ? Math.max(minimumSize.height, canvasSize.height * sticker.heightRatio)
        : Math.max(minimumSize.height, canvasSize.height * sticker.heightRatio);
  const textFontSize = stickerTextFontSize(stickerHeight, sticker.textScale, sticker.fontSizePx);
  const emojiFontSize = Math.max(28, Math.min(stickerWidth, stickerHeight) * 0.82);
  const minWidthRatio = canvasSize.width > 0 ? ratio(minimumSize.width, canvasSize.width) : 0.1;
  const minHeightRatio =
    canvasSize.height > 0 ? ratio(minimumSize.height, canvasSize.height) : 0.05;
  const maxWidthRatio = isButtonSticker || isTextSticker ? 0.9 : 0.72;
  const maxHeightRatio = isTextSticker ? 0.34 : isButtonSticker ? 0.18 : 0.36;
  const resizeBounds = stickerResizeBounds(sticker, {
    maxWidthRatio,
    maxHeightRatio
  });
  const minResizeScale = Math.max(
    0.18,
    minWidthRatio / Math.max(sticker.widthRatio, 0.001),
    minHeightRatio / Math.max(sticker.heightRatio, 0.001)
  );
  const maxResizeScale = Math.max(
    minResizeScale,
    Math.min(
      5.5,
      resizeBounds.maxWidthRatio / Math.max(sticker.widthRatio, 0.001),
      resizeBounds.maxHeightRatio / Math.max(sticker.heightRatio, 0.001)
    )
  );
  const maxX = Math.max(0, canvasSize.width - stickerWidth);
  const maxY = Math.max(0, canvasSize.height - stickerHeight);
  const x = useSharedValue(stickerOriginFromCenter(sticker.xRatio, canvasSize.width, stickerWidth));
  const y = useSharedValue(
    stickerOriginFromCenter(sticker.yRatio, canvasSize.height, stickerHeight)
  );
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(1);
  const resizeScale = useSharedValue(1);
  const resizing = useSharedValue(false);
  const entryScale = useSharedValue(1);
  const entryOpacity = useSharedValue(0);

  useEffect(() => {
    x.value = stickerOriginFromCenter(sticker.xRatio, canvasSize.width, stickerWidth);
    y.value = stickerOriginFromCenter(sticker.yRatio, canvasSize.height, stickerHeight);
  }, [
    canvasSize.height,
    canvasSize.width,
    sticker.xRatio,
    sticker.yRatio,
    stickerHeight,
    stickerWidth,
    x,
    y
  ]);

  useEffect(() => {
    entryOpacity.value = withTiming(1, { duration: 120 });
  }, [entryOpacity, entryScale]);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 60 });
  }, [scale, selected]);

  const panGesture = Gesture.Pan()
    .enabled(canvasSize.width > 0 && canvasSize.height > 0)
    .hitSlop(12)
    .onBegin((event) => {
      resizing.value =
        selected &&
        supportsCornerResize &&
        event.x >= Math.max(0, stickerWidth - 34) &&
        event.y >= Math.max(0, stickerHeight - 34);
      runOnJS(onSelectSticker)(sticker.id);
    })
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      if (resizing.value) {
        const resizeBasis = Math.max(1, Math.max(stickerWidth, stickerHeight));
        resizeScale.value = clamp(
          1 + (event.translationX + event.translationY) / resizeBasis,
          minResizeScale,
          maxResizeScale
        );
        return;
      }
      x.value = clamp(startX.value + event.translationX, 0, maxX);
      y.value = clamp(startY.value + event.translationY, 0, maxY);
    })
    .onEnd(() => {
      if (!onChangeSticker || canvasSize.width <= 0 || canvasSize.height <= 0) return;
      if (resizing.value) {
        const nextSize = nextStickerSize({
          sticker,
          canvasSize,
          resizeScale: resizeScale.value,
          minWidthRatio,
          minHeightRatio,
          maxWidthRatio: resizeBounds.maxWidthRatio,
          maxHeightRatio: resizeBounds.maxHeightRatio,
          currentX: x.value,
          currentY: y.value,
          currentWidth: stickerWidth,
          currentHeight: stickerHeight
        });
        x.value = nextSize.x;
        y.value = nextSize.y;
        runOnJS(onChangeSticker)(sticker.id, {
          xRatio: stickerCenterRatio(nextSize.x, nextSize.width, canvasSize.width),
          yRatio: stickerCenterRatio(nextSize.y, nextSize.height, canvasSize.height),
          widthRatio: ratio(nextSize.widthRatio, 1),
          heightRatio: ratio(nextSize.heightRatio, 1)
        });
        resizing.value = false;
        resizeScale.value = 1;
        return;
      }
      runOnJS(onChangeSticker)(sticker.id, {
        xRatio: stickerCenterRatio(x.value, stickerWidth, canvasSize.width),
        yRatio: stickerCenterRatio(y.value, stickerHeight, canvasSize.height)
      });
    })
    .onFinalize(() => {
      resizing.value = false;
    });

  const pinchGesture = Gesture.Pinch()
    .enabled(!isHotspot && canvasSize.width > 0 && canvasSize.height > 0)
    .hitSlop(12)
    .onBegin(() => {
      runOnJS(onSelectSticker)(sticker.id);
    })
    .onUpdate((event) => {
      resizeScale.value = clamp(event.scale, minResizeScale, maxResizeScale);
    })
    .onEnd(() => {
      if (!onChangeSticker || canvasSize.width <= 0 || canvasSize.height <= 0) return;
      const nextSize = nextStickerSize({
        sticker,
        canvasSize,
        resizeScale: resizeScale.value,
        minWidthRatio,
        minHeightRatio,
        maxWidthRatio: resizeBounds.maxWidthRatio,
        maxHeightRatio: resizeBounds.maxHeightRatio,
        currentX: x.value,
        currentY: y.value,
        currentWidth: stickerWidth,
        currentHeight: stickerHeight
      });
      x.value = nextSize.x;
      y.value = nextSize.y;
      runOnJS(onChangeSticker)(sticker.id, {
        xRatio: stickerCenterRatio(nextSize.x, nextSize.width, canvasSize.width),
        yRatio: stickerCenterRatio(nextSize.y, nextSize.height, canvasSize.height),
        widthRatio: ratio(nextSize.widthRatio, 1),
        heightRatio: ratio(nextSize.heightRatio, 1)
      });
      resizeScale.value = 1;
    });

  const tapGesture = Gesture.Tap()
    .maxDistance(8)
    .onEnd(() => {
      runOnJS(onSelectSticker)(sticker.id);
      if (isTextSticker && onEditSticker) {
        runOnJS(onEditSticker)(sticker.id);
      }
    });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value * resizeScale.value * entryScale.value }
    ],
    opacity: entryOpacity.value
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={`${sticker.label} 스티커`}
        style={[
          styles.sticker,
          isHotspot ? styles.hotspotSticker : null,
          isMedia ? styles.mediaSticker : null,
          hasImageAsset ? styles.imageAssetSticker : null,
          hasImageAsset ? styles.imageAssetStickerClean : null,
          isTextSticker ? styles.textSticker : null,
          isEmoji ? styles.emojiSticker : null,
          isArtSticker ? styles.artSticker : null,
          {
            width: stickerWidth,
            height: stickerHeight,
            backgroundColor: stickerBackgroundColor,
            borderColor: stickerBorderColor
          },
          selected ? theme.semantic.shadow.subtle : null,
          animatedStyle
        ]}
      >
        {sticker.assetUri ? (
          <>
            <Image
              source={{ uri: sticker.assetUri }}
              style={styles.imageAsset}
              contentFit="contain"
            />
            {sticker.label.trim() ? (
              <View pointerEvents="none" style={styles.stickerLabelOverlay}>
                <ShoplyText
                  variant="labelMd"
                  adjustsFontSizeToFit
                  minimumFontScale={0.56}
                  numberOfLines={1}
                  style={styles.imageAssetLabel}
                >
                  {sticker.label.trim()}
                </ShoplyText>
              </View>
            ) : null}
          </>
        ) : (
          <View
            pointerEvents="none"
            style={[
              styles.stickerContent,
              isTextSticker ? styles.textStickerContent : null,
              isArtSticker ? styles.artStickerContentFrame : null,
              isEmoji ? styles.emojiStickerContent : null
            ]}
          >
            {isEmoji ? (
              <ShoplyText
                variant="titleLg"
                numberOfLines={1}
                style={{ fontSize: emojiFontSize, lineHeight: emojiFontSize * 1.08 }}
              >
                {sticker.emoji ?? sticker.label}
              </ShoplyText>
            ) : isArtSticker ? (
              <StickerArtwork
                variant={(sticker.visualVariant ?? "burst") as StickerArtworkVariant}
                label={sticker.label}
              />
            ) : isTextSticker ? (
              <ShoplyText
                variant="titleMd"
                ellipsizeMode="tail"
                style={[
                  styles.textStickerLabel,
                  {
                    color: textStickerColor,
                    fontSize: textFontSize,
                    lineHeight: textFontSize * 1.12
                  }
                ]}
                numberOfLines={1}
              >
                {sticker.label}
              </ShoplyText>
            ) : (
              <StickerIcon size={16} color={stickerForegroundColor} />
            )}
            {showSecondaryLabel ? (
              <ShoplyText
                variant="labelMd"
                style={[styles.stickerInlineLabel, { color: stickerForegroundColor }]}
                numberOfLines={1}
              >
                {sticker.label}
              </ShoplyText>
            ) : null}
          </View>
        )}
        {selected && supportsCornerResize ? (
          <View style={styles.resizeHandleTarget}>
            <View style={[styles.resizeHandle, { borderColor: resizeHandleColor }]} />
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

function StickerArtwork({ variant, label }: { variant: StickerArtworkVariant; label: string }) {
  const geometry = getStickerArtworkGeometry(variant);
  const textColor = variant === "chrome" ? "#080B12" : "#FFFFFF";
  const labelBackground =
    variant === "chrome" ? "rgba(255, 255, 255, 0.72)" : "rgba(5, 5, 7, 0.44)";

  return (
    <View style={styles.artStickerContent}>
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
            <Circle cx="70" cy="46" r="39" fill="#FFFFFF" />
            <Circle cx="74" cy="50" r="33" fill="#0B0B0F" opacity="0.3" />
            <Circle cx="68" cy="43" r="32" fill="#F8FAFC" />
            <Circle cx="68" cy="43" r="26" fill="#FDE047" />
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
  const metrics = artworkLabelMetrics(label, 13.5, maxWidth);

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

function stickerMinimumSize(sticker: DraftDirectPurchaseLink) {
  if (sticker.stickerType === "hotspot_dot") return { width: 44, height: 44 };
  if (sticker.assetUri) return { width: 56, height: 56 };
  if (sticker.visualVariant === "emoji" || sticker.emoji) return { width: 44, height: 44 };
  if (sticker.stickerType === "text") {
    const fontSize = stickerTextFontSize(34, sticker.textScale, sticker.fontSizePx);
    return {
      width: Math.min(280, Math.max(64, textStickerLabelWidth(sticker.label, fontSize) + 26)),
      height: Math.max(34, fontSize * 1.18 + 10)
    };
  }
  if (sticker.visualVariant === "cart") return { width: 56, height: 56 };
  if (sticker.visualVariant && sticker.visualVariant !== "pill") {
    return { width: 76, height: 52 };
  }
  if (sticker.stickerType === "button") {
    return { width: Math.min(160, Math.max(74, labelWidth(sticker.label, 12, 44))), height: 38 };
  }
  if (sticker.stickerType === "uploaded_image" || sticker.stickerType === "uploaded_video") {
    return { width: 56, height: 56 };
  }
  if (sticker.stickerType === "asset_cutout") return { width: 60, height: 40 };
  return { width: 56, height: 34 };
}

function stickerTextFontSize(stickerHeight: number, textScale = 1, fontSizePx?: number) {
  return Math.max(18, Math.min(72, fontSizePx ?? stickerHeight * 0.58 * textScale));
}

function labelWidth(label: string, unitWidth: number, extraWidth: number) {
  return Array.from(label.trim()).reduce((total, character) => {
    return total + (character === " " ? unitWidth * 0.45 : unitWidth);
  }, extraWidth);
}

function textStickerLabelWidth(label: string, fontSizePx: number) {
  return Array.from(label.trim() || "Aa").reduce((total, character) => {
    if (character === " ") return total + fontSizePx * 0.36;
    return total + fontSizePx * (character.charCodeAt(0) > 127 ? 0.92 : 0.58);
  }, 0);
}

function stickerResizeBounds(
  sticker: DraftDirectPurchaseLink,
  fallback: { maxWidthRatio: number; maxHeightRatio: number }
) {
  "worklet";
  if (
    sticker.assetUri ||
    sticker.stickerType === "uploaded_image" ||
    sticker.stickerType === "uploaded_video"
  ) {
    return { maxWidthRatio: 0.95, maxHeightRatio: 0.82 };
  }
  if (sticker.visualVariant === "emoji" || sticker.emoji) {
    return { maxWidthRatio: 0.62, maxHeightRatio: 0.48 };
  }
  if (
    sticker.stickerType === "asset_cutout" ||
    (sticker.visualVariant && sticker.visualVariant !== "pill")
  ) {
    return { maxWidthRatio: 0.86, maxHeightRatio: 0.52 };
  }
  return fallback;
}

function nextStickerSize({
  sticker,
  canvasSize,
  resizeScale,
  minWidthRatio,
  minHeightRatio,
  maxWidthRatio,
  maxHeightRatio,
  currentX,
  currentY,
  currentWidth,
  currentHeight
}: {
  sticker: DraftDirectPurchaseLink;
  canvasSize: CanvasSize;
  resizeScale: number;
  minWidthRatio: number;
  minHeightRatio: number;
  maxWidthRatio: number;
  maxHeightRatio: number;
  currentX: number;
  currentY: number;
  currentWidth: number;
  currentHeight: number;
}) {
  "worklet";
  const widthRatio = clamp(sticker.widthRatio * resizeScale, minWidthRatio, maxWidthRatio);
  const heightRatio = clamp(sticker.heightRatio * resizeScale, minHeightRatio, maxHeightRatio);
  const nextWidth = widthRatio * canvasSize.width;
  const nextHeight = heightRatio * canvasSize.height;
  const centerX = currentX + currentWidth / 2;
  const centerY = currentY + currentHeight / 2;
  const maxX = Math.max(0, canvasSize.width - nextWidth);
  const maxY = Math.max(0, canvasSize.height - nextHeight);

  return {
    x: clamp(centerX - nextWidth / 2, 0, maxX),
    y: clamp(centerY - nextHeight / 2, 0, maxY),
    width: nextWidth,
    height: nextHeight,
    widthRatio,
    heightRatio
  };
}

const styles = StyleSheet.create({
  canvas: {
    overflow: "hidden"
  },
  canvasFrame: {
    aspectRatio: 4 / 5,
    borderRadius: 20,
    borderWidth: 1
  },
  canvasFill: {
    borderRadius: 0,
    borderWidth: 0,
    flex: 1
  },
  emptyMedia: {
    alignItems: "center",
    bottom: 0,
    gap: 8,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0
  },
  emptyMediaText: {
    color: "rgba(255, 255, 255, 0.72)",
    textAlign: "center"
  },
  scrim: {
    bottom: 0,
    left: 0,
    opacity: 0.16,
    position: "absolute",
    right: 0,
    top: 0
  },
  guide: {
    borderStyle: "dashed",
    borderWidth: 1,
    bottom: 34,
    left: 22,
    opacity: 0.74,
    position: "absolute",
    right: 22,
    top: 34
  },
  sticker: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 0,
    justifyContent: "center",
    left: 0,
    minHeight: 0,
    overflow: "hidden",
    position: "absolute",
    top: 0
  },
  stickerContent: {
    alignItems: "center",
    bottom: 0,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 8,
    position: "absolute",
    right: 0,
    top: 0
  },
  stickerInlineLabel: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: "center",
    textAlignVertical: "center"
  },
  hotspotSticker: {
    borderRadius: 999,
    paddingHorizontal: 0
  },
  mediaSticker: {
    borderRadius: 14
  },
  imageAsset: {
    bottom: 0,
    borderRadius: 10,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  imageAssetLabel: {
    backgroundColor: "rgba(5, 5, 7, 0.46)",
    borderRadius: 999,
    color: "#FFFFFF",
    fontWeight: "800",
    maxWidth: "86%",
    minWidth: 32,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.34)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  imageAssetSticker: {
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
    paddingHorizontal: 0
  },
  imageAssetStickerClean: {
    borderColor: "transparent",
    borderWidth: 0
  },
  textSticker: {
    borderRadius: 8,
    borderWidth: 0,
    overflow: "visible",
    paddingHorizontal: 0
  },
  textStickerContent: {
    paddingHorizontal: 8
  },
  textStickerLabel: {
    fontWeight: "800",
    maxWidth: "100%",
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0, 0, 0, 0.48)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  emojiSticker: {
    borderRadius: 18,
    paddingHorizontal: 0
  },
  artSticker: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    overflow: "visible",
    paddingHorizontal: 0
  },
  artStickerContentFrame: {
    paddingHorizontal: 0
  },
  emojiStickerContent: {
    paddingHorizontal: 0
  },
  artStickerContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "visible"
  },
  stickerLabelOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 6,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2
  },
  resizeHandle: {
    backgroundColor: "transparent",
    borderWidth: 0,
    height: 1,
    width: 1
  },
  resizeHandleTarget: {
    alignItems: "flex-end",
    bottom: 0,
    height: 44,
    justifyContent: "flex-end",
    padding: 7,
    position: "absolute",
    right: 0,
    width: 44
  },
  hint: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    left: 12,
    minHeight: 28,
    paddingHorizontal: 10,
    position: "absolute",
    top: 12
  },
  hintText: {
    color: "white"
  }
});
