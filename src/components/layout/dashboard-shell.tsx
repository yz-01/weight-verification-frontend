"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuth } from "@/components/providers/auth-provider";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getSessionPortal } from "@/lib/auth-token";
import {
  firstAllowedDashboardPath,
  isDriverOnlyAccount,
  isRouteAllowed,
} from "@/lib/navigation";
import { portalLoginPath, redirectWithFallback } from "@/lib/portal";

/**
 * The signed-in shell, and the guard in front of it.
 *
 * The guard runs on the client because the session is a bearer token the
 * server never sees. It renders a spinner rather than the shell while the
 * session is still resolving, so a signed-out visitor never sees a frame of
 * someone else's navigation before the redirect lands.
 *
 * The page slot is exactly `100dvh` tall with `py-10` of padding, which is the
 * 5rem every table page subtracts to size its own inline scroll region.
 * Nothing may be added above it that occupies vertical space; the sidebar
 * trigger floats instead, for the same reason.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const isDriverOnly =
    user !== null &&
    isDriverOnlyAccount(user.portal, user.permissions, user.is_superuser);

  useEffect(() => {
    if (!isLoading && user === null) {
      redirectWithFallback(router, portalLoginPath(getSessionPortal()));
      return;
    }
    if (!isLoading && user !== null && isDriverOnly) {
      redirectWithFallback(router, "/driver");
      return;
    }
    if (
      !isLoading &&
      user !== null &&
      !isRouteAllowed(
        user.portal,
        user.features,
        pathname,
      user.permissions,
      user.is_superuser,
    )
    ) {
      redirectWithFallback(
        router,
        firstAllowedDashboardPath(user.portal, user.features),
      );
    }
  }, [isDriverOnly, isLoading, pathname, user, router]);

  const isAllowed =
    user !== null &&
    !isDriverOnly &&
    isRouteAllowed(
      user.portal,
      user.features,
      pathname,
      user.permissions,
      user.is_superuser,
    );

  if (isLoading || user === null || !isAllowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-dvh min-w-0 overflow-hidden">
        <SidebarTrigger className="fixed bottom-5 left-5 z-40 h-11 w-11 rounded-full border bg-card shadow-lg md:hidden" />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10 lg:px-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
