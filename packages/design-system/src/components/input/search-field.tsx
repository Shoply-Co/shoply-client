import { Search, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View
} from "react-native";
import { useShoplyTheme } from "../../themes/theme-provider";

interface SearchFieldProps extends TextInputProps {
  onClear?: () => void;
  loading?: boolean;
}

export function SearchField({ value, onClear, loading = false, style, ...props }: SearchFieldProps) {
  const theme = useShoplyTheme();
  const token = theme.component.input;
  const iconColor = theme.semantic.color.textMuted;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: token.background,
          borderColor: token.border,
          borderRadius: theme.semantic.radius.pill
        }
      ]}
    >
      <Search size={19} color={iconColor} />
      <TextInput
        {...props}
        value={value}
        placeholderTextColor={token.placeholder}
        style={[
          styles.input,
          {
            color: token.text
          },
          style
        ]}
      />
      {loading ? <ActivityIndicator size="small" color={theme.semantic.color.primary} /> : null}
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
          onPress={onClear}
          hitSlop={8}
        >
          <X size={18} color={iconColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 14
  },
  input: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    padding: 0
  }
});
