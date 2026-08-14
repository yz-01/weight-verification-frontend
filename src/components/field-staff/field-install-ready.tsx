"use client";

import { Camera, Download, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { hasFieldSession, markFieldAppContext } from "@/lib/auth-token";
import { iconPath } from "@/lib/branding";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function FieldInstallReady({ token }: { token: string }) {
  const t = useTranslations("fieldAccess");
  const router = useRouter();
  const { user } = useAuth();
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIos] = useState(() =>
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent),
  );

  useEffect(() => {
    const manifest =
      document.head.querySelector<HTMLLinkElement>(
        'link[data-mse-field-ready="manifest"]',
      ) ?? document.createElement("link");
    manifest.rel = "manifest";
    manifest.dataset.mseFieldReady = "manifest";
    manifest.href = token
      ? `/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`
      : "/manifest.webmanifest";
    if (!manifest.isConnected) document.head.appendChild(manifest);

    const icon =
      document.head.querySelector<HTMLLinkElement>(
        'link[data-mse-field-ready="icon"]',
      ) ?? document.createElement("link");
    icon.rel = "icon";
    icon.dataset.mseFieldReady = "icon";
    icon.href = iconPath(32, {
      bootstrap: token,
      revision: user?.branding.icon_url,
    });
    const apple =
      document.head.querySelector<HTMLLinkElement>(
        'link[data-mse-field-ready="apple"]',
      ) ?? document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.dataset.mseFieldReady = "apple";
    apple.sizes = "180x180";
    apple.href = iconPath(180, {
      bootstrap: token,
      revision: user?.branding.icon_url,
    });
    if (!icon.isConnected) document.head.appendChild(icon);
    if (!apple.isConnected) document.head.appendChild(apple);
    document.title = user?.branding.name ?? "MSE Trace";

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (standalone) {
      markFieldAppContext();
      router.replace(
        token
          ? `/field-pwa-bootstrap?token=${encodeURIComponent(token)}`
          : hasFieldSession()
            ? "/field-staff"
            : "/trace/field-login",
      );
      return;
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      router.replace("/field-staff");
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      manifest.remove();
      icon.remove();
      apple.remove();
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, [router, token, user?.branding.icon_url, user?.branding.name]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
      <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Camera className="size-10" />
      </span>
      <h1 className="text-2xl font-semibold">{t("readyTitle")}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {t("readyBody")}
      </p>
      <div className="grid w-full max-w-sm gap-3">
        {installPrompt && (
          <Button
            size="lg"
            className="h-14 text-base"
            onClick={async () => {
              await installPrompt.prompt();
              await installPrompt.userChoice;
              setInstallPrompt(null);
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
          onClick={() => router.replace("/field-staff")}
        >
          <Camera />
          {t("openWorkspace")}
        </Button>
        {isIos && (
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Share className="size-4" />
              {t("iosTitle")}
            </p>
            <p className="mt-1 text-muted-foreground">{t("iosBody")}</p>
          </div>
        )}
      </div>
    </main>
  );
}
