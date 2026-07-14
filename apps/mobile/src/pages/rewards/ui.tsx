import { ArrowLeft } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { RewardSummaryPanel } from "@/widgets/reward-summary-panel";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { AdaptiveStickyHeader } from "@/shared/ui/adaptive-sticky-header";

export function RewardsPage() {
  const theme = useShoplyTheme();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <AdaptiveStickyHeader scrollY={scrollY} style={styles.stickyHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로 가기"
            hitSlop={10}
            onPress={() => goBackOrReplace()}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.68 : 1 }]}
          >
            <ArrowLeft size={22} color={theme.semantic.color.text} />
          </Pressable>
        </AdaptiveStickyHeader>
        <ShoplyText variant="titleLg" style={{ marginHorizontal: 16, marginTop: 10 }}>
          리워드 내역
        </ShoplyText>
        <RewardSummaryPanel />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    marginLeft: 16,
    marginTop: 12,
    height: 44,
    width: 44
  },
  stickyHeader: {
    paddingVertical: 4
  }
});
