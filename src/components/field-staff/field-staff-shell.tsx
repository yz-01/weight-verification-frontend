"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { OfflineStatus } from "@/components/shared/offline-status";
import { Button } from "@/components/ui/button";
import { firstAllowedDashboardPath } from "@/lib/navigation";
import { getSessionPortal } from "@/lib/auth-token";
import { portalLoginPath, redirectWithFallback } from "@/lib/portal";

export function FieldStaffShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const allowed = user?.portal === "MSE_TRACE" && user.permissions.includes("field_position.submit");

  useEffect(() => {
    if (!isLoading && user === null) {
      redirectWithFallback(router, portalLoginPath(getSessionPortal()));
    } else if (!isLoading && user !== null && !allowed) {
      redirectWithFallback(
        router,
        firstAllowedDashboardPath(user.portal, user.features),
      );
    }
  }, [allowed, isLoading, router, user]);

  if (isLoading || user === null || !allowed) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.company_name}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <OfflineStatus />
            <NotificationButton />
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" className="h-9 w-9" title={t("common.signOut")} onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
