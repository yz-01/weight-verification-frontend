"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ReturnNoteDialog, type ReturnNoteSource } from "@/components/contractor-ops/return-note";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type { EquipmentMovement } from "@/interfaces/contractor-ops";
import {
  fillEquipmentExitReturnNote,
  reviewEquipmentEntry,
  reviewEquipmentExit,
  reviewEquipmentExitApplication,
} from "@/services/contractor-ops.service";

/**
 * Equipment in and out, the office's side.
 *
 * An entry is recorded on site in one step - photos, DO, the supplier's QR,
 * both signatures, GPS - and accepted by the office here
 * (`MovementAcceptance`), the way a material delivery is (2026-10 X2, C8).
 *
 * An exit goes the way material leaves site (2026-10 I13, ID30, overturning
 * Q27): the site applies, the office fills the Return Note and approves - or
 * returns it with a reason (`ExitApplicationActions`) -, the site records the
 * actual exit on the phone, and the office confirms it here
 * (`MovementAcceptance`). An entry applied for before the one-step flow and
 * still open is finished with 「直接交接」.
 */

/**
 * An exit as the Return Note sees it (I13): the same note as material's, so
 * the same dialog and panel - the machine in the material's place.
 */
export function equipmentReturnNoteSource(
  movement: EquipmentMovement,
  unitLabel: string,
): ReturnNoteSource {
  return {
    id: movement.id,
    reference_no: movement.equipment_registration_no || movement.equipment_code,
    material_name: [movement.equipment_name, movement.equipment_registration_no]
      .filter(Boolean)
      .join(" · "),
    quantity: movement.quantity,
    unit: movement.unit,
    unit_label: unitLabel,
    reason: movement.notes,
    delivery_note_no: movement.delivery_note_no,
    supplier: movement.supplier ?? null,
    supplier_name: movement.supplier_name,
    has_return_note: movement.has_return_note,
    return_note_no: movement.return_note_no,
    return_note_at: movement.return_note_at,
    return_note_by_name: movement.return_note_by_name,
    return_note_material: movement.return_note_material,
    return_note_delivery_note_no: movement.return_note_delivery_note_no,
    return_note_supplier: movement.return_note_supplier,
    return_note_supplier_name: movement.return_note_supplier_name,
    return_note_quantity: movement.return_note_quantity,
    return_note_unit: movement.return_note_unit,
    return_note_reason: movement.return_note_reason,
    approver_name: movement.approver_name,
    approver_user_name: movement.approver_user_name,
    approver_signature: movement.approver_signature,
  };
}

/**
 * The office's decision on an exit application (I13 step 2): fill the
 * Return Note, then approve - the button stays off, saying why, until the
 * note is filled (the server refuses it too) - or return it with a reason,
 * behind a switch (no confirmation dialog). Once approved it waits for the
 * site, and says so.
 */
