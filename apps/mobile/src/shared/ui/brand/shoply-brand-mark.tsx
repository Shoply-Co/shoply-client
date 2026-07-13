import { Image, StyleProp, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { useShoplyTheme } from "@shoply/design-system";
import homeWordmark from "../../../../assets/shoply-wordmark-home.png";

type BrandTone = "brand" | "light";

interface ShoplyBagMarkProps {
  size?: number;
  container?: boolean;
  tone?: BrandTone;
  style?: StyleProp<ViewStyle>;
}

interface ShoplyWordmarkProps {
  width?: number;
  tone?: BrandTone;
  style?: StyleProp<ViewStyle>;
}

interface ShoplyBrandLockupProps {
  compact?: boolean;
  tone?: BrandTone;
  style?: StyleProp<ViewStyle>;
}

interface ShoplySMonogramProps {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ShoplyHomeWordmark() {
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel="Shoply"
      accessibilityRole="image"
      resizeMode="contain"
      source={homeWordmark}
      style={{ height: 32, width: 72 }}
    />
  );
}

export function ShoplySMonogram({
  size = 24,
  color,
  accessibilityLabel = "쇼플리 매거진",
  style
}: ShoplySMonogramProps) {
  const theme = useShoplyTheme();
  const fill = color ?? theme.semantic.color.primary;
  return (
    <View style={[{ height: size, width: size }, style]}>
      <Svg
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="image"
        width={size}
        height={size}
        viewBox="0 0 64 64"
      >
        <Path
          d="M49 13.5C44.8 8.8 38.7 6 31.1 6C19.6 6 12 12.3 12 21.2C12 30.5 19.4 34.2 30.6 36.5C38.2 38.1 41.5 39.7 41.5 43.5C41.5 47.6 37.8 50 31.7 50C24.8 50 19.7 47.4 15.7 42.2L8 48.6C13.3 55.2 21.1 58.7 31.4 58.7C44.2 58.7 52.3 52.3 52.3 42.6C52.3 33.5 45.6 29.4 34.1 27C25.8 25.3 22.7 23.7 22.7 20.2C22.7 16.8 25.9 14.7 31.1 14.7C36.3 14.7 40.3 16.5 43.4 20.2L49 13.5Z"
          fill={fill}
        />
        <Path
          d="M16 8.5C23.7 4.1 35.9 2.5 46.7 8.3"
          fill="none"
          stroke={fill}
          strokeLinecap="round"
          strokeWidth="2.6"
          opacity="0.55"
        />
      </Svg>
    </View>
  );
}

export function ShoplyBagMark({
  size = 44,
  container = false,
  tone = "brand",
  style
}: ShoplyBagMarkProps) {
  const theme = useShoplyTheme();
  const brand = theme.semantic.color.primary;
  const bagFill = "#FFFFFF";
  const letterFill = brand;
  const outline = tone === "light" ? "#FFFFFF" : brand;

  return (
    <View style={[{ height: size, width: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Shoply">
        {container ? (
          <>
            <Defs>
              <LinearGradient id="shoply-mark-bg" x1="0" y1="0" x2="1024" y2="1024">
                <Stop offset="0" stopColor="#554EF2" />
                <Stop offset="1" stopColor="#5F4CEC" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="1024" height="1024" rx="230" fill="url(#shoply-mark-bg)" />
          </>
        ) : null}
        <Path
          d="M278 344C278 318 299 296 326 296H700C727 296 748 318 748 344L777 755C780 789 753 819 718 819H309C275 819 248 789 251 755L278 344Z"
          fill={bagFill}
          stroke={outline}
          strokeWidth={container ? 0 : 30}
          strokeLinejoin="round"
        />
        <Path
          d="M389 363V236C389 167 444 112 512 112C580 112 635 167 635 236V363"
          fill="none"
          stroke={outline}
          strokeWidth="74"
          strokeLinecap="round"
        />
        <Path
          d="M389 363V236C389 167 444 112 512 112C580 112 635 167 635 236V363"
          fill="none"
          stroke={bagFill}
          strokeWidth="36"
          strokeLinecap="round"
        />
        <Path
          d="M389 363V236C389 167 444 112 512 112C580 112 635 167 635 236V363"
          fill="none"
          stroke={outline}
          strokeOpacity={container ? 0 : 0.18}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <Path d="M367 363A22 22 0 1 0 411 363A22 22 0 1 0 367 363Z" fill={letterFill} />
        <Path d="M613 363A22 22 0 1 0 657 363A22 22 0 1 0 613 363Z" fill={letterFill} />
        <SvgText
          x="512"
          y="592"
          textAnchor="middle"
          alignmentBaseline="middle"
          fontFamily="Arial"
          fontSize="330"
          fontWeight="800"
          fill={letterFill}
        >
          S
        </SvgText>
      </Svg>
    </View>
  );
}

export function ShoplyWordmark({ width = 150, tone = "brand", style }: ShoplyWordmarkProps) {
  const theme = useShoplyTheme();
  const color = tone === "light" ? "#FFFFFF" : theme.semantic.color.primary;
  const height = Math.round(width * 0.34);

  return (
    <View style={[{ height, width }, style]}>
      <Svg width={width} height={height} viewBox="0 0 320 110" accessibilityLabel="Shoply wordmark">
        <SvgText
          x="8"
          y="76"
          fill={color}
          fontFamily="Snell Roundhand, Brush Script MT, cursive"
          fontSize="82"
          fontWeight="700"
          letterSpacing="0"
          transform="rotate(-4 160 55)"
        >
          Shoply
        </SvgText>
      </Svg>
    </View>
  );
}

export function ShoplyBrandLockup({
  compact = false,
  tone = "brand",
  style
}: ShoplyBrandLockupProps) {
  return (
    <View style={[{ alignItems: "center", flexDirection: "row", gap: compact ? 8 : 12 }, style]}>
      <ShoplyBagMark size={compact ? 34 : 52} container tone={tone} />
      <ShoplyWordmark width={compact ? 128 : 176} tone={tone} />
    </View>
  );
}
