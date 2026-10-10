"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  PackCollectDock,
  PackCollectProvider,
} from "@/components/contractor-ops/pack-collect";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardToolbar } from "@/components/layout/dashboard-toolbar";
import { PageTitleOverrideProvider } from "@/components/layout/page-title-override";
import {
  HazardPopupStack,
  useHazardPopup,
} from "@/components/notifications/hazard-popup";
import {
  TaskCardDockProvider,
  TaskCardDockSlot,
} from "@/components/notifications/task-card-dock";
import { useAuth } from "@/components/providers/auth-provider";
import { CurrentProjectProvider } from "@/components/providers/current-project-provider";
import { SessionUnreachable } from "@/components/shared/session-unreachable";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { getSessionPortal } from "@/lib/auth-token";
import {
  firstAllowedDashboardPath,
  isDriverOnlyAccount,
  isRouteAllowed,
} from "@/lib/navigation";
import { portalLoginPath, redirectWithFallback } from "@/lib/portal";
import { canUseRealtime, useOrderRealtime } from "@/hooks/use-order-realtime";

const GLOBAL_REALTIME_KEYS: never[] = [];

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
  const { user, isLoading, sessionUnreachable } = useAuth();
  const isDriverOnly =
    user !== null &&
    isDriverOnlyAccount(user.portal, user.permissions, user.is_superuser);
  const isFieldStaff = user?.is_field_staff ?? false;
  // One stream at the signed-in shell keeps every list/detail screen current,
  // including pages that do not have a feature-specific subscription. The
  // same stream brings the hazard pop-up cards (C3).
  const hazardPopup = useHazardPopup();
  useOrderRealtime(
    GLOBAL_REALTIME_KEYS,
    true,
    canUseRealtime(user?.permissions ?? [], Boolean(user?.is_platform_staff)),
    hazardPopup.onEvent,
  );

  useEffect(() => {
    if (sessionUnreachable) return;
    if (!isLoading && user === null) {
      redirectWithFallback(router, portalLoginPath(getSessionPortal()));
      return;
    }
    if (!isLoading && user !== null && isDriverOnly) {
      redirectWithFallback(router, "/driver");
      return;
    }
    if (!isLoading && user !== null && isFieldStaff) {
      redirectWithFallback(router, "/field-staff");
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
  }, [isDriverOnly, isFieldStaff, isLoading, pathname, sessionUnreachable, user, router]);

  const isAllowed =
    user !== null &&
    !isDriverOnly &&
    !isFieldStaff &&
    isRouteAllowed(
      user.portal,
      user.features,
      pathname,
      user.permissions,
      user.is_superuser,
    );

  /* Before the signed-out branch: a session we could not ask about is not a
     session that ended (F-365). */
  if (sessionUnreachable) return <SessionUnreachable />;

  if (isLoading || user === null || !isAllowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TaskCardDockProvider>
      {/* 顶栏「当前项目」: chosen once, read by every page below (B13). */}
      <CurrentProjectProvider>
      {/* Multi Engine's 「正在挑选资料」 follows the person across modules
          (2026-10-10, 添加资料及勾选关联). */}
      <PackCollectProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-dvh min-w-0 overflow-hidden">
          {/* A page may name itself more precisely than its menu entry (B14). */}
          <PageTitleOverrideProvider>
            <DashboardToolbar />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-5">
              {children}
            </div>
          </PageTitleOverrideProvider>
          {/* The package being put together, shrunk to a strip under the
              page - in the layout, like the task cards, so it covers no row. */}
          <PackCollectDock />
          {/* The task cards, in the layout rather than over it (B01). */}
          <TaskCardDockSlot />
        </SidebarInset>
      </SidebarProvider>
      </PackCollectProvider>
      </CurrentProjectProvider>
      {/* Hazard cards float for eight seconds, then go (C3). */}
      <HazardPopupStack
        cards={hazardPopup.cards}
        now={hazardPopup.now}
        onDismiss={hazardPopup.dismiss}
      />
    </TaskCardDockProvider>
  );
}
