import { apiRequest } from "@/shared/api/client";
import type { Onboarding, OnboardingAnswer, UserProfile } from "@/shared/api/generated/shoply";

export interface SaveOnboardingInput {
  nickname?: string;
  categoryIds?: string[];
  skipped?: boolean;
}

export async function saveOnboarding(input: SaveOnboardingInput) {
  const nickname = input.nickname?.trim();

  if (nickname) {
    await apiRequest<UserProfile>("/users/me/profile", {
      method: "PATCH",
      body: JSON.stringify({ nickname })
    });
  }

  const answers: OnboardingAnswer[] = [
    {
      answerType: "profile_setup",
      categoryId: null,
      brandId: null,
      answerPayload: {
        nickname: nickname ?? null,
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
