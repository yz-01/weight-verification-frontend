"use client";

import { Camera, Download, Menu, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { hasFieldSession, markFieldAppContext } from "@/lib/auth-token";
import { redirectWithFallback } from "@/lib/portal";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallPlatform = "ios" | "android" | "other";

type InstallWindow = Window & {
  __mseFieldInstallPrompt?: BeforeInstallPromptEvent | null;
};

export function FieldInstallReady({
  token,
  next,
}: {
  token: string;
  next?: string;
}) {
  const t = useTranslations("fieldAccess");
  const router = useRouter();
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(() =>
      typeof window === "undefined"
        ? null
        : (window as InstallWindow).__mseFieldInstallPrompt ?? null,
    );
  const [platform] = useState<InstallPlatform>(detectInstallPlatform);
  const workspace = next ?? "/field-staff";

  useEffect(() => {
    if (isStandalone()) {
      markFieldAppContext();
      redirectWithFallback(
        router,
        token
          ? `/field-pwa-bootstrap?token=${encodeURIComponent(token)}${
              next ? `&next=${encodeURIComponent(next)}` : ""
            }`
          : hasFieldSession()
            ? workspace
            : "/trace/field-login",
        150,
      );
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      const prompt = event as BeforeInstallPromptEvent;
      (window as InstallWindow).__mseFieldInstallPrompt = prompt;
      setInstallPrompt(prompt);
    };
    const promptReady = () => {
      setInstallPrompt(
        (window as InstallWindow).__mseFieldInstallPrompt ?? null,
      );
    };
    const installed = () => {
      (window as InstallWindow).__mseFieldInstallPrompt = null;
      setInstallPrompt(null);
      redirectWithFallback(router, workspace, 150);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("mse:field-install-ready", promptReady);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("mse:field-app-installed", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("mse:field-install-ready", promptReady);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("mse:field-app-installed", installed);
    };
  }, [next, router, token, workspace]);

  const guidance =
    platform === "ios"
      ? { icon: Share, title: t("iosTitle"), body: t("iosBody") }
      : platform === "android"
        ? { icon: Menu, title: t("androidTitle"), body: t("androidBody") }
        : { icon: Menu, title: t("browserTitle"), body: t("browserBody") };
  const GuidanceIcon = guidance.icon;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-5 py-10">
      <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Camera className="size-10" />
      </span>
      <h1 className="text-2xl font-semibold">{t("readyTitle")}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {t("readyBody")}
      </p>
      <div className="grid w-full max-w-sm gap-3">
        <div className="rounded-lg border bg-card p-4 text-sm shadow-sm">
          <p className="flex items-center gap-2 font-semibold">
            <GuidanceIcon className="size-4 text-primary" />
            {guidance.title}
          </p>
          <p className="mt-2 leading-6 text-muted-foreground">
            {guidance.body}
          </p>
        </div>
        {installPrompt && (
          <Button
            size="lg"
            className="h-14 text-base"
            onClick={async () => {
              await installPrompt.prompt();
              const choice = await installPrompt.userChoice;
              (window as InstallWindow).__mseFieldInstallPrompt = null;
              setInstallPrompt(null);
              if (choice.outcome === "accepted") {
                redirectWithFallback(router, workspace, 150);
              }
            }}
          >
            <Download />
            {t("install")}
          </Button>
        )}
        <Button
          size="lg"
          variant={installPrompt ? "outline" : "default"}
          className="h-14 text-base"
          onClick={() => redirectWithFallback(router, workspace, 150)}
        >
          <Camera />
          {t("openWorkspace")}
        </Button>
      </div>
    </main>
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) return "ios";
  if (agent.includes("android")) return "android";
  return "other";
}
