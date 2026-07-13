import { SafeAreaView } from "react-native-safe-area-context";
import { useShoplyTheme } from "@shoply/design-system";
import { SearchResultList } from "@/widgets/search-result-list";

export function SearchPage() {
  const theme = useShoplyTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <SearchResultList />
    </SafeAreaView>
  );
}
