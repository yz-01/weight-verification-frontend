"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { OfflineStatus } from "@/components/shared/offline-status";
import { BrandIcon } from "@/components/shared/brand-icon";
import { Button } from "@/components/ui/button";
import { clearFieldTokens, markFieldAppContext } from "@/lib/auth-token";
import { redirectWithFallback } from "@/lib/portal";
import { FieldLocationTracker } from "@/components/field-staff/field-location-tracker";
import { FieldManifestToken } from "@/components/field-staff/field-manifest-token";
import { canUseRealtime, useOrderRealtime } from "@/hooks/use-order-realtime";

const FIELD_REALTIME_KEYS: never[] = [];

export function FieldStaffShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading, signOut } = useAuth();
  const allowed = user?.portal === "MSE_TRACE" && user.is_field_staff;
  useOrderRealtime(
    FIELD_REALTIME_KEYS,
    true,
    canUseRealtime(user?.permissions ?? [], Boolean(user?.is_platform_staff)),
  );

  useEffect(() => markFieldAppContext(), []);

  useEffect(() => {
    if (!isLoading && user === null) {
      const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      redirectWithFallback(
        router,
        `/trace/field-login?next=${encodeURIComponent(currentPath)}`,
      );
    } else if (!isLoading && user !== null && !allowed) {
      clearFieldTokens();
      redirectWithFallback(router, "/trace/field-login");
    }
  }, [allowed, isLoading, pathname, router, searchParams, user]);

  if (isLoading || user === null || !allowed) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-background">
      <FieldLocationTracker />
      <FieldManifestToken />
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center gap-2 px-4 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background p-1">
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
            <LanguageSwitcher className="size-9 rounded-lg px-0 [&_span]:hidden sm:w-auto sm:px-3 sm:[&_span]:inline" />
            <Button variant="ghost" size="icon" className="size-9" title={t("common.signOut")} onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 w-full max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
