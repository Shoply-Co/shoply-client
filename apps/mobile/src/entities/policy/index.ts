export {
  fetchPolicyConsentState,
  getCurrentConsent,
  getMissingRequiredPolicies,
  isPolicyConsented,
  isPolicyRequired,
  policyScopeLabel,
  recordPolicyConsent,
  usePolicyConsentState
} from "./api/policy-queries";
export type { PolicyConsentState } from "./api/policy-queries";
