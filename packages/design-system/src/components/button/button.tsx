import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { ShoplyText } from "../../primitives/text";
import { useShoplyTheme } from "../../themes/theme-provider";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "text";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8 },
  md: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  lg: { minHeight: 52, paddingHorizontal: 20, paddingVertical: 14 },
  icon: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0 }
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading,
  disabled,
  style,
  accessibilityLabel,
  ...props
}: ButtonProps) {
  const theme = useShoplyTheme();
  const token = theme.component.button[variant];
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      onPressIn={(event) => {
        scale.value = withTiming(size === "icon" ? 0.92 : 0.97, { duration: 90 });
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 240 });
        props.onPressOut?.(event);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        {
          borderRadius: size === "icon" ? theme.semantic.radius.pill : theme.semantic.radius.lg,
          backgroundColor: pressed ? token.pressedBackground : token.background,
          borderColor: token.border,
          opacity: isDisabled ? 0.48 : 1
        },
        style
      ]}
    >
      <Animated.View style={animatedStyle}>
        {loading ? (
          <ActivityIndicator color={token.text} />
        ) : (
          <View style={styles.content}>
            {iconPosition === "left" ? icon : null}
            {label ? (
              <ShoplyText
                variant={size === "lg" ? "labelLg" : "labelMd"}
                style={{ color: token.text }}
                numberOfLines={1}
              >
                {label}
              </ShoplyText>
            ) : null}
            {iconPosition === "right" ? icon : null}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center"
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  }
});
