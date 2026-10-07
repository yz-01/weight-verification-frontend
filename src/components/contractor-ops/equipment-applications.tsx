"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, RotateCcw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { EquipmentMovement, SiteEquipment } from "@/interfaces/contractor-ops";
import {
  getEquipmentMovements,
  requestEquipmentMovement,
  reviewEquipmentEntry,
  reviewEquipmentMovement,
} from "@/services/contractor-ops.service";

/**
 * Equipment in and out.
 *
 * In (2026-10 X2, C8): recorded on site in one step - photos, DO, both
 * signatures - and accepted by the office here (`EntryAcceptance`), the way a
 * material delivery is. Nothing is applied for.
 *
 * Out (B13, until the Return Note flow replaces it, X3):
 * 申请 → 后台 Approve / Return → 实际交接时现场人员 + 供应商／司机双方签名.
 * The handover is `MovementDialog`. Every step belongs to the one machine.
 */

const UNITS = ["UNIT", "PIECE", "SET", "LOAD", "TONNE", "KG", "M3", "OTHER"] as const;

/**
 * Each machine's movement still open: an exit waiting for approval or for the
 * handover, an entry waiting for the office's acceptance, or an entry applied
 * for before X2 and not handed over yet.
 */
export function useOpenEquipmentApplications(project?: string) {
  const query = useQuery({
    queryKey: ["equipment-movements", "open", project ?? ""],
    queryFn: async () => {
      const pages = await Promise.all(
        (["PENDING", "APPROVED", "SUBMITTED"] as const).map((status) =>
          getEquipmentMovements({ project: project || undefined, status, page_size: 200 }),
        ),
      );
      return pages.flatMap((page) => page.results);
    },
  });
  const byEquipment = new Map<string, EquipmentMovement>();
  for (const row of query.data ?? []) byEquipment.set(row.equipment, row);
  // A failed read would show every machine as ready for its next step when
  // one may already be waiting; the screens say so with `OpenApplicationsFailed`.
  return { query, byEquipment, failed: query.isError };
}

/** Said where the machines are listed, when the open movements could not be read. */
export function OpenApplicationsFailed({
  open,
}: {
  open: ReturnType<typeof useOpenEquipmentApplications>;
}) {
  const t = useTranslations("contractorOps");
  return <QueryFailedNote query={open.query} what={t("what.equipmentApplications")} />;
}

export function movementTone(status?: string) {
  if (status === "COMPLETED") return "positive" as const;
  if (status === "RETURNED" || status === "REJECTED") return "danger" as const;
  if (status === "APPROVED") return "info" as const;
  return "warning" as const;
}

/**
 * Apply to take one machine out (B13). Entries are not applied for any more
 * (X2) - the old `ApplyMovementDialog`, with its category and new-machine
 * fields, went with that.
 */
