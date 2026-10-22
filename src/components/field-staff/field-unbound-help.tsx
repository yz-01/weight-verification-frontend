"use client";

import { Copy, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useInstallIconTags } from "@/components/field-staff/install-icons";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-error-report";
import type { UnboundReason } from "@/lib/field-install";

/**
 * The way in, said plainly, when a PIN alone cannot sign this phone in.
 *
 * - installed app: an iPhone home-screen app keeps its own storage, apart
 *   from Safari. One added from a page without the sign-in hand-off has never
 *   been linked, and the server does not know it. The fix is to add it again
 *   from the right page.
 * - chat app: linking inside WeChat / Facebook / … links only that app.
 * - browser: this browser has not been linked, or lost it.
 *
 * `code` (from `unboundCode`) is shown small as 「原因：…」 and sent once to
 * the server log as an "unbound" report - not a crash, but the next time a
 * phone lands here we can see why (Lucas 2026-10-23).
 */
export function FieldUnboundHelp({
  reason,
  code,
  standalone = false,
  boundary = "field-login",
}: {
  reason: UnboundReason;
  code?: string;
  standalone?: boolean;
  boundary?: string;
}) {
  const t = useTranslations("fieldAccess");
  const icons = useInstallIconTags();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    reportClientError(
      { name: "Unbound", message: code },
      { boundary, standalone, kind: "unbound" },
    );
  }, [boundary, code, standalone]);

  const steps =
    reason === "installed-app"
      ? [
          t("unboundAppStep1"),
          t("unboundAppStep2"),
          t.rich("unboundAppStep3", icons),
          t("unboundAppStep4"),
        ]
      : [];
  const title =
    reason === "installed-app"
      ? t("unboundAppTitle")
      : reason === "in-app"
        ? t("unboundInAppTitle")
        : t("unboundBrowserTitle");
  const body =
    reason === "installed-app"
      ? t("unboundAppBody")
      : reason === "in-app"
        ? t.rich("unboundInAppBody", icons)
        : t("unboundBrowserBody");

  return (
    <div
      className="rounded-lg border border-warning/40 bg-warning/15 p-3 text-sm"
      data-unbound-reason={reason}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Smartphone className="size-4 shrink-0" />
        {title}
      </p>
      <p className="mt-1 leading-6">{body}</p>
      {steps.length > 0 && (
        <ol className="mt-2 grid gap-1.5">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-2 leading-6">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {reason === "in-app" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(window.location.href)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          <Copy />
          {copied ? t("copied") : t("copyLink")}
        </Button>
      )}
      {code && (
        <p
          className="mt-2 font-mono text-xs text-muted-foreground"
          data-testid="unbound-code"
        >
          {t("unboundReason", { code })}
        </p>
      )}
    </div>
  );
}
