import { Redirect } from "expo-router";
import { useSession } from "@/app/providers/session-provider";

export default function IndexRoute() {
  const { user, initializing, hasRequiredConsents, policyStateLoaded, onboardingCompleted } = useSession();

  if (initializing || (user && !policyStateLoaded)) {
    return null;
  }

  if (!user) return <Redirect href="/login" />;
  if (!hasRequiredConsents) return <Redirect href="/policies/consents" />;
  if (!onboardingCompleted) return <Redirect href="/onboarding" />;

  return <Redirect href="/(tabs)/home" />;
}
