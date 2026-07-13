import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { apiRequest } from "@/shared/api/client";
import { queryClient } from "@/shared/api/query-client";
import { clearTokens, readAccessToken, readRefreshToken, saveTokens } from "@/shared/storage/secure-store";
import { OAUTH_REDIRECT_URI } from "@/shared/config/constants";
import { fetchPolicyConsentState } from "@/entities/policy";

interface SessionUser {
  id: string;
  status: string;
  primaryEmail?: string | null;
  primaryEmailMasked?: string | null;
  onboardingCompleted?: boolean;
  ageGateStatus?: string;
  createdAt?: string;
}

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: SessionUser;
}

export interface DeactivatedAccountChallenge {
  requiresReactivation: true;
  reactivationToken: string;
  user: {
    id: string;
    status: "deactivated";
    primaryEmailMasked?: string | null;
    deactivatedAt?: string | null;
    deactivationEndsAt?: string | null;
  };
}

export type AuthCompletionResult =
  | { status: "authenticated" }
  | { status: "reactivation_required"; challenge: DeactivatedAccountChallenge };

type AuthCompletion = AuthSession | DeactivatedAccountChallenge;

interface SessionContextValue {
  user: SessionUser | null;
  initializing: boolean;
  hasRequiredConsents: boolean;
  policyStateLoaded: boolean;
  onboardingCompleted: boolean;
  completeOAuth: (
    provider: string,
    authorizationCode: string,
    state?: string,
    codeVerifier?: string,
    redirectUri?: string,
    identityToken?: string
  ) => Promise<AuthCompletionResult>;
  completeOAuthHandoff: (handoffCode: string) => Promise<AuthCompletionResult>;
  reactivateDeactivatedAccount: (reactivationToken: string) => Promise<void>;
  refreshSessionState: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const handoffCompletions = new Map<string, Promise<AuthCompletionResult>>();
const consumedHandoffCodes = new Set<string>();

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [hasRequiredConsents, setHasRequiredConsents] = useState(false);
  const [policyStateLoaded, setPolicyStateLoaded] = useState(true);

  const loadSessionState = useCallback(async (sessionUser?: SessionUser) => {
    setPolicyStateLoaded(false);

    let nextUser = sessionUser ?? null;
    try {
      const me = await apiRequest<SessionUser>("/users/me");
      nextUser = { ...sessionUser, ...me };
    } catch (error) {
      if (!nextUser) throw error;
    }

    setUser(nextUser);

    try {
      const policyState = await fetchPolicyConsentState();
      setHasRequiredConsents(policyState.hasRequiredConsents);
    } catch {
      setHasRequiredConsents(false);
    } finally {
      setPolicyStateLoaded(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function restore() {
      try {
        const token = await readAccessToken();
        const refreshToken = await readRefreshToken();

        if (!mounted) return;

        if (token && refreshToken) {
          const session = await apiRequest<AuthSession>("/auth/session/refresh", {
            method: "POST",
            auth: false,
            body: JSON.stringify({ refreshToken })
          });
          await saveTokens(session.accessToken, session.refreshToken);
          if (mounted) await loadSessionState(session.user);
        } else {
          setPolicyStateLoaded(true);
        }
      } catch {
        await clearTokens();
        if (!mounted) return;
        setUser(null);
        setHasRequiredConsents(false);
        setPolicyStateLoaded(true);
      } finally {
        if (mounted) setInitializing(false);
      }
    }

    void restore();

    return () => {
      mounted = false;
    };
  }, [loadSessionState]);

  const refreshSessionState = useCallback(async () => {
    const token = await readAccessToken();
    if (!token) {
      setUser(null);
      setHasRequiredConsents(false);
      setPolicyStateLoaded(true);
      return;
    }
    await loadSessionState(user ?? undefined);
  }, [loadSessionState, user]);

  const persistSession = useCallback(
    async (session: AuthSession) => {
      await saveTokens(session.accessToken, session.refreshToken);
      await loadSessionState(session.user);
    },
    [loadSessionState]
  );

  const handleAuthCompletion = useCallback(
    async (completion: AuthCompletion): Promise<AuthCompletionResult> => {
      if (isDeactivatedAccountChallenge(completion)) {
        return { status: "reactivation_required", challenge: completion };
      }

      await persistSession(completion);
      return { status: "authenticated" };
    },
    [persistSession]
  );

  const clearLocalSession = useCallback(async () => {
    await clearTokens();
    queryClient.clear();
    setUser(null);
    setHasRequiredConsents(false);
    setPolicyStateLoaded(true);
  }, []);

  const completeOAuth = useCallback(
    async (
      provider: string,
      authorizationCode: string,
      state?: string,
      codeVerifier?: string,
      redirectUri: string = OAUTH_REDIRECT_URI,
      identityToken?: string
    ) => {
      const completion = await apiRequest<AuthCompletion>(`/auth/oauth/${provider}/callback`, {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          authorizationCode,
          redirectUri,
          codeVerifier,
          state,
          identityToken
        })
      });
      return handleAuthCompletion(completion);
    },
    [handleAuthCompletion]
  );

  const completeOAuthHandoff = useCallback(
    async (handoffCode: string) => {
      if (consumedHandoffCodes.has(handoffCode)) return { status: "authenticated" } as const;

      const existing = handoffCompletions.get(handoffCode);
      if (existing) {
        return existing;
      }

      const completion = apiRequest<AuthCompletion>("/auth/oauth/session-handoff", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ handoffCode })
      })
        .then(async (authCompletion) => {
          const result = await handleAuthCompletion(authCompletion);
          consumedHandoffCodes.add(handoffCode);
          return result;
        })
        .finally(() => {
          handoffCompletions.delete(handoffCode);
        });

      handoffCompletions.set(handoffCode, completion);
      return completion;
    },
    [handleAuthCompletion]
  );

  const reactivateDeactivatedAccount = useCallback(
    async (reactivationToken: string) => {
      const session = await apiRequest<AuthSession>("/auth/account/reactivation", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ reactivationToken })
      });
      await persistSession(session);
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    const refreshToken = await readRefreshToken();
    if (refreshToken) {
      try {
        await apiRequest<void>("/auth/session", {
          method: "DELETE",
          body: JSON.stringify({ refreshToken })
        });
      } catch {
        // Local cleanup must still happen when the backend is unavailable.
      }
    }
    await clearLocalSession();
    router.replace("/login");
  }, [clearLocalSession]);

  const value = useMemo(
    () => ({
      user,
      initializing,
      hasRequiredConsents,
      policyStateLoaded,
      onboardingCompleted: Boolean(user?.onboardingCompleted),
      completeOAuth,
      completeOAuthHandoff,
      reactivateDeactivatedAccount,
      refreshSessionState,
      logout
    }),
    [
      user,
      initializing,
      hasRequiredConsents,
      policyStateLoaded,
      completeOAuth,
      completeOAuthHandoff,
      reactivateDeactivatedAccount,
      refreshSessionState,
      logout
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

function isDeactivatedAccountChallenge(value: AuthCompletion): value is DeactivatedAccountChallenge {
  return Boolean(value && "requiresReactivation" in value && value.requiresReactivation);
}
