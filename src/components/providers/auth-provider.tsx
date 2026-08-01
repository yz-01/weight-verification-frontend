"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";

import type { CurrentUser } from "@/interfaces/auth";
import { clearTokens, getSessionPortal, hasSession } from "@/lib/auth-token";
import { portalLoginPath } from "@/lib/portal";
import * as authService from "@/services/auth.service";

export const CURRENT_USER_KEY = ["auth", "me"] as const;

interface AuthContextValue {
  user: CurrentUser | null;
  /** True until the first session lookup settles, so guards do not flash. */
  isLoading: boolean;
  /** Check one permission code. Superusers hold everything. */
  can: (code: string) => boolean;
  /** True if the user holds at least one of the codes. */
  canAny: (codes: string[]) => boolean;
  setUser: (user: CurrentUser) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // The session lives in the query cache rather than in component state, so
  // that a profile update and the shell read the same record and neither can
  // go stale against the other.
  const { data, isPending, isFetched } = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: async () => {
      try {
        return await authService.getMe();
      } catch {
        // A token that is present but no longer accepted: expired, revoked, or
        // the account was suspended. Drop it rather than leaving the shell in
        // a half-signed-in state.
        clearTokens();
        return null;
      }
    },
    // Nothing to ask about without a token, and asking would 401 on every load
    // of the sign-in page.
    enabled: hasSession(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const user = data ?? null;
  const isLoading = hasSession() && isPending && !isFetched;

  const setUser = useCallback(
    async (next: CurrentUser) => {
      // Login pages remain reachable while a session exists. A person can
      // therefore switch accounts without first pressing Sign out; clear the
      // previous tenant's requests before publishing the new account.
      await queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] !== CURRENT_USER_KEY[0] ||
          query.queryKey[1] !== CURRENT_USER_KEY[1],
      });
      queryClient.setQueryData(CURRENT_USER_KEY, next);
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    const portal = getSessionPortal();
    try {
      await authService.logout();
    } catch {
      // The service clears local tokens even when the revocation request
      // cannot reach the API. Signing out must still finish while offline.
    } finally {
      // Stop requests owned by the old account before clearing their results.
      // Keep the auth query itself alive and explicitly set it to null:
      // removing it while this provider is still observing it can leave the
      // observer on the old User until a full page reload, briefly showing the
      // previous account after the next sign-in.
      await queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] !== CURRENT_USER_KEY[0] ||
          query.queryKey[1] !== CURRENT_USER_KEY[1],
      });
      queryClient.setQueryData(CURRENT_USER_KEY, null);
      // Keep the last portal marker. The signed-out shell also observes the
      // user becoming null; retaining this value makes every redirect converge
      // on the same branded login instead of racing back to generic `/login`.
      router.replace(portalLoginPath(portal));
    }
  }, [queryClient, router]);

  const permissions = useMemo(
    () => new Set(user?.permissions ?? []),
    [user?.permissions],
  );

  const can = useCallback(
    (code: string) => {
      if (user === null) return false;
      if (user.is_superuser) return true;
      return permissions.has(code);
    },
    [user, permissions],
  );

  const canAny = useCallback(
    (codes: string[]) => codes.some((code) => can(code)),
    [can],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, can, canAny, setUser, refresh, signOut }),
    [user, isLoading, can, canAny, setUser, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
