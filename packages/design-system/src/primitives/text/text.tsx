import { PropsWithChildren } from "react";
import { StyleProp, Text, TextProps, TextStyle } from "react-native";
import { useShoplyTheme } from "../../themes/theme-provider";

export type TextVariant =
  | "displaySm"
  | "titleLg"
  | "titleMd"
  | "bodyLg"
  | "bodyMd"
  | "labelLg"
  | "labelMd"
  | "caption";

interface ShoplyTextProps extends PropsWithChildren<TextProps> {
  variant?: TextVariant;
  color?: "text" | "textMuted" | "textInverse" | "primary" | "danger" | "success" | "warning";
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}

export function ShoplyText({
  children,
  variant = "bodyMd",
  color = "text",
  align,
  style,
  ...props
}: ShoplyTextProps) {
  const theme = useShoplyTheme();
  const type = theme.semantic.typography[variant];

  return (
    <Text
      {...props}
      style={[
        {
          color: theme.semantic.color[color],
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          fontWeight: type.fontWeight,
          textAlign: align,
          includeFontPadding: false
        },
        style
      ]}
    >
      {children}
    </Text>
  );
}

interface AmountTextProps extends Omit<ShoplyTextProps, "variant"> {
  compact?: boolean;
}

export function AmountText({ compact = false, style, ...props }: AmountTextProps) {
  return (
    <ShoplyText
      {...props}
      variant={compact ? "titleMd" : "displaySm"}
      style={[{ fontVariant: ["tabular-nums"] }, style]}
    />
  );
}
