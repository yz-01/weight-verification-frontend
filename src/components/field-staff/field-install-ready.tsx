"use client";

import {
  ArrowDown,
  BookOpen,
  Camera,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  Menu,
  Share,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useInstallIconTags } from "@/components/field-staff/install-icons";
import { Button } from "@/components/ui/button";
import {
  hasFieldSession,
  isStandaloneApp,
  markFieldAppContext,
} from "@/lib/auth-token";
import {
  detectInstallEnvironment,
  fieldAppStartPath,
  installGuideVariant,
  showIosInstallGuide,
  type InstallEnvironment,
} from "@/lib/field-install";
import { replacePage } from "@/lib/portal";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

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
  // Keep the server and first client render identical. Browser capability and
  // a deferred install event are only known after hydration.
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [environment, setEnvironment] =
    useState<InstallEnvironment>("other");
  const [showGuide, setShowGuide] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");
  const [copied, setCopied] = useState(false);
  // Android Chrome hands over its install prompt shortly after load; until
  // this passes, the Install button is the way and no steps are shown.
  const [promptWaitOver, setPromptWaitOver] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setPromptWaitOver(true), 2_500);
    return () => window.clearTimeout(timer);
  }, []);
  const workspace = next ?? "/field-staff";

  useEffect(() => {
    if (isStandaloneApp()) {
      markFieldAppContext();
      replacePage(
        token
          ? fieldAppStartPath(token, next)
          : hasFieldSession()
            ? workspace
            : "/trace/field-login",
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
      replacePage(workspace);
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
  }, [next, token, workspace]);

  const guidance = installGuidance(environment, t);
  const GuidanceIcon = guidance.icon;
  const supportsNativePrompt =
    environment === "android" || environment === "desktop-chromium";
  const guideVisible = showGuide || environment.startsWith("ios-");
  // iPhone: the home-screen app cannot see anything Safari stored, so it must
  // be added from *this* page, whose address carries the sign-in hand-off.
  const iosGuide = showIosInstallGuide({
    environment,
    standalone: false,
  });
  const ownIosGuide =
    iosGuide && (environment === "ios-safari" || environment === "ios-in-app");

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
        replacePage(workspace);
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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">
      <span className="flex size-20 items-center justify-center rounded-full border border-panel-border bg-primary/10 text-primary shadow-glow-sm">
        <Camera className="size-10" />
      </span>
      <h1 className="text-center text-xl font-bold leading-tight">{t("readyTitle")}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {t("readyBody")}
      </p>
      <div className="grid w-full max-w-sm gap-3">
        {supportsNativePrompt && (
          <Button
            size="lg"
            className="h-12 text-sm"
            disabledReason={installStatus === "preparing" ? t("installPreparing") : undefined}
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
        {!ownIosGuide && (
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
        )}
        {iosGuide && environment === "ios-safari" && (
          <IosSafariSteps t={t} />
        )}
        {iosGuide && environment === "ios-safari" && <SafariBarArrow t={t} />}
        {iosGuide && environment === "ios-in-app" && (
          <div className="rounded-xl border border-warning/40 bg-warning/15 p-4 text-sm">
            <p className="font-semibold">{t("iosInAppTitle")}</p>
            <p className="mt-1 leading-6">{t("iosInAppBody")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <Copy />
              {copied ? t("copied") : t("copyLink")}
            </Button>
          </div>
        )}
        {installGuideVariant({ environment, guideVisible, nativePromptReady: Boolean(installPrompt) || !promptWaitOver }) ===
          "android-steps" && <AndroidSteps t={t} unavailable={installStatus === "unavailable"} />}
        {guideVisible && !ownIosGuide && environment !== "android" && (
          <div className="surface-panel rounded-xl p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <GuidanceIcon className="size-4 text-primary" />
              {guidance.title}
            </p>
            <p className="mt-2 leading-6 text-muted-foreground">
              {guidance.body}
            </p>
            {installStatus === "unavailable" && supportsNativePrompt && (
              <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 leading-5 text-warning">
                {t("installUnavailable")}
              </p>
            )}
          </div>
        )}
        <Button
          size="lg"
          variant={supportsNativePrompt || iosGuide ? "outline" : "default"}
          className="h-12 text-sm"
          onClick={() => replacePage(workspace)}
        >
          <Camera />
          {t("openWorkspace")}
        </Button>
      </div>
    </main>
  );
}



/**
 * iOS 26 Safari: Share sits behind the page menu or "..." button in the
 * compact bar at the bottom, "Add to Home Screen" is in the share sheet
 * (sometimes under "More"), and "Open as Web App" is on by default - it must
 * stay on. There is no install prompt on iPhone, so these steps are all we
 * can offer: big, numbered, with the real button icons in the sentence.
 */
function IosSafariSteps({
  t,
}: {
  t: ReturnType<typeof useTranslations<"fieldAccess">>;
}) {
  const icons = useInstallIconTags();
  const steps = [
    t.rich("iosStep1", icons),
    t.rich("iosStep2", icons),
    t("iosStep3"),
    t("iosStep4"),
  ];
  return (
    <div className="surface-panel rounded-xl p-4" data-testid="ios-install-steps">
      <p className="flex items-center gap-2 text-base font-semibold">
        <Share className="size-5 text-primary" />
        {t("iosStepsTitle")}
      </p>
      <ol className="mt-3 grid gap-3">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-3 text-base leading-7">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm leading-5 text-muted-foreground">
        {t("iosStepsNote")}
      </p>
    </div>
  );
}

/**
 * An arrow at the foot of the screen, pointing at Safari's bottom bar where
 * the first button to tap is. Fixed above the home indicator; it never
 * covers the steps (the page has room below for it).
 */
function SafariBarArrow({
  t,
}: {
  t: ReturnType<typeof useTranslations<"fieldAccess">>;
}) {
  return (
    <>
      <div aria-hidden className="h-20" />
      <div
        data-testid="safari-bar-arrow"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
      >
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow-glow-sm">
          {t("iosArrowHint")}
        </span>
        <ArrowDown className="size-9 animate-bounce text-primary motion-reduce:animate-none" strokeWidth={2.75} />
      </div>
    </>
  );
}

/** Android without a ready install prompt: the browser menu, step by step. */
function AndroidSteps({
  t,
  unavailable,
}: {
  t: ReturnType<typeof useTranslations<"fieldAccess">>;
  unavailable: boolean;
}) {
  const icons = useInstallIconTags();
  const steps = [t.rich("androidStep1", icons), t("androidStep2"), t("androidStep3")];
  return (
    <div className="surface-panel rounded-xl p-4" data-testid="android-install-steps">
      <p className="flex items-center gap-2 text-base font-semibold">
        <Menu className="size-5 text-primary" />
        {t("androidStepsTitle")}
      </p>
      <ol className="mt-3 grid gap-3">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-3 text-base leading-7">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {unavailable && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm leading-5 text-warning">
          {t("installUnavailable")}
        </p>
      )}
    </div>
  );
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
