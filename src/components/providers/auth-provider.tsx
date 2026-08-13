"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { CurrentUser } from "@/interfaces/auth";
import {
  clearFieldTokens,
  clearTokens,
  getSessionPortal,
  hasFieldSession,
  hasSession,
  isFieldStandaloneApp,
  isFieldSessionPath,
} from "@/lib/auth-token";
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
  setUser: (user: CurrentUser) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const subscribeStandaloneMode = () => () => {};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const fieldApp = useSyncExternalStore(
    subscribeStandaloneMode,
    isFieldStandaloneApp,
    () => false,
  );
  const fieldSession = isFieldSessionPath(pathname) || fieldApp;
  const isFieldCredentialExchange = [
    "/trace/field-activate",
    "/trace/field-login",
    "/trace/field-ready",
    "/field-pwa-bootstrap",
  ].includes(pathname);
  // Field Staff uses an isolated device session. Checking the standard
  // account token here makes a deep-linked supplier QR open the PIN page even
  // though the Field Staff device is already signed in.
  const sessionPresent = fieldSession ? hasFieldSession() : hasSession();
  const currentUserKey = useMemo(
    () => [...CURRENT_USER_KEY, fieldSession ? "field" : "standard"] as const,
    [fieldSession],
  );

  useEffect(() => {
    if (fieldApp && !isFieldSessionPath(pathname)) {
      router.replace("/field-staff");
    }
  }, [fieldApp, pathname, router]);

  // The session lives in the query cache rather than in component state, so
  // that a profile update and the shell read the same record and neither can
  // go stale against the other.
  const { data, isPending, isFetched } = useQuery({
    queryKey: currentUserKey,
    queryFn: async () => {
      try {
        return await authService.getMe();
      } catch {
        // A token that is present but no longer accepted: expired, revoked, or
        // the account was suspended. Drop it rather than leaving the shell in
        // a half-signed-in state.
        if (fieldSession) clearFieldTokens();
        else clearTokens();
        return null;
      }
    },
    // Nothing to ask about without a token, and asking would 401 on every load
    // of the sign-in page.
    enabled: sessionPresent && !isFieldCredentialExchange,
    // Roles are editable while their users are signed in. Keep the shell's
    // menu close to the backend's live permission decision without requiring
    // a logout after an administrator changes a role.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const user = data ?? null;
  const isLoading =
    sessionPresent && !isFieldCredentialExchange && isPending && !isFetched;

  const setUser = useCallback(
    (next: CurrentUser) => {
      // Login pages remain reachable while a session exists. A person can
      // therefore switch accounts without first pressing Sign out. Publish
      // the new account immediately; cancellation is intentionally not
      // awaited because a slow request from the previous tenant must never
      // hold the login screen open or block the dashboard navigation.
      void queryClient.cancelQueries(
        {
          predicate: (query) =>
            query.queryKey[0] !== CURRENT_USER_KEY[0] ||
            query.queryKey[1] !== CURRENT_USER_KEY[1],
        },
        { silent: true },
      );
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] !== CURRENT_USER_KEY[0] ||
          query.queryKey[1] !== CURRENT_USER_KEY[1],
      });
      queryClient.setQueryData(currentUserKey, next);
    },
    [currentUserKey, queryClient],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: currentUserKey });
  }, [currentUserKey, queryClient]);

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
      queryClient.setQueryData(currentUserKey, null);
      // Keep the last portal marker. The signed-out shell also observes the
      // user becoming null; retaining this value makes every redirect converge
      // on the same branded login instead of racing back to generic `/login`.
      router.replace(fieldSession ? "/trace/field-login" : portalLoginPath(portal));
    }
  }, [currentUserKey, fieldSession, queryClient, router]);

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
