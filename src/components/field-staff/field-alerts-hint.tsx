"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  PushTestButton,
  PushTestResult,
  usePushTest,
} from "@/components/notifications/push-test";
import { Button } from "@/components/ui/button";
import { isStandaloneApp } from "@/lib/auth-token";
import {
  type FieldAlertsAdvice,
  fieldAlertsAdvice,
  fieldAlertsDismissKey,
  isSamsungBrowser,
} from "@/lib/field-alerts";
import { detectInstallEnvironment } from "@/lib/field-install";
import {
  enablePushNotifications,
  getPushConfig,
  PUSH_REGISTRATION_CHANGED,
  PushEnableError,
  type PushStep,
  getPushSubscriptionStatus,
  isPushSupported,
} from "@/services/push-notification.service";

/** The advice a worker may put away with 「知道了」; turning alerts on is not one. */
const DISMISSABLE: readonly FieldAlertsAdvice[] = ["android-install", "ios-update", "denied"];

function dismissed(advice: FieldAlertsAdvice): boolean {
  try {
    return window.localStorage.getItem(fieldAlertsDismissKey(advice)) === "1";
  } catch {
    return false;
  }
}

/**
 * The phone says, once and plainly, what it needs for sound and the icon's
 * number (JB36, 客户 10-26 事项 11) - and offers the one tap that turns
 * notifications on. It never promises what the phone cannot do: the words
 * name the browser or system limit instead (see `lib/field-alerts`).
 */
export function FieldAlertsHint() {
  const t = useTranslations("fieldAlerts");
  const [advice, setAdvice] = useState<FieldAlertsAdvice[]>([]);
  const [pending, setPending] = useState(false);
  // The step 「打开通知」 stopped at, named instead of spinning (Lucas 10-30).
  const [failed, setFailed] = useState<PushStep | null>(null);
  const [version, setVersion] = useState(0);
  // Just turned on here: offer 「发一条测试通知」 (JB156, 客户 11-10 第四批).
  const [justEnabled, setJustEnabled] = useState(false);
  const pushTest = usePushTest();
  const pushSupported = typeof window !== "undefined" && isPushSupported();
  // query-failure: an unread push setting is "not configured" - the hint then names the install / permission steps only
  const config = useQuery({
    queryKey: ["notifications", "push-config"],
    queryFn: () => getPushConfig({ silent: true }),
    enabled: pushSupported,
    staleTime: 5 * 60_000,
  });

  const configured = Boolean(config.data?.configured);
  useEffect(() => {
    let live = true;
    const subscribed = pushSupported
      ? getPushSubscriptionStatus().catch(() => false)
      : Promise.resolve(false);
    void subscribed.then((isSubscribed) => {
      if (!live) return;
      setAdvice(
        fieldAlertsAdvice({
          environment: detectInstallEnvironment(),
          standalone: isStandaloneApp(),
          samsungBrowser: isSamsungBrowser(navigator.userAgent),
          pushSupported,
          pushConfigured: configured,
          permission: pushSupported ? Notification.permission : "unsupported",
          subscribed: isSubscribed,
        }).filter((item) => !(DISMISSABLE.includes(item) && dismissed(item))),
      );
    });
    return () => {
      live = false;
    };
  }, [configured, pushSupported, version]);

  // Opening the app registered this phone afresh, or could not - then
  // 「打开通知」 is shown again (JB156).
  useEffect(() => {
    const reread = () => setVersion((value) => value + 1);
    window.addEventListener(PUSH_REGISTRATION_CHANGED, reread);
    return () => window.removeEventListener(PUSH_REGISTRATION_CHANGED, reread);
  }, []);

  if (advice.length === 0 && !justEnabled) return null;

  const dismiss = (item: FieldAlertsAdvice) => {
    try {
      window.localStorage.setItem(fieldAlertsDismissKey(item), "1");
    } catch {
      // Storage refused: it goes for this visit only.
    }
    setAdvice((current) => current.filter((entry) => entry !== item));
  };

  const turnOn = async () => {
    setPending(true);
    setFailed(null);
    try {
      // Inside the tap: iPhone asks for permission only from a gesture.
      // After a test that did not go, a fresh registration (JB156).
      if (await enablePushNotifications({ renew: pushTest.failed })) {
        setJustEnabled(true);
        pushTest.reset();
      }
    } catch (error) {
      setFailed(error instanceof PushEnableError ? error.step : "server");
    } finally {
      setPending(false);
      setVersion((value) => value + 1);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-2 px-4 pt-3" data-testid="field-alerts-hint">
      {advice.map((item) => (
        <div
          key={item}
          data-advice={item}
          className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm"
        >
          <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 leading-5">
            <p>{t(`${item}.body`)}</p>
            {item === "turn-on" && failed && (
              <p role="alert" className="mt-1 text-destructive">
                {t(`failed.${failed}`)}
              </p>
            )}
          </div>
          {item === "turn-on" ? (
            <Button size="sm" disabled={pending} onClick={() => void turnOn()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("turn-on.action")}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => dismiss(item)}>
              {t("dismiss")}
            </Button>
          )}
        </div>
      ))}
      {justEnabled && !advice.includes("turn-on") && (
        <div
          data-advice="enabled"
          className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm"
        >
          <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-2 leading-5">
            <p>{t("enabled.body")}</p>
            <div className="flex flex-wrap gap-2">
              <PushTestButton state={pushTest.state} onSend={() => void pushTest.send()} />
              {pushTest.failed ? (
                // The way back the advice below names.
                <Button size="sm" disabled={pending} onClick={() => void turnOn()}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {t("turn-on.action")}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setJustEnabled(false)}>
                  {t("dismiss")}
                </Button>
              )}
            </div>
            {failed && (
              <p role="alert" className="text-destructive">
                {t(`failed.${failed}`)}
              </p>
            )}
            <PushTestResult state={pushTest.state} button={t("turn-on.action")} />
          </div>
        </div>
      )}
    </div>
  );
}
