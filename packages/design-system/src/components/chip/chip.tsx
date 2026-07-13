import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { ShoplyText } from "../../primitives/text";
import { useShoplyTheme } from "../../themes/theme-provider";

interface ChipProps extends Omit<PressableProps, "style"> {
  label: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected = false, disabled, style, ...props }: ChipProps) {
  const theme = useShoplyTheme();
  const token = theme.component.chip;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        scale.value = withTiming(0.96, { duration: 90 });
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 240 });
        props.onPressOut?.(event);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      style={[
        {
          alignItems: "center",
          backgroundColor: selected ? token.selectedBackground : token.background,
          borderColor: selected ? token.selectedBorder : token.border,
          borderRadius: theme.semantic.radius.pill,
          borderWidth: 1,
          minHeight: 36,
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
          paddingHorizontal: 14
        },
        style
      ]}
    >
      <Animated.View style={animatedStyle}>
        <ShoplyText
          variant="labelMd"
          style={{ color: selected ? token.selectedText : token.text }}
          numberOfLines={1}
        >
          {label}
        </ShoplyText>
      </Animated.View>
    </Pressable>
  );
}
