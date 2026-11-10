"use client";

import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { detectInstallEnvironment, isIosEnvironment } from "@/lib/field-install";
import { cn } from "@/lib/utils";
import { type PushTestOutcome, sendTestPush } from "@/services/push-notification.service";

/**
 * 「发一条测试通知」 (JB156, 客户 11-10 第四批: 「苹果手机重启了之后，声音红点都
 * 没有」). The server pushes to this phone only and says at once whether
 * Apple / Google took it; the phone should ring within seconds. Shown in the
 * bell next to the push switch, and in the field hint right after
 * 「打开通知」 succeeds.
 */
export type PushTestState = "idle" | "pending" | PushTestOutcome;

export function usePushTest() {
  const [state, setState] = useState<PushTestState>("idle");
  const send = async () => {
    setState("pending");
    setState(await sendTestPush());
  };
  return {
    state,
    send,
    reset: () => setState("idle"),
    /** The last test did not go: 「打开通知」 is offered again, to register afresh. */
    failed: typeof state === "object" && !state.sent,
  };
}

/** Which way back the advice names when a test did not go. */
export type PushAdvicePlatform = "ios" | "android" | "other";

export function pushAdvicePlatform(environment = detectInstallEnvironment()): PushAdvicePlatform {
  if (isIosEnvironment(environment)) return "ios";
  if (environment === "android") return "android";
  return "other";
}

export function PushTestButton({ state, onSend }: { state: PushTestState; onSend: () => void }) {
  const t = useTranslations("pushTest");
  const pending = state === "pending";
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      disabledReason={t("sending")}
      onClick={onSend}
      data-testid="push-test"
    >
      {pending ? <Loader2 className="animate-spin" /> : <Send />}
      {t("action")}
    </Button>
  );
}

/**
 * What the test came to. Sent: the phone should ring now. Not sent: why, and
 * the way back - press `button` (the 「打开通知」 on that screen) again, and
 * failing that put the app on the phone afresh.
 */
export function PushTestResult({
  state,
  button,
  platform,
  className,
}: {
  state: PushTestState;
  /** The label of the button that turns notifications on, where this shows. */
  button: string;
  platform?: PushAdvicePlatform;
  className?: string;
}) {
  const t = useTranslations();
  if (typeof state !== "object") return null;
  if (state.sent) {
    return (
      <p role="status" className={cn("text-success", className)}>
        {t("pushTest.sent")}
      </p>
    );
  }
  const reason =
    state.message ||
    (state.code && t.has(`errors.api.${state.code}`) ? t(`errors.api.${state.code}`) : t("errors.generic"));
  return (
    <div role="alert" className={cn("space-y-1 text-destructive", className)}>
      <p>{t("pushTest.notSent", { reason })}</p>
      <p>{t(`pushTest.advice.${platform ?? pushAdvicePlatform()}`, { button })}</p>
    </div>
  );
}
