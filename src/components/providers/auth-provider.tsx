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
import { ApiError } from "@/interfaces/api";
import {
  clearFieldTokens,
  clearDriverTokens,
  clearTokens,
  getSessionPortal,
  hasFieldSession,
  hasDriverSession,
  hasSession,
  isDriverSessionPath,
  isDriverStandaloneApp,
  isFieldStandaloneApp,
  isFieldSessionPath,
} from "@/lib/auth-token";
import {
  cacheBranding,
  clearStandardBrandingForCompany,
} from "@/lib/branding";
import { isDriverOnlyAccount } from "@/lib/navigation";
import { portalLoginPath } from "@/lib/portal";
import * as authService from "@/services/auth.service";

export const CURRENT_USER_KEY = ["auth", "me"] as const;

interface AuthContextValue {
  user: CurrentUser | null;
  /** True until the first session lookup settles, so guards do not flash. */
  isLoading: boolean;
  /**
   * Credentials are held, but the server could not be asked who they belong
   * to - and the retries are spent (F-365).
   *
   * This is the third state the shells used to collapse into "signed out".
   * A 429, a 502 or no network is not a sign-out: the token is still valid,
   * and sending a site phone back to the PIN screen throws away work that has
   * not synced yet. Guards read this before they read `user === null`.
   */
  sessionUnreachable: boolean;
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
  const driverApp = useSyncExternalStore(
    subscribeStandaloneMode,
    isDriverStandaloneApp,
    () => false,
  );
  const fieldSession = isFieldSessionPath(pathname) || fieldApp;
  const driverSession = isDriverSessionPath(pathname) || driverApp;
  const isFieldCredentialExchange = [
    "/trace/field-activate",
    "/trace/field-login",
    "/trace/field-ready",
    "/field-pwa-bootstrap",
  ].includes(pathname);
  // Field Staff uses an isolated device session. Checking the standard
  // account token here makes a deep-linked supplier QR open the PIN page even
  // though the Field Staff device is already signed in.
  const sessionPresent = fieldSession
    ? hasFieldSession()
    : driverSession
      ? hasDriverSession()
      : hasSession();
  const currentUserKey = useMemo(
    () => [
      ...CURRENT_USER_KEY,
      fieldSession ? "field" : driverSession ? "driver" : "standard",
    ] as const,
    [driverSession, fieldSession],
  );

  useEffect(() => {
    if (fieldApp && !isFieldSessionPath(pathname)) {
      router.replace("/field-staff");
    }
  }, [fieldApp, pathname, router]);

  useEffect(() => {
    if (
      driverApp &&
      !isDriverSessionPath(pathname) &&
      !pathname.startsWith("/scrap/")
    ) {
      router.replace("/driver");
    }
  }, [driverApp, pathname, router]);

  // The session lives in the query cache rather than in component state, so
  // that a profile update and the shell read the same record and neither can
  // go stale against the other.
  const { data, isPending, isFetched, isError } = useQuery({
    queryKey: currentUserKey,
    queryFn: async () => {
      try {
        return await authService.getMe();
      } catch (error) {
        // A token that is present but no longer accepted: expired, revoked, or
        // the account was suspended. Drop it rather than leaving the shell in
        // a half-signed-in state.
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          if (fieldSession) clearFieldTokens();
          else if (driverSession) clearDriverTokens();
          else clearTokens();
          return null;
        }
        // A temporary network or server failure must not sign a field device
        // out. Keeping the last successful user lets offline work continue.
        throw error;
      }
    },
    // Nothing to ask about without a token, and asking would 401 on every load
    // of the sign-in page.
    enabled: sessionPresent && !isFieldCredentialExchange,
    // Roles are editable while their users are signed in. Keep the shell's
    // menu close to the backend's live permission decision without requiring
    // a logout after an administrator changes a role.
    staleTime: fieldSession ? 5_000 : 60_000,
    // Reissuing a field invitation revokes the old device on the backend.
    // Check the lightweight profile often enough for an open installed app to
    // leave the workspace promptly; returning to the app also checks at once.
    refetchInterval: fieldSession ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    /*
     * Retry the transient ones only. `retry: false` used to switch off
     * retrying for exactly the class of error that deserves it, and one 429 or
     * 502 ended with the person back at the sign-in screen (F-365).
     *
     * A refused credential is excluded explicitly rather than relying on the
     * `queryFn` catch above. `api-client` ends the session itself on a 401 -
     * clearing the tokens and navigating - so asking again three more times
     * re-enters that path and the repeated navigations fight each other, and
     * the person ends up on neither screen.
     */
    retry: (count, error) =>
      count < 3 &&
      !(error instanceof ApiError && [401, 403].includes(error.status)),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const user = data ?? null;
  const isLoading =
    sessionPresent && !isFieldCredentialExchange && isPending && !isFetched;
  /*
   * Tokens in hand, retries spent, still no answer. Not the same thing as
   * having no account, and the difference is what keeps a field device signed
   * in through a bad minute of signal.
   */
  const sessionUnreachable =
    sessionPresent && !isFieldCredentialExchange && isError && user === null;

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
      const driverAccount = isDriverOnlyAccount(
        next.portal,
        next.permissions,
        next.is_superuser,
      );
      if (driverAccount) {
        clearStandardBrandingForCompany(next.branding.company_id);
      }
      cacheBranding(
        next.branding,
        fieldSession,
        driverSession || driverAccount,
      );
      queryClient.setQueryData(currentUserKey, next);
    },
    [currentUserKey, driverSession, fieldSession, queryClient],
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
      router.replace(
        fieldSession
          ? "/trace/field-login"
          : driverSession
            ? "/scrap/login"
            : portalLoginPath(portal),
      );
    }
  }, [currentUserKey, driverSession, fieldSession, queryClient, router]);

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
    () => ({
      user,
      isLoading,
      sessionUnreachable,
      can,
      canAny,
      setUser,
      refresh,
      signOut,
    }),
    [
      user,
      isLoading,
      sessionUnreachable,
      can,
      canAny,
      setUser,
      refresh,
      signOut,
    ],
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
