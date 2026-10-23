"use client";

import { CloudOff, Loader2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeMenu } from "@/components/layout/theme-choice";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { SessionUnreachable } from "@/components/shared/session-unreachable";
import { OfflineStatus } from "@/components/shared/offline-status";
import { BrandIcon } from "@/components/shared/brand-icon";
import { Button } from "@/components/ui/button";
import { clearFieldTokens, isStandaloneApp, markFieldAppContext } from "@/lib/auth-token";
import { fieldWorkspaceSignIn } from "@/lib/field-install";
import { replacePage } from "@/lib/portal";
import { keepShellPageStored } from "@/lib/shell-cache";
import { FieldLocationTracker } from "@/components/field-staff/field-location-tracker";
import { FieldInstallBanner } from "@/components/field-staff/field-install-banner";
import { FieldManifestToken } from "@/components/field-staff/field-manifest-token";
import { FieldWorkspaceAddress } from "@/components/field-staff/field-workspace-address";
import { canUseRealtime, useOrderRealtime } from "@/hooks/use-order-realtime";
import { usePhoneOffline } from "@/hooks/use-phone-offline";

const FIELD_REALTIME_KEYS: never[] = [];

export function FieldStaffShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading, sessionUnreachable, signOut } = useAuth();
  const offline = usePhoneOffline();
  const allowed = user?.portal === "MSE_TRACE" && user.is_field_staff;
  useOrderRealtime(
    FIELD_REALTIME_KEYS,
    true,
    canUseRealtime(user?.permissions ?? [], Boolean(user?.is_platform_staff)),
  );

  useEffect(() => markFieldAppContext(), []);

  // H12: keep the field app's home in the worker's shell cache once it is
  // open online, so the phone opens it offline. Every way in here is a soft
  // navigation (`router.replace`), which the worker never stores by itself.
  // The plain address only - never the bootstrap or sign-in link.
  useEffect(() => {
    if (!allowed) return;
    return keepShellPageStored("/field-staff");
  }, [allowed]);

  useEffect(() => {
    /* A phone on a bad signal keeps its session. Sending it to the PIN screen
       throws away whatever has not synced yet (F-365). */
    if (sessionUnreachable) return;
    if (!isLoading && user === null) {
      const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      // A hand-off on the address (an iPhone app added from this page, first
      // open, empty storage) signs in with it and comes straight back here.
      // A full page load, not a route change: see `replacePage`.
      replacePage(fieldWorkspaceSignIn(currentPath, isStandaloneApp()));
    } else if (!isLoading && user !== null && !allowed) {
      clearFieldTokens();
      replacePage("/trace/field-login");
    }
  }, [allowed, isLoading, pathname, searchParams, sessionUnreachable, user]);

  if (sessionUnreachable) return <SessionUnreachable />;

  if (isLoading || user === null || !allowed) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-background">
      <FieldLocationTracker />
      <FieldManifestToken />
      <FieldWorkspaceAddress />
      <header className="sticky top-0 z-40 border-b border-sidebar-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center gap-2 px-4 py-2.5">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-panel-border bg-card p-1 shadow-glow-sm">
            <BrandIcon
              branding={user.branding}
              alt={user.branding.company_name ?? user.branding.name}
            />
          </span>
          {user.avatar ? (
            <span className="size-9 shrink-0 overflow-hidden rounded-full border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatar}
                alt=""
                className="size-full object-cover"
              />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.company_name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <OfflineStatus />
            <NotificationButton />
            <ThemeMenu className="size-10 border-transparent bg-transparent" />
            <LanguageSwitcher className="size-10 rounded-lg px-0 [&_span]:hidden sm:w-auto sm:px-3 sm:[&_span]:inline" />
            <Button variant="ghost" size="icon" className="size-10" title={t("common.signOut")} onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Said once, calmly: without network the app still works and the
            records wait on the phone (Lucas 2026-10-23). */}
        {offline ? (
          <p
            role="status"
            data-testid="field-offline-line"
            className="flex items-center gap-2 border-t border-warning/30 bg-warning/10 px-4 py-2 text-xs leading-5 text-foreground"
          >
            <CloudOff className="size-4 shrink-0 text-warning" />
            {t("offline.fieldLine")}
          </p>
        ) : null}
      </header>
      <FieldInstallBanner />
      <main className="mx-auto min-w-0 w-full max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
