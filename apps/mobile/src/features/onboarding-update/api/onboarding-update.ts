import { apiRequest } from "@/shared/api/client";
import type { Onboarding, OnboardingAnswer, UserProfile } from "@/shared/api/generated/shoply";

export interface SaveOnboardingInput {
  nickname?: string;
  profileImageUrl?: string | null;
  categoryIds?: string[];
  skipped?: boolean;
}

export async function saveOnboarding(input: SaveOnboardingInput) {
  const nickname = input.nickname?.trim();

  if (nickname || input.profileImageUrl !== undefined) {
    await apiRequest<UserProfile>("/users/me/profile", {
      method: "PATCH",
      body: JSON.stringify({
        ...(nickname ? { nickname } : {}),
        ...(input.profileImageUrl !== undefined ? { profileImageUrl: input.profileImageUrl } : {})
      })
    });
  }

  const answers: OnboardingAnswer[] = [
    {
      answerType: "profile_setup",
      categoryId: null,
      brandId: null,
      answerPayload: {
        nickname: nickname ?? null,
        profileImageAdded: Boolean(input.profileImageUrl),
        skipped: Boolean(input.skipped)
      }
    },
    ...(input.categoryIds ?? []).map((categoryId) => ({
      answerType: "preferred_category",
      categoryId,
      brandId: null,
      answerPayload: {}
    }))
  ];

  return apiRequest<Onboarding>("/users/me/onboarding", {
    method: "PUT",
    body: JSON.stringify({
      completed: true,
      answers
    })
  });
}
