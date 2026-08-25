"use client";

import {
  BookOpen,
  Camera,
  ChevronDown,
  Download,
  Loader2,
  Menu,
  Share,
} from "lucide-react";
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

type InstallEnvironment =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "android"
  | "desktop-chromium"
  | "other";

type InstallStatus = "idle" | "preparing" | "unavailable";

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
  // Keep the server and first client render identical. Browser capability and
  // a deferred install event are only known after hydration.
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [environment, setEnvironment] =
    useState<InstallEnvironment>("other");
  const [showGuide, setShowGuide] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");
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

    const hydrationFrame = window.requestAnimationFrame(() => {
      setEnvironment(detectInstallEnvironment());
      setInstallPrompt(
        (window as InstallWindow).__mseFieldInstallPrompt ?? null,
      );
    });

    const handler = (event: Event) => {
      const prompt = event as BeforeInstallPromptEvent;
      (window as InstallWindow).__mseFieldInstallPrompt = prompt;
      setInstallPrompt(prompt);
      setInstallStatus("idle");
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
      window.cancelAnimationFrame(hydrationFrame);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("mse:field-install-ready", promptReady);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("mse:field-app-installed", installed);
    };
  }, [next, router, token, workspace]);

  const guidance = installGuidance(environment, t);
  const GuidanceIcon = guidance.icon;
  const supportsNativePrompt =
    environment === "android" || environment === "desktop-chromium";
  const guideVisible = showGuide || environment.startsWith("ios-");

  const requestInstall = async () => {
    setInstallStatus("preparing");
    const prompt =
      installPrompt ??
      (window as InstallWindow).__mseFieldInstallPrompt ??
      (await waitForInstallPrompt());
    if (!prompt) {
      setInstallStatus("unavailable");
      setShowGuide(true);
      return;
    }

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      (window as InstallWindow).__mseFieldInstallPrompt = null;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        redirectWithFallback(router, workspace, 150);
        return;
      }
      setInstallStatus("unavailable");
      setShowGuide(true);
    } catch {
      (window as InstallWindow).__mseFieldInstallPrompt = null;
      setInstallPrompt(null);
      setInstallStatus("unavailable");
      setShowGuide(true);
    }
  };

  const openInstallHelp = () => {
    const prompt =
      installPrompt ?? (window as InstallWindow).__mseFieldInstallPrompt;
    if (supportsNativePrompt && prompt) {
      void requestInstall();
      return;
    }
    setShowGuide((visible) => !visible);
  };

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
        {supportsNativePrompt && (
          <Button
            size="lg"
            className="h-14 text-base"
            disabled={installStatus === "preparing"}
            onClick={() => void requestInstall()}
          >
            {installStatus === "preparing" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            {installStatus === "preparing" ? t("installPreparing") : t("install")}
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          className="h-12 justify-between px-4"
          onClick={openInstallHelp}
        >
          <span className="flex items-center gap-2">
            <BookOpen />
            {t("installHelp")}
          </span>
          <ChevronDown
            className={`transition-transform ${guideVisible ? "rotate-180" : ""}`}
          />
        </Button>
        {guideVisible && (
          <div className="rounded-lg border bg-card p-4 text-sm shadow-sm">
            <p className="flex items-center gap-2 font-semibold">
              <GuidanceIcon className="size-4 text-primary" />
              {guidance.title}
            </p>
            <p className="mt-2 leading-6 text-muted-foreground">
              {guidance.body}
            </p>
            {installStatus === "unavailable" && supportsNativePrompt && (
              <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 leading-5 text-warning-foreground">
                {t("installUnavailable")}
              </p>
            )}
          </div>
        )}
        <Button
          size="lg"
          variant={supportsNativePrompt ? "outline" : "default"}
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

function detectInstallEnvironment(): InstallEnvironment {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent.toLowerCase();
  const ios =
    /iphone|ipad|ipod/.test(agent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    if (agent.includes("crios")) return "ios-chrome";
    if (
      agent.includes("fxios") ||
      agent.includes("edgios") ||
      agent.includes("opios")
    ) {
      return "ios-other";
    }
    return "ios-safari";
  }
  if (agent.includes("android")) return "android";
  if (/chrome|chromium|edg|opr/.test(agent)) return "desktop-chromium";
  return "other";
}

function installGuidance(
  environment: InstallEnvironment,
  t: ReturnType<typeof useTranslations<"fieldAccess">>,
) {
  if (environment === "ios-safari") {
    return { icon: Share, title: t("iosSafariTitle"), body: t("iosSafariBody") };
  }
  if (environment === "ios-chrome") {
    return { icon: Share, title: t("iosChromeTitle"), body: t("iosChromeBody") };
  }
  if (environment === "ios-other") {
    return { icon: Share, title: t("iosOtherTitle"), body: t("iosOtherBody") };
  }
  if (environment === "android") {
    return { icon: Menu, title: t("androidTitle"), body: t("androidBody") };
  }
  if (environment === "desktop-chromium") {
    return { icon: Menu, title: t("desktopTitle"), body: t("desktopBody") };
  }
  return { icon: Menu, title: t("browserTitle"), body: t("browserBody") };
}

function waitForInstallPrompt(timeoutMs = 2_000): Promise<BeforeInstallPromptEvent | null> {
  const existing = (window as InstallWindow).__mseFieldInstallPrompt;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const complete = () => {
      window.clearTimeout(timer);
      window.removeEventListener("mse:field-install-ready", complete);
      resolve((window as InstallWindow).__mseFieldInstallPrompt ?? null);
    };
    const timer = window.setTimeout(complete, timeoutMs);
    window.addEventListener("mse:field-install-ready", complete, { once: true });
  });
}
