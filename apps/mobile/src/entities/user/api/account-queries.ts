import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/client";
import type {
  MyUser,
  PayoutProfile,
  RewardSummary,
  TaxProfile,
  UserProfile
} from "@/shared/api/generated/shoply";

export const accountOverviewQueryKey = ["account", "overview"] as const;
export const categoryFilterPreferencesQueryKey = (categoryId?: string | null) =>
  ["account", "category-filter-preferences", categoryId ?? "all"] as const;

export interface AccountCategoryFilterPreferenceValue {
  id: string;
  userId: string;
  categoryId: string;
  filterKey: string;
  filterLabel: string;
  filterScope: string;
  valueType: string;
  valuePayload: { values?: string[] };
  normalizedValues: string[];
  displayValues: string[];
  enabled: boolean;
  sortOrder: number;
}

export interface AccountCategoryFilterPreferences {
  categoryId: string | null;
  filterValues: AccountCategoryFilterPreferenceValue[];
}

export interface AccountCategoryFilterPreferenceInput {
  key: string;
  values: string[];
}

export function useAccountOverview(enabled: boolean) {
  return useQuery({
    queryKey: accountOverviewQueryKey,
    enabled,
    queryFn: fetchAccountOverview,
    retry: 1
  });
}

export function useSuspenseAccountOverview() {
  return useSuspenseQuery({
    queryKey: accountOverviewQueryKey,
    queryFn: fetchAccountOverview,
    retry: 1
  });
}

export function useCategoryFilterPreferences(categoryId?: string | null, enabled = true) {
  return useQuery({
    queryKey: categoryFilterPreferencesQueryKey(categoryId),
    enabled: enabled && Boolean(categoryId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      return apiRequest<AccountCategoryFilterPreferences>(
        `/users/me/category-filter-preferences${params.size ? `?${params.toString()}` : ""}`
      );
    },
    retry: 1
  });
}

export function saveCategoryFilterPreferences(input: {
  categoryId: string;
  filterValues: AccountCategoryFilterPreferenceInput[];
  enabled?: boolean;
}) {
  return apiRequest<AccountCategoryFilterPreferences>("/users/me/category-filter-preferences", {
    method: "PUT",
    body: JSON.stringify({
      categoryId: input.categoryId,
      filterValues: input.filterValues,
      enabled: input.enabled ?? true
    })
  });
}

async function fetchAccountOverview() {
  const [me, profile, rewards, payoutProfile, taxProfile] = await Promise.all([
    apiRequest<MyUser>("/users/me"),
    optionalRequest<UserProfile>("/users/me/profile"),
    optionalRequest<RewardSummary>("/users/me/rewards/summary"),
    optionalRequest<PayoutProfile>("/users/me/payout-profile"),
    optionalRequest<TaxProfile>("/users/me/tax-profile")
  ]);

  return {
    me,
    profile,
    rewards,
    payoutProfile,
    taxProfile
  };
}

async function optionalRequest<T>(path: string) {
  try {
    return await apiRequest<T>(path);
  } catch {
    return null;
  }
}
