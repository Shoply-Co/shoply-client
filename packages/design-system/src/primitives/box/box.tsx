import { PropsWithChildren } from "react";
import { View, ViewProps } from "react-native";

export type BoxProps = PropsWithChildren<ViewProps>;

export function Box({ children, ...props }: BoxProps) {
  return <View {...props}>{children}</View>;
}
