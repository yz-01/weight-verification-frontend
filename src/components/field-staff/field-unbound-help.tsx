"use client";

import { Copy, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
 */
export function FieldUnboundHelp({ reason }: { reason: UnboundReason }) {
  const t = useTranslations("fieldAccess");
  const [copied, setCopied] = useState(false);
  const steps =
    reason === "installed-app"
      ? [t("unboundAppStep1"), t("unboundAppStep2"), t("unboundAppStep3"), t("unboundAppStep4")]
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
        ? t("unboundInAppBody")
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
    </div>
  );
}
