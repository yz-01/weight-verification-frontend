"use client";

import { Camera, Download, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function FieldInstallReady({ token }: { token: string }) {
  const t = useTranslations("fieldAccess");
  const router = useRouter();
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIos] = useState(() =>
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent),
  );

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (standalone) {
      router.replace(
        token
          ? `/field-pwa-bootstrap?token=${encodeURIComponent(token)}`
          : "/field-staff",
      );
      return;
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [router, token]);

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
        <Button
          size="lg"
          className="h-14 text-base"
          onClick={() => router.replace("/field-staff")}
        >
          <Camera />
          {t("openWorkspace")}
        </Button>
        {installPrompt && (
          <Button
            size="lg"
            variant="outline"
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
