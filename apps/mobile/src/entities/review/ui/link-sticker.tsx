import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { ExternalLink, Image as ImageIcon, Play, ShoppingBag } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import {
  getStickerArtworkGeometry,
  type StickerArtworkVariant
} from "../model/sticker-artwork";
import { ReviewLinkSticker } from "../model/types";

interface LinkStickerProps {
  sticker: ReviewLinkSticker;
  revealed: boolean;
  onPress: () => void;
}

export function LinkSticker({ sticker, revealed, onPress }: LinkStickerProps) {
  const theme = useShoplyTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const press = () => {
    scale.value = withTiming(0.92, { duration: 80 }, () => {
      scale.value = withSpring(1, { damping: 11, stiffness: 260 });
    });
    void Haptics.selectionAsync();
    onPress();
  };

  if (!revealed) return null;

  if (sticker.type === "hotspot_dot") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sticker.merchantName} 상품 링크`}
        onPress={press}
        style={[
          styles.hotspot,
          {
            left: `${sticker.xRatio * 100}%`,
            top: `${sticker.yRatio * 100}%`,
            transform: [{ translateX: -21 }, { translateY: -21 }],
            borderColor: theme.component.sticker.uploadedStroke,
            backgroundColor: theme.component.sticker.hotspot
          }
        ]}
      >
        <Animated.View style={animatedStyle}>
          <ShoppingBag size={15} color="white" />
        </Animated.View>
      </Pressable>
    );
  }

  const isEmoji = sticker.visualVariant === "emoji" || Boolean(sticker.emoji);
  const isText = sticker.type === "text";
  const isArtwork =
    sticker.type === "asset_cutout" &&
    Boolean(sticker.visualVariant) &&
    sticker.visualVariant !== "pill" &&
    sticker.visualVariant !== "emoji";
  const StickerIcon =
    sticker.type === "uploaded_video"
      ? Play
      : sticker.type === "uploaded_image"
        ? ImageIcon
        : sticker.type === "asset_cutout"
          ? ShoppingBag
          : ExternalLink;
  const isAssetImage = sticker.type === "uploaded_image" && Boolean(sticker.assetUrl);
  const stickerWidthRatio = Math.max(sticker.widthRatio, 0.12);
  const stickerHeightRatio = Math.max(
    sticker.heightRatio,
    isArtwork ? 0.074 : isEmoji ? 0.07 : 0.06
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sticker.merchantName} 상품 링크 열기`}
      onPress={press}
      style={[
        styles.buttonSticker,
        {
          left: stickerOriginPercent(sticker.xRatio, stickerWidthRatio),
          top: stickerOriginPercent(sticker.yRatio, stickerHeightRatio),
          width: `${stickerWidthRatio * 100}%`,
          height: `${stickerHeightRatio * 100}%`,
          minHeight: isArtwork ? 52 : isEmoji ? 44 : 42,
          backgroundColor:
            isArtwork || isEmoji || isAssetImage
              ? "transparent"
              : isText
                ? "rgba(255, 255, 255, 0.92)"
                : theme.component.sticker.buttonBackground,
          borderColor: isArtwork || isEmoji ? "transparent" : theme.component.sticker.uploadedStroke
        },
        isAssetImage || isText ? theme.semantic.shadow.overlay : null,
        isArtwork ? styles.artSticker : null,
        isAssetImage ? styles.imageSticker : null,
        isAssetImage ? styles.imageStickerClean : null
      ]}
    >
      <Animated.View
        style={[
          styles.buttonInner,
          isAssetImage || isArtwork || isEmoji ? styles.visualButtonInner : null,
          isText ? styles.textButtonInner : null,
          animatedStyle
        ]}
      >
        {isAssetImage ? (
          <>
            <ExpoImage
              source={{ uri: sticker.assetUrl ?? "" }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
            />
            {sticker.label.trim() ? (
              <View pointerEvents="none" style={styles.stickerLabelOverlay}>
                <ShoplyText
                  variant="labelMd"
                  adjustsFontSizeToFit
                  minimumFontScale={0.56}
                  numberOfLines={1}
                  style={styles.imageStickerLabel}
                >
                  {sticker.label.trim()}
                </ShoplyText>
              </View>
            ) : null}
          </>
        ) : isEmoji ? (
          <ShoplyText variant="titleLg" numberOfLines={1}>
            {sticker.emoji ?? sticker.label}
          </ShoplyText>
        ) : isArtwork && sticker.visualVariant ? (
          <StickerArtwork
            variant={sticker.visualVariant as StickerArtworkVariant}
            label={sticker.label}
          />
        ) : isText ? (
          <ShoplyText variant="labelMd" style={styles.textStickerLabel} numberOfLines={1}>
            {sticker.label}
          </ShoplyText>
        ) : (
          <>
            <StickerIcon size={15} color={theme.component.sticker.buttonText} />
            <ShoplyText
              variant="labelMd"
              style={{ color: theme.component.sticker.buttonText }}
              numberOfLines={1}
            >
              {sticker.label}
            </ShoplyText>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

function stickerOriginPercent(centerRatio: number, sizeRatio: number): `${number}%` {
  const max = Math.max(0, 1 - sizeRatio);
  return `${Math.min(max, Math.max(0, centerRatio - sizeRatio / 2)) * 100}%`;
}

function StickerArtwork({
  variant,
  label
}: {
  variant: StickerArtworkVariant;
  label: string;
}) {
  const geometry = getStickerArtworkGeometry(variant);
  const textColor = variant === "chrome" ? "#080B12" : "#FFFFFF";
  const labelBackground =
    variant === "chrome" ? "rgba(255, 255, 255, 0.72)" : "rgba(5, 5, 7, 0.44)";

  return (
    <View style={styles.artStickerContent}>
      <Svg
        width="100%"
        height="100%"
        viewBox={geometry.viewBox}
        style={StyleSheet.absoluteFill}
      >
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
          </G>
        ) : variant === "bag" ? (
          <G>
            <Path
              d="M24 27c0-8 7-14 15-14h60c8 0 15 6 15 14v42c0 8-7 14-15 14H39c-8 0-15-6-15-14V27Z"
              fill="#FFFFFF"
            />
            <Path d="M34 25h57l-4 50H27l7-50Z" fill="#55E2B2" />
            <Path d="M88 25h19l9 48H86l2-48Z" fill="#7C3AED" />
            <Path d="M52 32c0-17 34-17 34 0" stroke="#0B0B0F" strokeWidth="7" fill="none" />
          </G>
        ) : variant === "arrow" ? (
          <G>
            <Path d="M12 39 39 16h47l19 14 15 14-28 30H39L12 58Z" fill="#FFFFFF" />
            <Path d="M16 37 43 17h37l33 25-32 28H42L16 53Z" fill="#0F7BFF" />
            <Circle cx="41" cy="45" r="9" fill="#FFFFFF" />
          </G>
        ) : variant === "chrome" ? (
          <G>
            <Rect x="12" y="20" width="116" height="52" rx="26" fill="#FFFFFF" />
            <Path d="M22 52c17-18 48-26 90-23" stroke="#B9C4FF" strokeWidth="12" opacity="0.8" />
          </G>
        ) : variant === "ribbon" ? (
          <G>
            <Path d="M17 25h94l12 21-12 21H17l14-21Z" fill="#FFFFFF" />
            <Path d="M25 29h81l10 17-10 17H25l12-17Z" fill="#14B8A6" />
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
          </G>
        ) : (
          <G>
            <Polygon
              points="70,6 83,25 105,15 111,37 132,43 113,58 119,80 94,75 77,88 64,68 40,82 42,58 12,53 36,37 29,18 55,25"
              fill="#FFFFFF"
            />
            <Polygon
              points="69,10 81,28 100,20 105,40 124,45 107,58 112,76 90,71 77,84 64,64 43,77 45,57 17,51 41,37 35,20 57,29"
              fill="#FF5F57"
            />
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

const styles = StyleSheet.create({
  buttonSticker: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    justifyContent: "center",
    position: "absolute"
  },
  buttonInner: {
    alignItems: "center",
    bottom: 0,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    top: 0
  },
  visualButtonInner: {
    paddingHorizontal: 0
  },
  textButtonInner: {
    paddingHorizontal: 8
  },
  artSticker: {
    borderRadius: 0,
    borderWidth: 0,
    overflow: "visible",
    paddingHorizontal: 0
  },
  artStickerContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
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
  imageSticker: {
    borderRadius: 10,
    overflow: "hidden",
    paddingHorizontal: 0
  },
  imageStickerClean: {
    borderColor: "transparent",
    borderWidth: 0
  },
  imageStickerLabel: {
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
    textAlignVertical: "center",
    textShadowColor: "rgba(0, 0, 0, 0.34)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  textStickerLabel: {
    color: "#111722",
    textAlign: "center",
    textAlignVertical: "center",
    width: "100%"
  },
  hotspot: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: 42,
    justifyContent: "center",
    position: "absolute",
    width: 42
  }
});
