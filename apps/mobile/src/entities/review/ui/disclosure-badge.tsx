import { StyleSheet, View } from "react-native";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { disclosureLabel } from "../model/disclosure";
import { DisclosureState } from "../model/types";

interface DisclosureBadgeProps {
  state: DisclosureState;
  compact?: boolean;
  inverse?: boolean;
}

export function DisclosureBadge({ state, compact = false, inverse = false }: DisclosureBadgeProps) {
  const theme = useShoplyTheme();

  if (state === "none" || state === "direct_purchase") return null;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: inverse ? "rgba(5, 5, 7, 0.44)" : theme.semantic.color.surfaceMuted,
          borderColor: inverse ? "rgba(255, 255, 255, 0.18)" : theme.semantic.color.border,
          paddingHorizontal: compact ? 8 : 10,
          minHeight: compact ? 24 : 28
        }
      ]}
    >
      <ShoplyText
        variant="caption"
        style={{ color: inverse ? theme.semantic.color.textInverse : theme.semantic.color.textMuted }}
      >
        {disclosureLabel[state]}
      </ShoplyText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center"
  }
});
