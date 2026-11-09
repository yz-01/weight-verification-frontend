"use client";

import { Loader2, LocateFixed, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { LocationDenialSteps } from "@/components/field-staff/location-denial-help";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  isOffline,
  type LocationProblem,
  type LocationValue,
  NO_LOCATION,
  OFFLINE_LOCATION_TIMEOUT_MS,
  problemOf,
  requestLocation,
} from "@/lib/field-location";

/**
 * Ask for a position fix, in the order a person can follow.
 *
 * Three things this exists to fix, all reported from a real site
 * (2026-09-05):
 *
 * The position is asked for as soon as the form opens, with no explanation
 * box first (Lucas 2026-10-24: 「把这个出现一次的直接删除掉，如果他们允许定位
 * 权限的话直接自动获取GPS就好了，不需要问多一次，如果不允许就不能使用手机
 * 端」). The phone app's location tracker (`FieldLocationTracker`) has already
 * asked on opening the app, and blocks the whole app while it is refused.
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
  readyLabel,
  value,
  onChange,
  required = false,
  className = "",
  error,
  hint,
  allowMissing = false,
}: {
  label: string;
  /** The words on the button once one has. */
  readyLabel: string;
  value: LocationValue | null;
  onChange: (fix: LocationValue | null) => void;
  /** `"quiet"`: required, no red star; the `hint` says so (I22, ID56). */
  required?: boolean | "quiet";
  className?: string;
  /** A server-side rejection of the coordinates, shown under the field. */
  error?: string;
  hint?: string;
  /**
   * A photo record: no fix never blocks it (client 2026-11-09 item 6, which
   * widens Lucas 2026-10-23 choice A from offline-only to always). It can be
   * saved while the phone is still locating, and a failure, a time-out or a
   * refusal leaves it 「没有定位」 at once, online or offline. Not for records
   * whose point is the position itself (clock-in, equipment hours).
   */
  allowMissing?: boolean;
}) {
  const t = useTranslations("fieldStaffPwa.locationAccess");
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);

  // One request per mount unless the person asks again (React's development
  // double-mount must not fire two).
  const attempted = useRef(false);
  const ask = useCallback(async () => {
    attempted.current = true;
    setProblem(null);
    setLocating(true);
    // A photo record can be saved from the first moment: until a fix
    // arrives the value is 「没有定位」, so pressing 提交 now saves it without
    // a position - the position known at the moment of saving, which is
    // none. A fix arriving later only reaches this form; a record already
    // saved (or queued offline) holds its own copy and is never given it
    // (client 2026-11-09: 「GPS 定位失败不能事后用新的位置冒充拍摄时的位置」).
    if (allowMissing) onChange(NO_LOCATION);
    // Without network the phone has GPS alone, which can need far longer for
    // a first fix than the usual 15 seconds.
    const offline = isOffline();
    try {
      onChange(
        await requestLocation(
          offline
            ? { enableHighAccuracy: true, timeout: OFFLINE_LOCATION_TIMEOUT_MS, maximumAge: 0 }
            : undefined,
        ),
      );
    } catch (error) {
      const problem = problemOf(error);
      // A photo record goes without a position at once, whatever the reason
      // and with or without network: the client's 「定位等太久了」 left 提交
      // locked with a photograph already taken (2026-11-09 图6). A refusal
      // still shows where the switch is, but no longer blocks the record.
      if (allowMissing) {
        onChange(NO_LOCATION);
        setProblem(problem === "denied" ? problem : null);
      } else {
        onChange(null);
        setProblem(problem);
      }
    } finally {
      setLocating(false);
    }
  }, [allowMissing, onChange]);

  /*
   * Automatic, not a button (T-355, D-226／D-237／D-246).
   *
   * 客户开工前第 4 问：「现场工作人员的 GPS 是自动获取的，他们申请任何东西都是
   * 自动获取，**不需要自己点获取 GPS 定位**」. Every field form used to open
   * with a 「获取定位」 button the worker had to remember to press - and a
   * required one, so forgetting it blocked the submit with no obvious cause.
   *
   * Not even the first request on a device waits for a press any more
   * (Lucas 2026-10-24, see above): the tracker has asked on opening the app.
   *
   * A button appears only when something went wrong - as 【重试】 - which is
   * D-246: 「常态路径上不出现『获取定位』按钮；只有在自动定位失败时才露出重试」.
   *
   * `attempted` is a ref rather than state so React's development double-mount
   * does not fire two requests, and so an explicit retry is the only thing
   * that asks again after a failure.
   */
  const missing = Boolean(value && "missing" in value && value.missing);
  useEffect(() => {
    if (value || attempted.current) return;
    attempted.current = true;
    void ask();
  }, [ask, value]);

  return (
    <FieldWrapper className={className} label={label} required={required} error={error} hint={hint}>
      {locating ? (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <p className="flex min-h-8 items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {t("locating")}
          </p>
          {allowMissing ? <p className="mt-1 text-xs">{t("locatingCanSave")}</p> : null}
        </div>
      ) : missing ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">{t("missing.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("missing.body")}</p>
          {/* A refusal's steps below carry their own 【重试】. */}
          {problem !== "denied" ? (
            <Button
              className="mt-2 h-10 w-full"
              variant="outline"
              onClick={() => void ask()}
            >
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : value && !problem ? (
        <p className="flex min-h-12 items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 text-sm">
          <LocateFixed className="size-4 text-success" />
          {readyLabel}
        </p>
      ) : null}

      {value && !missing && !problem ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <MapPin className="size-3.5" />
          {value.latitude}, {value.longitude}
        </p>
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
