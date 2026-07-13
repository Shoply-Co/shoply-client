import { apiRequest } from "@/shared/api/client";
import type { AccountDeactivationDuration, AccountStatusChange } from "@/shared/api/generated/shoply";

export const ACCOUNT_DELETION_CONFIRMATION = "탈퇴하겠습니다.";

export function deactivateAccount(duration: AccountDeactivationDuration) {
  return apiRequest<AccountStatusChange>("/users/me/deactivation", {
    method: "POST",
    body: JSON.stringify({ duration })
  });
}

export async function deleteAccount(confirmation: string) {
  await apiRequest<void>("/users/me", {
    method: "DELETE",
    body: JSON.stringify({ confirmation })
  });
}

export type { AccountDeactivationDuration };
