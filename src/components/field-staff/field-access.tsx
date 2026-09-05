"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Loader2, LogIn, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/interfaces/api";
import { setFieldBootstrapToken } from "@/lib/auth-token";
import { redirectWithFallback, safeReturnPath } from "@/lib/portal";
import { cacheBranding } from "@/lib/branding";
import {
  activateFieldDevice,
  fieldDeviceIdIsPersistent,
  fieldLogin,
  getOrCreateFieldDeviceId,
  inspectFieldInvitation,
} from "@/services/field-access.service";

export function FieldAccess() {
  const t = useTranslations("fieldAccess");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const token = searchParams.get("token") ?? "";
  const next = safeReturnPath(searchParams.get("next") ?? undefined);
  const invitation = useQuery({
    queryKey: ["field-invitation", token],
    queryFn: () => inspectFieldInvitation(token),
    enabled: Boolean(token),
    retry: false,
  });
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // True once a sign-in has proved this browser will not keep the device
  // id. Without this the refusal reads as the worker having done
  // something wrong, when the browser is discarding their identity.
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    if (!token || !invitation.data?.branding) return;
    document.title = invitation.data.branding.name;
    cacheBranding(invitation.data.branding, true);
  }, [invitation.data, token]);

  const submit = async () => {
    setError("");
    setPending(true);
    try {
      const deviceId = getOrCreateFieldDeviceId();
      // Discovered by writing and reading back, so it can only be known
      // after the call above.
      setStorageBlocked(!fieldDeviceIdIsPersistent());
      const result = token
        ? await activateFieldDevice({
            token,
            pin,
            device_id: deviceId,
            device_name: navigator.platform || t("thisPhone"),
          })
        : await fieldLogin({
            pin,
            device_id: deviceId,
          });
      setUser(result.user);
      const bootstrapToken = result.pwa_bootstrap?.token;
      // Kept so that installing later, from any screen, still produces an app
      // that opens signed in. This is the only moment it is handed to us.
      if (bootstrapToken) setFieldBootstrapToken(bootstrapToken);
      const destination = bootstrapToken
        ? `/trace/field-ready?bootstrap=${encodeURIComponent(bootstrapToken)}${
            next ? `&next=${encodeURIComponent(next)}` : ""
          }`
        : next ?? "/field-staff";
      redirectWithFallback(
        router,
        destination,
        150,
      );
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
        <h1 className="text-base font-semibold">{t("invalidTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("invalidBody")}</p>
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
          <h1 className="text-base font-semibold">{token ? t("activateTitle") : t("loginTitle")}</h1>
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
          <div className="space-y-2">
            <Label htmlFor="field-pin">{t("pin")}</Label>
            <Input
              id="field-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-12 text-center text-xl"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {storageBlocked && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              {t("storageBlocked")}
            </p>
          )}
          <Button
            size="lg"
            className="h-12 w-full text-sm"
            requires={[[pin.length === 6, t("pin")]]}
            disabled={pending}
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
