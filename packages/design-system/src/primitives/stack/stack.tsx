import { PropsWithChildren } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { useShoplyTheme } from "../../themes/theme-provider";

interface StackProps extends PropsWithChildren {
  direction?: "row" | "column";
  gap?: keyof ReturnType<typeof useShoplyTheme>["semantic"]["spacing"];
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  style?: StyleProp<ViewStyle>;
}

export function Stack({
  children,
  direction = "column",
  gap = 4,
  align,
  justify,
  style
}: StackProps) {
  const theme = useShoplyTheme();

  return (
    <View
      style={[
        {
          flexDirection: direction,
          gap: theme.semantic.spacing[gap],
          alignItems: align,
          justifyContent: justify
        },
        style
      ]}
    >
      {children}
    </View>
  );
}
