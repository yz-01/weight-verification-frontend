"use client";

import { HardHat, Loader2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { OfflineStatus } from "@/components/shared/offline-status";
import { Button } from "@/components/ui/button";
import { clearFieldTokens, markFieldAppContext } from "@/lib/auth-token";
import { redirectWithFallback } from "@/lib/portal";

export function FieldStaffShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const allowed = user?.portal === "MSE_TRACE" && user.is_field_staff;

  useEffect(() => markFieldAppContext(), []);

  useEffect(() => {
    if (!isLoading && user === null) {
      redirectWithFallback(router, "/trace/field-login");
    } else if (!isLoading && user !== null && !allowed) {
      clearFieldTokens();
      redirectWithFallback(router, "/trace/field-login");
    }
  }, [allowed, isLoading, router, user]);

  if (isLoading || user === null || !allowed) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center gap-2 px-4 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <HardHat className="size-5" />
          </span>
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
      <main className="mx-auto w-full max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
