"use client";

import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

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
  const { user, isLoading, signOut } = useAuth();

  useEffect(() => {
    if (!isLoading && user === null) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || user === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
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

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        {children}
      </main>
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
