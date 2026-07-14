import { Redirect, Tabs } from "expo-router";
import { useSession } from "@/app/providers/session-provider";
import { FloatingTabBar } from "@/widgets/floating-tab-bar";

export default function TabsLayout() {
  const { user, initializing, hasRequiredConsents, policyStateLoaded, onboardingCompleted } =
    useSession();

  if (initializing || (user && !policyStateLoaded)) {
    return null;
  }

  if (!user) return <Redirect href="/login" />;
  if (!hasRequiredConsents) return <Redirect href="/policies/consents" />;
  if (!onboardingCompleted) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true
      }}
    >
      <Tabs.Screen name="home" options={{ title: "홈" }} />
      <Tabs.Screen name="search" options={{ title: "검색" }} />
      <Tabs.Screen
        name="create"
        options={{ title: "리뷰등록", tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen name="shoply" options={{ title: "쇼플리" }} />
      <Tabs.Screen name="my" options={{ title: "개인정보" }} />
      <Tabs.Screen
        name="shopi"
        options={{ href: null, title: "쇼피", tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="rewards"
        options={{ href: null, title: "활동금", tabBarStyle: { display: "none" } }}
      />
    </Tabs>
  );
}
