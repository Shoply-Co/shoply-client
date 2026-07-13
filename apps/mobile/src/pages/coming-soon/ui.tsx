import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";

export function ComingSoonPage({ title }: { title: string }) {
  const theme = useShoplyTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.semantic.color.background }} edges={["top"]}>
      <View style={styles.content}>
        <View style={styles.copy}>
          <ShoplyText variant="titleLg" align="center">
            {title}
          </ShoplyText>
          <ShoplyText variant="bodyMd" color="textMuted" align="center">
            준비중
          </ShoplyText>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    flex: 1,
    gap: 24,
    justifyContent: "center",
    padding: 28,
    paddingBottom: 120
  },
  copy: {
    alignItems: "center",
    gap: 12,
    maxWidth: 330,
    width: "100%"
  }
});
