"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";

import type { CurrentUser } from "@/interfaces/auth";
import { clearTokens, hasSession } from "@/lib/auth-token";
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
  setUser: (user: CurrentUser) => void;
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
    (next: CurrentUser) => queryClient.setQueryData(CURRENT_USER_KEY, next),
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await authService.logout();
    // Clear everything, not just the session: a cached company list from the
    // previous account must not be visible to whoever signs in next.
    queryClient.clear();
    router.replace("/login");
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
