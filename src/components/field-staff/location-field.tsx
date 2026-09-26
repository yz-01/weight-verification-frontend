"use client";

import { Loader2, LocateFixed, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { LocationDenialSteps } from "@/components/field-staff/location-denial-help";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  type LocationFix,
  type LocationProblem,
  problemOf,
  requestLocation,
} from "@/lib/field-location";

/**
 * Remembers that the explanation has been read, on this device.
 *
 * A worker takes several deliveries a day and clocks in and out. Explaining
 * every time would train them to press past it, which is how the system prompt
 * ended up being pressed past in the first place.
 */
const PRIMER_KEY = "mse.location-primer-read";

function primerWasRead(): boolean {
  try {
    return window.localStorage.getItem(PRIMER_KEY) === "1";
  } catch {
    // Private browsing, or site data blocked. Explaining again is a small
    // cost; failing to render the button is not.
    return false;
  }
}

/**
 * Whether the explanation has been read, as React reads an external value.
 *
 * `localStorage` is outside React, and reading it into state from an effect
 * would render twice for nothing. On the server there is no storage at all;
 * answering "read" there means the server never renders the explanation, and
 * the client shows it on hydration only when it really is a first use.
 */
function subscribeToNothing(): () => void {
  return () => undefined;
}

function usePrimerWasRead(): boolean {
  return useSyncExternalStore(subscribeToNothing, primerWasRead, () => true);
}

function rememberPrimer(): void {
  try {
    window.localStorage.setItem(PRIMER_KEY, "1");
  } catch {
    // Nothing to do. The explanation simply shows again next time.
  }
}

/**
 * Ask for a position fix, in the order a person can follow.
 *
 * Three things this exists to fix, all reported from a real site
 * (2026-09-05):
 *
 * The system prompt used to appear the moment a screen opened, with no
 * explanation. The common reaction to an unexplained prompt is Don't Allow,
 * and that answer is remembered - so a worker refused once and was then stuck
 * for good. Now a sentence appears first and the prompt only follows a press.
 *
 * A refusal used to surface as "location unavailable" and nothing else. Now it
 * says which switch to move, in the phone the reader is holding: iOS and
 * Android keep the setting in different places, and on iOS every browser has
 * its own entry.
 *
 * And on iOS a refusal at the system level produces no prompt at all - the
 * request fails instantly and silently, which is indistinguishable from the
 * person having pressed Don't Allow. Nothing in the browser separates the two,
 * so the iOS instructions say so plainly rather than guessing.
 *
 * What this cannot do, and does not pretend to: turn a phone's GPS on, or
 * grant its own permission. No web page on any platform can.
 */
export function LocationField({
  label,
  actionLabel,
  readyLabel,
  value,
  onChange,
  required = false,
  className = "",
  error,
  hint,
}: {
  label: string;
  /** The words on the button before a fix has been taken. */
  actionLabel: string;
  /** The words on the button once one has. */
  readyLabel: string;
  value: LocationFix | null;
  onChange: (fix: LocationFix | null) => void;
  required?: boolean;
  className?: string;
  /** A server-side rejection of the coordinates, shown under the field. */
  error?: string;
  hint?: string;
}) {
  const t = useTranslations("fieldStaffPwa.locationAccess");
  const primerRead = usePrimerWasRead();
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);

  // One request per mount unless the person asks again. Set here, not only in
  // the effect, so pressing 「允许」 on the first-use explanation (which flips
  // `primerRead`) does not let the effect fire a second request behind it.
  const attempted = useRef(false);
  const ask = useCallback(async () => {
    attempted.current = true;
    rememberPrimer();
    setProblem(null);
    setLocating(true);
    try {
      onChange(await requestLocation());
    } catch (error) {
      onChange(null);
      setProblem(problemOf(error));
    } finally {
      setLocating(false);
    }
  }, [onChange]);

  /*
   * Automatic, not a button (T-355, D-226／D-237／D-246).
   *
   * 客户开工前第 4 问：「现场工作人员的 GPS 是自动获取的，他们申请任何东西都是
   * 自动获取，**不需要自己点获取 GPS 定位**」. Every field form used to open
   * with a 「获取定位」 button the worker had to remember to press - and a
   * required one, so forgetting it blocked the submit with no obvious cause.
   *
   * The one thing that is *not* automatic is the very first request on a
   * device. That stays behind the one-sentence explanation below, because an
   * unexplained system prompt is answered "Don't Allow" and the refusal is
   * remembered for good (the problem this component was first written for).
   * D-226 says the same: 「第一次使用只需授权一次定位权限」. After that one
   * time, opening the form is enough.
   *
   * A button appears only when something went wrong - as 【重试】 - which is
   * D-246: 「常态路径上不出现『获取定位』按钮；只有在自动定位失败时才露出重试」.
   *
   * `attempted` is a ref rather than state so React's development double-mount
   * does not fire two requests, and so an explicit retry is the only thing
   * that asks again after a failure.
   */
  const [primerDismissed, setPrimerDismissed] = useState(false);
  // The explanation shows by itself on a first use, and never otherwise.
  const showPrimer = !value && !primerRead && !primerDismissed;
  useEffect(() => {
    if (value || attempted.current || !primerRead) return;
    attempted.current = true;
    void ask();
  }, [ask, value, primerRead]);

  return (
    <FieldWrapper className={className} label={label} required={required} error={error} hint={hint}>
      {locating ? (
        <p className="flex min-h-12 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("locating")}
        </p>
      ) : value && !problem ? (
        <p className="flex min-h-12 items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 text-sm">
          <LocateFixed className="size-4 text-success" />
          {readyLabel}
        </p>
      ) : null}

      {/* The person said "later" to the one-time explanation. The form still
          needs a position, so the way back is offered - worded as the action
          it is, not as a retry of something that never ran. */}
      {primerDismissed && !value && !locating && !problem ? (
        <Button
          className="h-12 w-full"
          variant="outline"
          onClick={() => setPrimerDismissed(false)}
        >
          <LocateFixed />
          {actionLabel}
        </Button>
      ) : null}

      {value && !problem ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <MapPin className="size-3.5" />
          {value.latitude}, {value.longitude}
        </p>
      ) : null}

      {showPrimer ? (
        <div className="mt-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-semibold">{t("why.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("why.body")}</p>
          <div className="mt-3 flex gap-2">
            <Button className="h-10 flex-1" onClick={() => void ask()}>
              {t("why.allow")}
            </Button>
            <Button
              className="h-10"
              variant="ghost"
              onClick={() => setPrimerDismissed(true)}
            >
              {t("why.later")}
            </Button>
          </div>
        </div>
      ) : null}

      {problem === "denied" ? (
        <LocationDenialSteps
          className="mt-2"
          action={
            <Button
              className="mt-3 h-10 w-full"
              variant="outline"
              onClick={() => void ask()}
            >
              {t("retry")}
            </Button>
          }
        />
      ) : null}

      {problem && problem !== "denied" ? (
        <div className="mt-2">
          <p role="alert" className="text-xs text-destructive">
            {t(problem)}
          </p>
          <Button
            className="mt-2 h-10 w-full"
            variant="outline"
            onClick={() => void ask()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}
    </FieldWrapper>
  );
}
