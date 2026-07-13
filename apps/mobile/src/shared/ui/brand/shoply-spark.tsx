import { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";

interface ShoplySparkProps {
  size?: number;
  animated?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ShoplySpark({
  size = 28,
  animated = true,
  accessibilityLabel = "상품 링크 표시",
  style
}: ShoplySparkProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  const scale = useSharedValue(shouldAnimate ? 0.86 : 1);
  const rotate = useSharedValue(shouldAnimate ? -8 : 0);
  const opacity = useSharedValue(shouldAnimate ? 0 : 1);

  useEffect(() => {
    if (!shouldAnimate) {
      opacity.value = 1;
      scale.value = 1;
      rotate.value = 0;
      return;
    }
    opacity.value = withTiming(1, { duration: 120 });
    scale.value = withSequence(
      withSpring(1.04, { damping: 11, stiffness: 260 }),
      withSpring(1, { damping: 12, stiffness: 220 })
    );
    rotate.value = withSpring(0, { damping: 12, stiffness: 180 });
  }, [opacity, rotate, scale, shouldAnimate]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }]
  }));

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[{ height: size, width: size }, animatedStyle, style]}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Polygon
          points="32,4 39,23 59,23 43,35 49,56 32,44 15,56 21,35 5,23 25,23"
          fill="#FFD84D"
          stroke="#16171C"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}
