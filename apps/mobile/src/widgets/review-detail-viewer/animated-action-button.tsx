import * as Haptics from "expo-haptics";
import { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { useShoplyTheme } from "@shoply/design-system";

interface AnimatedActionButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  emphasis?: "default" | "primary";
  onPress?: () => void;
}

export function AnimatedActionButton({
  icon,
  label,
  active = false,
  emphasis = "default",
  onPress
}: AnimatedActionButtonProps) {
  const theme = useShoplyTheme();
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }]
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        scale.value = withSequence(
          withTiming(0.84, { duration: 80 }),
          withSpring(1.12, { damping: 8, stiffness: 280 }),
          withSpring(1, { damping: 11, stiffness: 220 })
        );
        rotate.value = withSequence(withTiming(active ? -8 : 8, { duration: 70 }), withSpring(0));
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={styles.wrap}
    >
      <Animated.View
        style={[
          styles.circle,
          emphasis === "primary" ? { backgroundColor: theme.semantic.color.primary } : null,
          animatedStyle
        ]}
      >
        {icon}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44
  },
  circle: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.34)",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42
  }
});
