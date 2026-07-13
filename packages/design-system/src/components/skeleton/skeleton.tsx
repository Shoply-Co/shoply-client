import { StyleProp, View, ViewStyle } from "react-native";
import { useShoplyTheme } from "../../themes/theme-provider";

interface SkeletonProps {
  width?: ViewStyle["width"];
  height?: ViewStyle["height"];
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = "100%", height = 16, radius, style }: SkeletonProps) {
  const theme = useShoplyTheme();

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.semantic.radius.sm,
          backgroundColor: theme.semantic.color.surfaceMuted
        },
        style
      ]}
    />
  );
}
