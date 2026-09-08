"use client";

import {
  Bell,
  ClipboardList,
  Home,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { DriverInstallPrompt } from "@/components/driver/driver-install-prompt";
import { DriverLiveTracker } from "@/components/driver/driver-live-tracker";
import { useAuth } from "@/components/providers/auth-provider";
import { useOrderRealtime } from "@/hooks/use-order-realtime";

const DRIVER_REALTIME_KEYS = [["driver"], ["driver-tasks"], ["notifications"]] as const;
import { OfflineStatus } from "@/components/shared/offline-status";
import { Button } from "@/components/ui/button";
import {
  firstAllowedDashboardPath,
  isDriverOnlyAccount,
} from "@/lib/navigation";
import { markDriverAppContext } from "@/lib/auth-token";
import { redirectWithFallback } from "@/lib/portal";

/**
 * The driver's shell. Deliberately not the console's.
 *
 * A driver holds a phone in one hand at the edge of a site, often in sunlight,
 * sometimes in gloves. Almost every decision here follows from that: no
 * sidebar, no table, one column, and controls sized for a thumb rather than a
 * cursor.
 *
 * It is a web page rather than an app because a driver who changes phones or
 * works for two yards should not be installing anything. The cost is that it
 * needs a connection — the client accepted that for the first release, with
 * offline queueing left as a later change.
 */
export function DriverShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  useOrderRealtime(DRIVER_REALTIME_KEYS);
  const isDriverOnly =
    user !== null &&
    isDriverOnlyAccount(user.portal, user.permissions, user.is_superuser);

  useEffect(() => {
    markDriverAppContext();
  }, []);

  useEffect(() => {
    if (!isLoading && user === null) {
      redirectWithFallback(router, "/scrap/login");
      return;
    }
    if (!isLoading && user !== null && !isDriverOnly) {
      redirectWithFallback(
        router,
        firstAllowedDashboardPath(user.portal, user.features),
      );
    }
  }, [isDriverOnly, isLoading, user, router]);

  if (isLoading || user === null || !isDriverOnly) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <DriverLiveTracker />
      {/* Sticky, because the driver's own name is how they know the phone is
          signed in as them and not as whoever used it last. */}
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.full_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.company_name}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <OfflineStatus />
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground"
              title={t("common.signOut")}
              onClick={() => void signOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-24">
        <DriverInstallPrompt />
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid w-full max-w-lg grid-cols-5">
          {[
            { href: "/driver", label: "driver.nav.home", icon: Home },
            { href: "/driver/jobs", label: "driver.nav.jobs", icon: ClipboardList },
            { href: "/driver/notifications", label: "driver.nav.notifications", icon: Bell },
            { href: "/driver/profile", label: "driver.nav.profile", icon: UserRound },
            { href: "/driver/settings", label: "driver.nav.settings", icon: Settings },
          ].map((item) => {
            const taskDetail = /^\/driver\/[0-9a-f-]{36}$/i.test(pathname);
            const active =
              item.href === "/driver"
                ? pathname === "/driver"
                : item.href === "/driver/jobs"
                  ? pathname.startsWith(item.href) || taskDetail
                  : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Shown while a driver's own data loads. */
export function DriverLoading() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * A driver on a weak signal is the normal case, not the exception, so a failed
 * load offers the obvious remedy rather than only an apology.
 */
export function DriverError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();
  return (
    <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
      <p className="text-sm font-medium text-foreground">
        {t("errors.network")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("errors.networkBody")}
      </p>
      <Button
        size="lg"
        className="mt-6 h-12 rounded-full px-6 shadow-sm"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
        {t("common.retry")}
      </Button>
    </div>
  );
}
