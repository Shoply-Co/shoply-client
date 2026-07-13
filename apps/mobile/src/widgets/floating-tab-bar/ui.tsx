import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Home, Plus, Search, User } from "lucide-react-native";
import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { ShoplySMonogram } from "@/shared/ui/brand";

const icons = {
  home: Home,
  create: Plus,
  search: Search,
  my: User
};

const labels = {
  home: "홈",
  create: "리뷰등록",
  search: "검색",
  my: "개인정보"
};

type VisibleTabName = keyof typeof icons | "shoply";

function isVisibleTabName(name: string): name is VisibleTabName {
  return name === "shoply" || Object.prototype.hasOwnProperty.call(icons, name);
}

export function FloatingTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const theme = useShoplyTheme();
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options;

  const focusedRouteName = String(focusedRoute.name);

  if (focusedOptions?.tabBarStyle?.display === "none" || !isVisibleTabName(focusedRouteName)) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outer,
        {
          bottom: Math.max(insets.bottom, 10)
        }
      ]}
    >
      <BlurView
        intensity={theme.semantic.mode === "dark" ? 42 : 58}
        tint={theme.semantic.mode === "dark" ? "dark" : "light"}
        style={[
          styles.bar,
          {
            borderColor: theme.component.tabBar.border,
            backgroundColor: theme.component.tabBar.background
          },
          theme.semantic.shadow.subtle
        ]}
      >
        {state.routes.map((route: any, index: number) => {
          const options = descriptors[route.key]?.options;
          const routeName = String(route.name);
          if (options?.href === null || !isVisibleTabName(routeName)) return null;

          const focused = state.index === index;
          const key = routeName;
          const Icon = key === "shoply" ? null : icons[key];
          const label = key === "shoply" ? "쇼플리" : labels[key];

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true
            });

            void Haptics.selectionAsync();

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              emphasized={key === "create"}
              accessibilityLabel={key === "shoply" ? "쇼플리 매거진 탭" : undefined}
              icon={key === "shoply" ? (
                <ShoplySMonogram
                  size={21}
                  color={focused ? theme.component.tabBar.active : theme.component.tabBar.inactive}
                />
              ) : Icon ? (
                <Icon
                  size={20}
                  color={
                    focused && key === "create"
                      ? theme.semantic.color.textInverse
                      : focused
                        ? theme.component.tabBar.active
                        : theme.component.tabBar.inactive
                  }
                />
              ) : null}
              onPress={onPress}
            />
          );
        })}
      </BlurView>
    </View>
  );
}

function TabItem({
  label,
  accessibilityLabel,
  icon,
  focused,
  emphasized,
  onPress
}: {
  label: string;
  accessibilityLabel?: string;
  icon: ReactNode;
  focused: boolean;
  emphasized: boolean;
  onPress: () => void;
}) {
  const theme = useShoplyTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label} 탭`}
      accessibilityState={focused ? { selected: true } : {}}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.92, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      style={[
        styles.item,
        emphasized ? styles.emphasizedItem : null,
        focused
          ? {
              backgroundColor: emphasized ? theme.semantic.color.primary : theme.semantic.color.primarySoft
            }
          : null
      ]}
    >
      <Animated.View style={[styles.itemInner, animatedStyle]}>
        {icon}
        {focused ? (
          <ShoplyText
            variant="caption"
            style={[
              styles.itemLabel,
              { color: emphasized ? theme.semantic.color.textInverse : theme.component.tabBar.active }
            ]}
            numberOfLines={1}
          >
            {label}
          </ShoplyText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0
  },
  bar: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    maxWidth: "96%",
    minHeight: 64,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 8
  },
  item: {
    alignItems: "center",
    borderRadius: 16,
    flexShrink: 1,
    flexDirection: "row",
    gap: 5,
    height: 48,
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: 8
  },
  itemInner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center"
  },
  emphasizedItem: {
    minWidth: 48
  },
  itemLabel: {
    maxWidth: 62
  }
});
