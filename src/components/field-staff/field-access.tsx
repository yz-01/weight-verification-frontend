"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Download, Loader2, LogIn, Share, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/interfaces/api";
import {
  activateFieldDevice,
  fieldLogin,
  getOrCreateFieldDeviceId,
  inspectFieldInvitation,
} from "@/services/field-access.service";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function FieldAccess() {
  const t = useTranslations("fieldAccess");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const token = searchParams.get("token") ?? "";
  const invitation = useQuery({
    queryKey: ["field-invitation", token],
    queryFn: () => inspectFieldInvitation(token),
    enabled: Boolean(token),
    retry: false,
  });
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos] = useState(() =>
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent),
  );

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const submit = async () => {
    setError("");
    setPending(true);
    try {
      const deviceId = getOrCreateFieldDeviceId();
      const result = token
        ? await activateFieldDevice({
            token,
            pin,
            device_id: deviceId,
            device_name: navigator.platform || t("thisPhone"),
          })
        : await fieldLogin({ phone, pin, device_id: deviceId });
      await setUser(result.user);
      setReady(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("failed"));
    } finally {
      setPending(false);
    }
  };

  if (token && invitation.isLoading) {
    return <Centered><Loader2 className="size-8 animate-spin text-primary" /></Centered>;
  }

  if (token && invitation.isError) {
    return (
      <Centered>
        <Smartphone className="size-12 text-destructive" />
        <h1 className="text-xl font-semibold">{t("invalidTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("invalidBody")}</p>
      </Centered>
    );
  }

  if (ready) {
    return (
      <Centered>
        <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Camera className="size-10" />
        </span>
        <h1 className="text-2xl font-semibold">{t("readyTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("readyBody")}</p>
        <div className="grid w-full max-w-sm gap-3">
          <Button size="lg" className="h-14 text-base" onClick={() => router.replace("/field-staff")}>
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
              <p className="flex items-center gap-2 font-medium"><Share className="size-4" />{t("iosTitle")}</p>
              <p className="mt-1 text-muted-foreground">{t("iosBody")}</p>
            </div>
          )}
        </div>
      </Centered>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-5 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="bg-primary px-6 py-7 text-primary-foreground">
          <span className="mb-4 flex size-12 items-center justify-center rounded-lg bg-white/15">
            <Camera className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold">{token ? t("activateTitle") : t("loginTitle")}</h1>
          <p className="mt-1 text-sm text-primary-foreground/80">
            {token ? invitation.data?.full_name : t("loginBody")}
          </p>
        </div>
        <div className="space-y-5 p-6">
          {token && invitation.data && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{invitation.data.projects.map((project) => project.name).join(", ")}</p>
              <p className="mt-1 text-muted-foreground">{invitation.data.phone}</p>
            </div>
          )}
          {!token && (
            <div className="space-y-2">
              <Label htmlFor="field-phone">{t("phone")}</Label>
              <Input
                id="field-phone"
                inputMode="tel"
                autoComplete="tel"
                className="h-12 text-base"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="field-pin">{t("pin")}</Label>
            <Input
              id="field-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-14 text-center text-2xl"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={pin.length !== 6 || (!token && !phone.trim()) || pending}
            onClick={() => void submit()}
          >
            {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
            {token ? t("bind") : t("signIn")}
          </Button>
        </div>
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">{children}</main>;
}
