"use client";

import { Loader2, LocateFixed, MapPin, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  type LocationFix,
  type LocationProblem,
  isIos,
  locationHelpTarget,
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
}) {
  const t = useTranslations("fieldStaffPwa.locationAccess");
  const [showPrimer, setShowPrimer] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);

  const ask = useCallback(async () => {
    setShowPrimer(false);
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

  const start = () => {
    // The explanation is the gesture that leads to the system prompt, so on a
    // first use the prompt is never reached without it.
    if (!primerWasRead()) {
      setShowPrimer(true);
      return;
    }
    void ask();
  };

  const target = locationHelpTarget();

  return (
    <FieldWrapper className={className} label={label} required={required}>
      <Button
        className="h-12 w-full"
        variant="outline"
        disabled={locating}
        onClick={start}
      >
        {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        {value ? readyLabel : actionLabel}
      </Button>

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
              onClick={() => setShowPrimer(false)}
            >
              {t("why.later")}
            </Button>
          </div>
        </div>
      ) : null}

      {problem === "denied" ? (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
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
          <Button
            className="mt-3 h-10 w-full"
            variant="outline"
            onClick={() => void ask()}
          >
            {t("retry")}
          </Button>
        </div>
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
