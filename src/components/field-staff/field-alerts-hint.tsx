"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
  const [version, setVersion] = useState(0);
  const pushSupported = typeof window !== "undefined" && isPushSupported();
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

  if (advice.length === 0) return null;

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
    try {
      // Inside the tap: iPhone asks for permission only from a gesture.
      await enablePushNotifications();
    } catch {
      // The request already said what went wrong.
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
          <p className="min-w-0 flex-1 leading-5">{t(`${item}.body`)}</p>
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
    </div>
  );
}