export function ExitApplicationActions({
  movement,
  onDone,
}: {
  movement: EquipmentMovement;
  onDone: (row: EquipmentMovement) => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const { can } = useAuth();
  const qc = useQueryClient();
  const [noting, setNoting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
    void qc.invalidateQueries({ queryKey: ["site-equipment"] });
  };
  const decide = useMutation({
    mutationFn: (decision: "APPROVED" | "RETURNED") =>
      reviewEquipmentExitApplication(
        movement.id,
        decision,
        decision === "RETURNED" ? reason.trim() : "",
      ),
    onMutate: () => setError(""),
    onSuccess: (row) => {
      refresh();
      setArmed(false);
      setReason("");
      onDone(row);
    },
    onError: (failure) =>
      setError(failure instanceof ApiError ? failure.message : t("equipmentExit.office.failed")),
  });
  if (movement.direction !== "EXIT") return null;
  if (movement.status === "APPROVED") {
    return (
      <p className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm">
        {t("equipmentExit.office.waitingForSite")}
      </p>
    );
  }
  if (movement.status !== "PENDING") return null;
  if (!can("equipment.manage")) {
    return <p className="text-sm font-medium text-warning">{t("equipmentExit.status.PENDING")}</p>;
  }
  const needsNote = !movement.has_return_note;
  return (
    <div className="space-y-2" data-testid="equipment-exit-application">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("equipmentExit.office.applicationTitle")}
      </h3>
      <p className="text-sm font-medium text-warning">{t("equipmentExit.status.PENDING")}</p>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={needsNote ? "default" : "outline"} onClick={() => setNoting(true)}>
          <FileText />
          {needsNote ? t("returnNote.fill") : t("returnNote.edit")}
        </Button>
        <Button
          size="sm"
          variant={needsNote ? "outline" : "default"}
          disabled={decide.isPending || needsNote}
          disabledReason={needsNote ? t("returnNote.needNoteFirst") : common("saving")}
          onClick={() => decide.mutate("APPROVED")}
        >
          <Check />
          {t("action.approve")}
        </Button>
      </div>
      <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
        <Switch
          checked={armed}
          onCheckedChange={(next) => {
            setArmed(next);
            if (!next) setReason("");
          }}
          aria-label={t("equipmentExit.office.armReturn")}
        />
        <span className="text-xs text-muted-foreground">{t("equipmentExit.office.armReturnHelp")}</span>
      </label>
      {armed && (
        <div className="space-y-2">
          <FieldWrapper label={t("equipmentExit.office.returnReason")} required>
            <Input
              aria-label={t("equipmentExit.office.returnReason")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-8 text-sm"
            />
          </FieldWrapper>
          <Button
            size="sm"
            variant="destructive"
            requires={[[reason.trim(), t("equipmentExit.office.returnReason")]]}
            disabled={decide.isPending}
            onClick={() => decide.mutate("RETURNED")}
          >
            {t("equipmentExit.office.return")}
          </Button>
        </div>
      )}
      {noting && (
        <ReturnNoteDialog
          row={equipmentReturnNoteSource(movement, t("equipmentExit.unitMachine"))}
          save={async (id, payload) => {
            const row = await fillEquipmentExitReturnNote(id, payload);
            onDone(row);
            return row;
          }}
          refreshKey={["equipment-movements"]}
          machine
          onClose={() => setNoting(false)}
          onSaved={() => {
            setNoting(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

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
  // 「提交总部审批」 (I12, ID28): head office (or the company administrator,
  // who keeps the roles) decides a machine whose class sends it there; the
  // project's office decides the rest.
  const headOffice = Boolean(movement.review_by_head_office);
  const mayDecide = headOffice
    ? can("material_request.review") || can("role.update")
    : can("equipment.manage");
  return (
    <div className="space-y-2" data-testid="equipment-acceptance">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t(exit ? "equipment.acceptance.exitTitle" : "equipment.acceptance.title")}
      </h3>
      {/* An exit says where it stands in its own words: 已退场 / 待后台确认 (I13). */}
      <p className="text-sm font-medium text-warning">
        {t(exit ? "equipmentExit.status.SUBMITTED" : "equipmentMovementStatus.SUBMITTED")}
      </p>
      {/* 「二维码坏了 / 还没有贴？输入编号」 at the gate (P-phonefix). */}
      {exit && movement.equipment_typed && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          {t("equipmentExit.typedNotScanned")}
        </p>
      )}
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
      {headOffice && !mayDecide && (
        <p className="text-xs text-muted-foreground">{t("equipment.acceptance.headOffice")}</p>
      )}
      {mayDecide && (
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
 * Whatever the office does next with one movement, in one place: decide an
 * exit application on its Return Note (I13), accept an entry or confirm an
 * exit recorded on site (C8, I13), or hand over an entry applied for before
 * the one-step flow directly (「直接交接」), after which it is accepted the
 * same way.
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
  // An exit is never handed over directly any more (I13): it is decided on
  // its Return Note and recorded on the phone with the machine's QR scanned.
  const legacy =
    movement.direction === "ENTRY" &&
    (movement.status === "PENDING" || movement.status === "APPROVED");
  return (
    <>
      <ExitApplicationActions movement={movement} onDone={onDone} />
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
