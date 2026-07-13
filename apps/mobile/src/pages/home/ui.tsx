import { SafeAreaView } from "react-native-safe-area-context";
import { useShoplyTheme } from "@shoply/design-system";
import { HomeSectionList } from "@/widgets/home-section-list";

export function HomePage() {
  const theme = useShoplyTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <HomeSectionList />
    </SafeAreaView>
  );
}
