"use client";

import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

/**
 * Credentials are held; the server could not be asked who they belong to
 * (F-365).
 *
 * The two answers this replaces were both wrong. Sending the person to the
 * sign-in screen is a lie - they are signed in, and on a site phone it throws
 * away whatever has not synced. A spinner that never resolves is a dead
 * screen: nothing on it says what is wrong or what to do.
 *
 * So it says the thing, and offers the two acts that are actually available:
 * ask again, or sign out on purpose. Signing out stays reachable because a
 * person who has genuinely finished should not be trapped here.
 */
export function SessionUnreachable() {
  const t = useTranslations("session");
  const { refresh, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const again = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center"
      >
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted">
          <WifiOff className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-semibold">{t("unreachableTitle")}</h1>
          {/* Says the session is intact, because the fear this screen has to
              answer is "have I been logged out and lost my work". */}
          <p className="text-sm text-muted-foreground">
            {t("unreachableBody")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button disabled={refreshing} onClick={again}>
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t("tryAgain")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            {t("signOutAnyway")}
          </Button>
        </div>
      </div>
    </div>
  );
}
