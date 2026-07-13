import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/client";
import type { PolicyScope, PolicyVersion, UserConsent } from "@/shared/api/generated/shoply";

const optionalScopes = new Set<PolicyScope>([
  "marketing_optional",
  "personalization_optional",
  "external_marketing_optional"
]);

export const policyScopeLabel: Record<PolicyScope, string> = {
  terms: "서비스 이용약관",
  privacy_required: "개인정보 수집 및 이용",
  content_license: "콘텐츠 이용 동의",
  community_policy: "커뮤니티 정책",
  disclosure_policy: "광고/협찬 고지 정책",
  marketing_optional: "마케팅 정보 수신",
  personalization_optional: "개인화 추천",
  external_marketing_optional: "외부 마케팅 활용",
  reward_policy: "활동금 정책",
  payout_privacy: "지급 개인정보 처리"
};

export interface PolicyConsentState {
  policies: PolicyVersion[];
  consents: UserConsent[];
  missingRequiredPolicies: PolicyVersion[];
  hasRequiredConsents: boolean;
}

export function usePolicyConsentState(enabled: boolean) {
  return useQuery({
    queryKey: ["policy", "consent-state"],
    enabled,
    queryFn: fetchPolicyConsentState,
    retry: 1
  });
}

export async function fetchPolicyConsentState(): Promise<PolicyConsentState> {
  const [policies, consents] = await Promise.all([
    apiRequest<PolicyVersion[]>("/policies/current", { auth: false }),
    apiRequest<UserConsent[]>("/users/me/consents")
  ]);
  const missingRequiredPolicies = getMissingRequiredPolicies(policies, consents);

  return {
    policies,
    consents,
    missingRequiredPolicies,
    hasRequiredConsents: missingRequiredPolicies.length === 0 && policies.length > 0
  };
}

export async function recordPolicyConsent(policy: PolicyVersion, consented: boolean) {
  return apiRequest<UserConsent>("/users/me/consents", {
    method: "POST",
    body: JSON.stringify({
      policyVersionId: policy.id,
      scope: policy.policyType,
      consented
    })
  });
}

export function isPolicyRequired(policy: PolicyVersion) {
  if (typeof policy.required === "boolean") return policy.required;
  return !optionalScopes.has(policy.policyType);
}

export function getMissingRequiredPolicies(policies: PolicyVersion[], consents: UserConsent[]) {
  return policies.filter(isPolicyRequired).filter((policy) => !isPolicyConsented(policy, consents));
}

export function isPolicyConsented(policy: PolicyVersion, consents: UserConsent[]) {
  const current = getCurrentConsent(policy, consents);
  return Boolean(current?.consented && !current.withdrawnAt);
}

export function getCurrentConsent(policy: PolicyVersion, consents: UserConsent[]) {
  return consents
    .filter((consent) => consent.policyVersionId === policy.id)
    .sort((left, right) => Date.parse(right.consentedAt) - Date.parse(left.consentedAt))[0];
}
