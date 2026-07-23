"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RadioTower,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { GatewayDevice } from "@/interfaces/weighing";
import {
  createGateway,
  getGateways,
  rotateGatewaySecret,
} from "@/services/weighing.service";
import { useDateFormat } from "@/lib/dates";

/**
 * The gateways feeding one weighbridge.
 *
 * The secret is the whole security model: every packet is signed with it, and
 * without a valid signature anyone could post weight evidence as this
 * customer. So it appears exactly once, at the moment it is minted, and the
 * platform never serialises it again. A lost secret is rotated, not recovered.
 */
export function GatewayPanel({ scaleId }: { scaleId: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();

  const [registering, setRegistering] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [rotating, setRotating] = useState<GatewayDevice | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["gateways", scaleId],
    queryFn: () => getGateways(scaleId),
  });

  const registration = useMutation({
    mutationFn: () => createGateway(scaleId, { device_id: deviceId.trim() }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["gateways", scaleId] });
      setRegistering(false);
      setDeviceId("");
      setRevealed(result.secret);
    },
  });

  const rotation = useMutation({
    mutationFn: (gateway: GatewayDevice) =>
      rotateGatewaySecret(scaleId, gateway.id, reason),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["gateways", scaleId] });
      setRotating(null);
      setReason("");
      setRevealed(result.secret);
    },
  });

  const gateways = data?.results ?? [];

  return (
    <section className="px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("gateways.title")}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full px-4"
          onClick={() => setRegistering(true)}
        >
          <Plus className="h-4 w-4" />
          {t("gateways.new")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : gateways.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t("gateways.none")}
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {gateways.map((gateway) => (
            <div
              key={gateway.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <RadioTower className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{gateway.device_id}</p>
                <p className="text-xs text-muted-foreground">
                  {gateway.last_seen_at
                    ? df.relative(gateway.last_seen_at)
                    : t("common.emptyValue")}
                  {gateway.clock_offset_ms !== null &&
                    ` · ${t("gateways.field.clockOffset")} ${gateway.clock_offset_ms}ms`}
                </p>
              </div>
              <StatusBadge
                label={
                  gateway.is_online ? t("gateways.online") : t("gateways.offline")
                }
                tone={gateway.is_online ? "positive" : "neutral"}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setRotating(gateway)}
              >
                <KeyRound className="h-3.5 w-3.5" />
                {t("gateways.rotate")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={registering}
        onOpenChange={(next) => !next && setRegistering(false)}
      >
        <DialogContent className="sm:max-w-[440px] [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{t("gateways.new")}</DialogTitle>
            <DialogDescription>{t("gateways.secretBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("gateways.field.deviceId")}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              placeholder="GW-0001"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              onClick={() => setRegistering(false)}
            >
              <X className="h-4 w-4" />
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              className="rounded-full px-4 shadow-sm"
              disabled={registration.isPending || deviceId.trim() === ""}
              onClick={() => registration.mutate()}
            >
              {registration.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("gateways.new")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SecretDialog secret={revealed} onClose={() => setRevealed(null)} />

      {rotating && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setRotating(null);
            setReason("");
          }}
          title={t("gateways.rotateTitle", { name: rotating.device_id })}
          description={t("gateways.rotateBody")}
          confirmLabel={t("gateways.rotate")}
          confirmIcon={KeyRound}
          variant="destructive"
          isPending={rotation.isPending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() => rotation.mutate(rotating)}
        />
      )}
    </section>
  );
}

/**
 * Shows a freshly minted secret, once.
 *
 * Deliberately awkward to dismiss by accident: no close button in the corner,
 * and the only way out is a button that says the secret is gone. Someone who
 * clicks past this has to rotate and reinstall on the physical device.
 */
function SecretDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  if (secret === null) return null;

  async function copy() {
    await navigator.clipboard.writeText(secret as string);
    setCopied(true);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-warning" />
            {t("gateways.secretTitle")}
          </DialogTitle>
          <DialogDescription>{t("gateways.secretBody")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">
            {secret}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full px-3"
            onClick={() => void copy()}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </div>

        <DialogFooter>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            // Closing is blocked until the secret has been copied. Clicking
            // past this dialog means a trip back to the yard to reinstall.
            disabled={!copied}
            title={copied ? undefined : t("common.copyFirst")}
            onClick={onClose}
          >
            <Check className="h-4 w-4" />
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
