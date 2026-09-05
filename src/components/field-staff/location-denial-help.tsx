"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { isIos, locationHelpTarget } from "@/lib/field-location";

/**
 * What to do when a phone has refused to give its position.
 *
 * The user asked for this by name (2026-09-05): a refusal must be recognised
 * as a refusal, and must then say where the switch is - "设置 → Safari → 位置
 * → 允许" - rather than reporting one flat sentence. iOS and Android keep it
 * in different places, and on iOS each browser has its own entry, so the steps
 * are chosen from the phone in the reader's hand.
 *
 * It lives in its own file because three screens need it and each has its own
 * retry: the field app's evidence capture, the blocking dialog the location
 * tracker puts up, and the position-sharing control in the back office. The
 * first draft of this guidance existed only inside the evidence capture field,
 * so the tracker - the dialog a worker with location switched off actually
 * hits, and cannot get past - still showed one line and a retry button that
 * could only fail again.
 *
 * The iOS note is not a hedge. A refusal in iOS Settings produces no prompt at
 * all: the request fails instantly, indistinguishably from the person having
 * pressed Don't Allow a moment ago. Nothing in the browser separates them, so
 * the note says both possibilities plainly instead of guessing at one.
 */
export function LocationDenialSteps({
  action,
  className = "",
}: {
  /** The caller's own retry control, shown inside the box. */
  action?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("fieldStaffPwa.locationAccess");
  const target = locationHelpTarget();

  return (
    <div
      role="alert"
      className={`rounded-lg border border-destructive/30 bg-destructive/5 p-3 ${className}`}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
        <ShieldAlert className="size-4" />
        {t("denied.title")}
      </p>
      {isIos() ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("denied.iosNote")}
        </p>
      ) : null}
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        {(["1", "2", "3", "4"] as const).map((step) => (
          <li key={step}>{t(`steps.${target}.${step}`)}</li>
        ))}
      </ol>
      {action}
    </div>
  );
}
