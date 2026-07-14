import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle
} from "react-native-reanimated";
import { useShoplyTheme } from "@shoply/design-system";

interface AdaptiveStickyHeaderProps {
  children: ReactNode;
  scrollY: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

export function AdaptiveStickyHeader({ children, scrollY, style }: AdaptiveStickyHeaderProps) {
  const theme = useShoplyTheme();
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 18, 76], [0, 0.56, 0.98], Extrapolation.CLAMP)
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 26, 72], [1, 0.76, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(scrollY.value, [0, 26, 72], [1, 0.985, 1], Extrapolation.CLAMP)
      }
    ]
  }));

  return (
    <Animated.View style={[styles.root, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.surface,
          {
            backgroundColor: theme.semantic.color.background,
            borderBottomColor: theme.semantic.color.border
          },
          surfaceStyle
        ]}
      />
      <Animated.View style={contentStyle}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 20
  },
  surface: {
    borderBottomWidth: StyleSheet.hairlineWidth
  }
});
