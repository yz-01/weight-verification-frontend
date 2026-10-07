"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type { EquipmentMovement } from "@/interfaces/contractor-ops";
import {
  reviewEquipmentEntry,
  reviewEquipmentExit,
} from "@/services/contractor-ops.service";

/**
 * Equipment in and out, the office's side.
 *
 * Both directions are recorded on site in one step - photos, DO, the
 * supplier's QR, both signatures, GPS - and accepted by the office here
 * (`MovementAcceptance`), the way a material delivery is: the entry since
 * 2026-10 X2 (C8), the exit since Q27 (Lucas 2026-10-08: 「设备出厂一样」).
 * Nothing is applied for and nothing is approved; there is no Return Note for
 * a machine. An application made before that and still open is finished with
 * 「直接交接」 and then waits for the same acceptance.
 */

export function movementTone(status?: string) {
  if (status === "COMPLETED") return "positive" as const;
  if (status === "RETURNED" || status === "REJECTED") return "danger" as const;
  if (status === "APPROVED") return "info" as const;
  return "warning" as const;
}

/**
 * The office accepts a movement recorded on site, or does not (C8, Q27).
 *
 * As 材料进场's 验收 (`ReviewDelivery`): one button to accept, and a rejection
 * behind a switch (spec rule 8 - no confirmation dialog), with a reason.
 * Accepted, an entry puts the machine on site and an exit takes it off;
 * rejected, nothing moves. A 「新设备」's entry cannot be accepted until its
 * profile is complete, so that is said first, with the button that opens it.
 */
export function MovementAcceptance({
  movement,
  onDone,
  onCompleteProfile,
}: {
  movement: EquipmentMovement;
  onDone: (row: EquipmentMovement) => void;
  /** Opens the machine's profile; absent where it cannot be opened. */
  onCompleteProfile?: (machineId: string) => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const { can } = useAuth();
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const exit = movement.direction === "EXIT";
  const review = useMutation({
    mutationFn: (decision: "ACCEPTED" | "REJECTED") =>
      (exit ? reviewEquipmentExit : reviewEquipmentEntry)(
        movement.id,
        decision,
        decision === "REJECTED" ? reason.trim() : "",
      ),
    onMutate: () => setError(""),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
      void qc.invalidateQueries({ queryKey: ["site-equipment"] });
      void qc.invalidateQueries({ queryKey: ["equipment-summary"] });
      setArmed(false);
      setReason("");
      onDone(row);
    },
    onError: (failure) =>
      setError(failure instanceof ApiError ? failure.message : t("equipment.acceptance.failed")),
  });
  if (movement.status !== "SUBMITTED") return null;
  // Whenever the server says something is missing - a 「新设备」, or a machine
  // filed before B2 on no class or a flat one (Fable B4 #2) - so the office
  // is never left with an Accept that is refused and no way to fix it.
  const missing = exit ? [] : movement.equipment_profile_missing ?? [];
  return (
    <div className="space-y-2" data-testid="equipment-acceptance">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t(exit ? "equipment.acceptance.exitTitle" : "equipment.acceptance.title")}
      </h3>
      <p className="text-sm font-medium text-warning">{t("equipmentMovementStatus.SUBMITTED")}</p>
      {missing.length > 0 && (
        <div role="status" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          <p>
            {t("equipment.acceptance.profileMissing", {
              fields: missing.map((key) => t(`equipment.acceptance.missing.${key}`)).join(" / "),
            })}
          </p>
          {onCompleteProfile && can("equipment.manage") && (
            <Button size="sm" variant="outline" onClick={() => onCompleteProfile(movement.equipment)}>
              <Pencil />
              {t("equipment.acceptance.completeProfile")}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      {can("equipment.manage") && (
        <>
          {/* The server refuses it too (equipment_profile_incomplete); the
              note above says what is missing and opens the profile. */}
          <Button
            size="sm"
            disabled={review.isPending || missing.length > 0}
            disabledReason={
              missing.length > 0
                ? t("equipment.needsProfileHelp")
                : common("saving")
            }
            onClick={() => review.mutate("ACCEPTED")}
          >
            <Check />
            {t("equipment.acceptance.accept")}
          </Button>
          {exit && (
            <p className="text-xs text-muted-foreground">{t("equipment.acceptance.exitHelp")}</p>
          )}
          <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Switch
              checked={armed}
              onCheckedChange={(next) => {
                setArmed(next);
                if (!next) setReason("");
              }}
              aria-label={t(exit ? "equipment.acceptance.armRejectExit" : "equipment.acceptance.armReject")}
            />
            <span className="text-xs text-muted-foreground">
              {t(exit ? "equipment.acceptance.armRejectExitHelp" : "equipment.acceptance.armRejectHelp")}
            </span>
          </label>
          {armed && (
            <div className="space-y-2">
              <FieldWrapper label={t("equipment.acceptance.reason")} required>
                <Input
                  aria-label={t("equipment.acceptance.reason")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-8 text-sm"
                />
              </FieldWrapper>
              <Button
                size="sm"
                variant="destructive"
                requires={[[reason.trim(), t("equipment.acceptance.reason")]]}
                disabled={review.isPending}
                onClick={() => review.mutate("REJECTED")}
              >
                {t("equipment.acceptance.reject")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Whatever the office does next with one movement, in one place - the
 * module's detail and the 总部 approval list show the same buttons: accept an
 * entry or an exit (C8, Q27), or hand over an application made before the
 * one-step flow directly (「直接交接」), after which it is accepted the same way.
 */
export function EquipmentMovementActions({
  movement,
  onDone,
  onHandover,
  onCompleteProfile,
}: {
  movement: EquipmentMovement;
  onDone: (row: EquipmentMovement) => void;
  /** Opens the handover of an old application; absent where it cannot. */
  onHandover?: (movement: EquipmentMovement) => void;
  /** Opens the machine's profile for a 「新设备」 (C8). */
  onCompleteProfile?: (machineId: string) => void;
}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const legacy = movement.status === "PENDING" || movement.status === "APPROVED";
  return (
    <>
      <MovementAcceptance movement={movement} onDone={onDone} onCompleteProfile={onCompleteProfile} />
      {legacy && onHandover && (can("equipment.capture") || can("equipment.manage")) && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("equipment.directHandoverHelp")}</p>
          <Button size="sm" onClick={() => onHandover(movement)}>
            {t("equipment.directHandover")}
          </Button>
        </div>
      )}
    </>
  );
}
