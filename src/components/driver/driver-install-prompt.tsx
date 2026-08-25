"use client";

import { Download, Menu, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PromptWindow = Window & { __mseFieldInstallPrompt?: InstallPromptEvent | null };

export function DriverInstallPrompt() {
  const t = useTranslations("fieldAccess");
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const environment = useSyncExternalStore(
    () => () => undefined,
    detectEnvironment,
    () => "other" as const,
  );
  const standalone = useSyncExternalStore(
    () => () => undefined,
    isStandalone,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const onReady = () => setPrompt((window as PromptWindow).__mseFieldInstallPrompt ?? null);
    const initial = window.setTimeout(onReady, 0);
    window.addEventListener("mse:field-install-ready", onReady);
    window.addEventListener("beforeinstallprompt", onReady);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("mse:field-install-ready", onReady);
      window.removeEventListener("beforeinstallprompt", onReady);
    };
  }, []);

  if (dismissed || standalone) return null;
  const install = async () => {
    if (!prompt) {
      setGuide(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setDismissed(true);
    setPrompt(null);
    (window as PromptWindow).__mseFieldInstallPrompt = null;
  };
  const isIos = environment === "ios";
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 text-sm">
      <Download className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{t("driverInstallTitle")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isIos ? t("driverInstallIos") : t("driverInstallBody")}
        </p>
        {guide && (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {isIos ? <Share className="size-3.5" /> : <Menu className="size-3.5" />}
            {isIos ? t("driverInstallIosGuide") : t("driverInstallBrowserGuide")}
          </p>
        )}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void install()}>
        {prompt ? t("install") : t("installHelp")}
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setDismissed(true)} aria-label={t("driverInstallDismiss")}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

function detectEnvironment(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) return "ios";
  return agent.includes("android") ? "android" : "other";
}
