"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectColumnPicker } from "@/components/site-operations/project-column-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { EquipmentMovement, SiteEquipment } from "@/interfaces/contractor-ops";
import {
  getEquipmentMovements,
  requestEquipmentMovement,
  reviewEquipmentMovement,
} from "@/services/contractor-ops.service";
import { getSuppliers } from "@/services/contractor.service";

/**
 * Equipment in and out since 10-02 (B13, E01):
 * 申请 → 后台 Approve / Return → 实际交接时现场人员 + 供应商／司机双方签名.
 *
 * These are the first two steps; the handover is `MovementDialog`, which
 * now completes an approved application. Every step belongs to the one
 * machine. No same-day Reject for equipment - that is the material receipt's.
 */

const UNITS = ["UNIT", "PIECE", "SET", "LOAD", "TONNE", "KG", "M3", "OTHER"] as const;

/** Each machine's application still open - waiting for approval or for the handover. */
export function useOpenEquipmentApplications(project?: string) {
  const query = useQuery({
    queryKey: ["equipment-movements", "open", project ?? ""],
    queryFn: async () => {
      const [pending, approved] = await Promise.all([
        getEquipmentMovements({ project: project || undefined, status: "PENDING", page_size: 200 }),
        getEquipmentMovements({ project: project || undefined, status: "APPROVED", page_size: 200 }),
      ]);
      return [...pending.results, ...approved.results];
    },
  });
  const byEquipment = new Map<string, EquipmentMovement>();
  for (const row of query.data ?? []) byEquipment.set(row.equipment, row);
  // A failed read would show every machine as "apply" when one may already
  // be waiting; the screens say so with `OpenApplicationsFailed`.
  return { query, byEquipment, failed: query.isError };
}

/** Said where the machines are listed, when the open applications could not be read. */
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
  if (status === "RETURNED") return "danger" as const;
  if (status === "APPROVED") return "info" as const;
  return "warning" as const;
}

/**
 * Apply to move one machine in or out, or to bring in a machine nobody has
 * registered yet (the phone's 新增设备进场).
 */
export function ApplyMovementDialog({
  project,
  machine,
  onClose,
  onSaved,
}: {
  project: string;
  /** Absent for a new machine coming in. */
  machine?: SiteEquipment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const direction = machine?.status === "ON_SITE" ? "EXIT" : "ENTRY";
  const [form, setForm] = useState({
    equipment_name: "",
    category: "",
    supplier: "",
    registration_no: "",
    quantity: "1",
    unit: "UNIT" as (typeof UNITS)[number],
    notes: "",
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const suppliers = useQuery({
    queryKey: ["suppliers", "equipment-application"],
    queryFn: () => getSuppliers({ page_size: 200, sort_by: "name" }),
    enabled: !machine,
  });
  const save = useMutation({
    mutationFn: () =>
      requestEquipmentMovement({
        project,
        direction,
        ...(machine
          ? { equipment: machine.id }
          : {
              equipment_name: form.equipment_name.trim(),
              category: form.category,
              supplier: form.supplier || undefined,
              registration_no: form.registration_no.trim() || undefined,
            }),
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
          <DialogTitle>
            {machine
              ? t(direction === "EXIT" ? "equipment.applyExitTitle" : "equipment.applyEntryTitle", {
                  name: machine.name,
                })
              : t("equipment.applyNewTitle")}
          </DialogTitle>
          <DialogDescription>{t("equipment.applyHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!machine && (
            <>
              <FieldWrapper label={t("field.name")} required className="sm:col-span-2">
                <Input value={form.equipment_name} onChange={(e) => set("equipment_name", e.target.value)} />
              </FieldWrapper>
              <ProjectColumnPicker
                project={project}
                kind="EQUIPMENT"
                value={form.category}
                onChange={(value) => set("category", value)}
                className="sm:col-span-2"
              />
              <FieldWrapper label={t("field.supplier")}>
                <Select value={form.supplier || undefined} onValueChange={(value) => set("supplier", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("equipment.chooseSupplier")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliers.data?.results ?? [])
                      .filter((row) => row.is_active)
                      .map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <QueryFailedNote query={suppliers} what={t("what.suppliers")} />
              </FieldWrapper>
              <FieldWrapper label={t("field.registrationNo")}>
                <Input
                  value={form.registration_no}
                  onChange={(e) => set("registration_no", e.target.value.toUpperCase())}
                />
              </FieldWrapper>
            </>
          )}
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
            requires={[
              [machine || form.equipment_name.trim(), t("field.name")],
              [machine || form.category, t("field.category")],
              [Number(form.quantity) > 0, t("field.quantity")],
            ]}
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
 * The office's only part (B13): Approve, or Return with a reason, which ends
 * the application. No signature here; the two that count are at the handover.
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
  if (!can("equipment.manage") || movement.status !== "PENDING") return null;
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

/** Where one machine is in the flow, and the button for the next step. */
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
  if (!can("equipment.capture")) return null;
  if (open?.status === "PENDING") {
    return <StatusBadge label={t("equipmentMovementStatus.PENDING")} tone="warning" />;
  }
  if (open?.status === "APPROVED") {
    return (
      <Button size="sm" onClick={() => onHandover(open)}>
        {t("equipment.handover")}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={onApply}>
      {t(machine.status === "ON_SITE" ? "equipment.applyExit" : "equipment.applyEntry")}
    </Button>
  );
}