export function ApplyExitDialog({
  machine,
  onClose,
  onSaved,
}: {
  machine: SiteEquipment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const [form, setForm] = useState({
    quantity: "1",
    unit: "UNIT" as (typeof UNITS)[number],
    notes: "",
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      requestEquipmentMovement({
        project: machine.project,
        equipment: machine.id,
        direction: "EXIT",
        quantity: form.quantity,
        unit: form.unit,
        notes: form.notes.trim() || undefined,
        client_event_id: crypto.randomUUID(),
      }),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors).join("; ") || failure.message
          : t("equipment.applyFailed"),
      ),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("equipment.applyExitTitle", { name: machine.name })}</DialogTitle>
          <DialogDescription>{t("equipment.applyHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.quantity")} required>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.unit")} required>
            <Select value={form.unit} onValueChange={(value) => set("unit", value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.notes")} className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </FieldWrapper>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[[Number(form.quantity) > 0, t("field.quantity")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("equipment.applySubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The office's part of an exit (B13): Approve, or Return with a reason, which
 * ends the application. No signature here; the two that count are at the
 * handover. An old entry application still PENDING is not approved any more -
 * it is handed over directly (`EquipmentMovementActions`).
 */
export function ReviewMovementActions({
  movement,
  onDone,
}: {
  movement: EquipmentMovement;
  onDone: (row: EquipmentMovement) => void;
}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const qc = useQueryClient();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: (status: "APPROVED" | "RETURNED") =>
      reviewEquipmentMovement(movement.id, status, status === "RETURNED" ? note.trim() : ""),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
      void qc.invalidateQueries({ queryKey: ["site-equipment"] });
      setReturning(false);
      onDone(row);
    },
  });
  if (!can("equipment.manage") || movement.status !== "PENDING" || movement.direction !== "EXIT") {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setReturning((open) => !open)}>
          <RotateCcw />
          {t("equipment.returnAction")}
        </Button>
        <Button disabled={review.isPending} onClick={() => review.mutate("APPROVED")}>
          <Check />
          {t("action.approve")}
        </Button>
      </div>
      {returning && (
        <div className="space-y-2 rounded-md border p-2">
          <FieldWrapper label={t("equipment.returnReason")} required>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FieldWrapper>
          <Button
            size="sm"
            variant="destructive"
            requires={[[note.trim(), t("equipment.returnReason")]]}
            disabled={review.isPending}
            onClick={() => review.mutate("RETURNED")}
          >
            {t("equipment.returnConfirm")}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The office accepts an entry recorded on site, or does not (2026-10 C8).
 *
 * As 材料进场's 验收 (`ReviewDelivery`): one button to accept, and a rejection
 * behind a switch (spec rule 8 - no confirmation dialog). A 「新设备」 cannot be
 * accepted until its profile is complete, so that is said first, with the
 * button that opens the profile.
 */
export function EntryAcceptance({
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
  const review = useMutation({
    mutationFn: (decision: "ACCEPTED" | "REJECTED") =>
      reviewEquipmentEntry(movement.id, decision, decision === "REJECTED" ? reason.trim() : ""),
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
  if (movement.direction !== "ENTRY" || movement.status !== "SUBMITTED") return null;
  const missing = movement.equipment_needs_profile ? movement.equipment_profile_missing ?? [] : [];
  return (
    <div className="space-y-2" data-testid="equipment-entry-acceptance">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("equipment.acceptance.title")}
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
          <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Switch
              checked={armed}
              onCheckedChange={(next) => {
                setArmed(next);
                if (!next) setReason("");
              }}
              aria-label={t("equipment.acceptance.armReject")}
            />
            <span className="text-xs text-muted-foreground">{t("equipment.acceptance.armRejectHelp")}</span>
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
 * module's detail and the 总部 approval list show the same buttons:
 * accept an entry (C8), approve or return an exit (B13), or hand over an
 * entry applied for before X2 directly (「直接交接」).
 */
export function EquipmentMovementActions({
  movement,
  onDone,
  onHandover,
  onCompleteProfile,
}: {
  movement: EquipmentMovement;
  onDone: (row: EquipmentMovement) => void;
  /** Opens the handover of an old entry application; absent where it cannot. */
  onHandover?: (movement: EquipmentMovement) => void;
  /** Opens the machine's profile for a 「新设备」 (C8). */
  onCompleteProfile?: (machineId: string) => void;
}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const legacyEntry =
    movement.direction === "ENTRY" &&
    (movement.status === "PENDING" || movement.status === "APPROVED");
  return (
    <>
      <EntryAcceptance movement={movement} onDone={onDone} onCompleteProfile={onCompleteProfile} />
      <ReviewMovementActions movement={movement} onDone={onDone} />
      {legacyEntry && onHandover && (can("equipment.capture") || can("equipment.manage")) && (
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

/** Where one machine is in its exit, and the button for the next step (B13). */
export function MachineStep({
  machine,
  open,
  onApply,
  onHandover,
}: {
  machine: SiteEquipment;
  open?: EquipmentMovement;
  onApply: () => void;
  onHandover: (movement: EquipmentMovement) => void;
}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  if (!can("equipment.capture") || machine.status !== "ON_SITE") return null;
  if (open?.direction === "EXIT" && open.status === "PENDING") {
    return <StatusBadge label={t("equipmentMovementStatus.PENDING")} tone="warning" />;
  }
  if (open?.direction === "EXIT" && open.status === "APPROVED") {
    return (
      <Button size="sm" onClick={() => onHandover(open)}>
        {t("equipment.handover")}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={onApply}>
      {t("equipment.applyExit")}
    </Button>
  );
}
