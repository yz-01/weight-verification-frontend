"use client";

/**
 * 材料领用 (JB168, 客户 11-11 「材料出场功能优化 — 支持材料领用」).
 *
 * 「手机端「材料出场」沿用现有页面，提供「材料出场」及「材料领用」两个操作选项。
 * 选择「材料领用」后：供应商栏改为扫描现有设备二维码，自动显示设备编号及所属公司。
 * 领用人姓名直接手动填写。材料名称、规格、单位、数量沿用现有填写方式。数量栏显示为
 * 「领用数量」。……一张申请可包含多种材料，每项分别记录实际领用数量。」
 *
 * An issue is a material-outgoing record of kind ISSUE: the same list, the
 * same approval, the same handover dialog and detail - this file holds only
 * what an issue does differently:
 *
 * - `OutgoingKindChooser`: the two big choices on the phone's 材料出场;
 * - `IssueDialog`: 「申请材料领用」 - the machine scanned (or its number typed,
 *   as the equipment flows allow), the 领用人 typed, several materials chosen
 *   the way a return's material is;
 * - `IssueHandoverForm`: 「正式领用」 - each material's actual quantity,
 *   photographs, GPS or 「没有定位」, 发料负责人 and 领用人 sign;
 * - `IssueLinesPanel`: every material on the detail, with its stock on the
 *   project and the money for the office;
 * - `OutgoingKindSwitch` and `MaterialIssueList`: the office's 「材料领用」
 *   view of 材料出场, with exactly the client's filters and columns.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Eye, Loader2, Plus, Save, Trash2, Undo2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { MachineNumberField, MachineScanButton } from "@/components/contractor-ops/equipment-exit";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { LocationField } from "@/components/field-staff/location-field";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectListFilter } from "@/components/shared/module-records-table";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type {
  MaterialIssueListRow,
  MaterialOutgoing,
  ProjectCategory,
  SiteEquipment,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import type { LocationValue } from "@/lib/field-location";
import { columnAutofill } from "@/lib/material-autofill";
import { isOtherMaterial, offeredSpecs, specChoice } from "@/lib/material-catalogue";
import {
  getMaterialIssueLines,
  getMaterialIssueOptions,
  getProjectCategories,
  getSiteEquipment,
} from "@/services/contractor-ops.service";
import {
  newClientEventId,
  submitMaterialOutgoingExitOfflineAware,
  submitMaterialOutgoingOfflineAware,
} from "@/services/offline-sync.service";

/** Whether a record is a 材料领用 (a cached row from before JB168 is a return). */
export function isIssue(row: Pick<MaterialOutgoing, "kind"> | null | undefined): boolean {
  return row?.kind === "ISSUE";
}

/** A status in an issue's own words (「已批准 / 等待领用」, not 「等待退场」). */
export function issueStatusKey(status: MaterialOutgoing["status"]): string {
  return `issue.status.${status}`;
}

/* ------------------------------------------------------------------ */
/* The phone: the two choices                                           */
/* ------------------------------------------------------------------ */

/**
 * 「提供「材料出场」及「材料领用」两个操作选项」: two big plain buttons, the
 * first thing on the phone's 材料出场 - site staff use phones outdoors.
 */
export function OutgoingKindChooser({
  onReturn,
  onIssue,
}: {
  onReturn: () => void;
  onIssue: () => void;
}) {
  const t = useTranslations("contractorOps");
  return (
    <section aria-label={t("issue.choose")} className="grid gap-3 sm:grid-cols-2">
      <Button
        variant="outline"
        className="h-auto min-h-20 flex-col items-start gap-1 whitespace-normal px-4 py-3 text-left"
        onClick={onReturn}
        data-testid="outgoing-choose-return"
      >
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Undo2 className="size-5" />
          {t("issue.chooseReturn")}
        </span>
        <span className="text-sm text-muted-foreground">{t("issue.chooseReturnHint")}</span>
      </Button>
      <Button
        className="h-auto min-h-20 flex-col items-start gap-1 whitespace-normal px-4 py-3 text-left"
        onClick={onIssue}
        data-testid="outgoing-choose-issue"
      >
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Wrench className="size-5" />
          {t("issue.chooseIssue")}
        </span>
        <span className="text-sm opacity-90">{t("issue.chooseIssueHint")}</span>
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The phone: 申请材料领用                                               */
/* ------------------------------------------------------------------ */

/** One material as the form holds it, before it is sent. */
export interface IssueLineDraft {
  key: string;
  category: string;
  spec_category: string;
  material_specification: string;
  material_name: string;
  unit: string;
  quantity: string;
}

export function emptyIssueLine(): IssueLineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    category: "",
    spec_category: "",
    material_specification: "",
    material_name: "",
    unit: "",
    quantity: "",
  };
}

/** What the unit of a line is, as the return's form decides it. */
function lineUnit(line: IssueLineDraft, material: ProjectCategory | undefined): {
  unit: string;
  locked: boolean;
} {
  const pick = specChoice(material, line.spec_category);
  const fill = columnAutofill(material, { unit: line.unit, supplier: "", manufacturer: "" });
  if (pick.unitLocked) return { unit: pick.unit, locked: true };
  if (fill.unitLocked && !pick.typed) return { unit: fill.unit, locked: true };
  return { unit: line.unit, locked: false };
}

/**
 * The payload line the server checks with a return's own rules: the
 * material, a specification or 「其他」 typed, the unit and the quantity.
 */
export function issueLinePayload(line: IssueLineDraft, material: ProjectCategory | undefined) {
  const pick = specChoice(material, line.spec_category);
  return {
    category: line.category,
    spec_category: line.spec_category || undefined,
    material_specification: pick.typed ? line.material_specification.trim() : undefined,
    material_name: isOtherMaterial(material) ? line.material_name.trim() : undefined,
    unit: lineUnit(line, material).unit,
    quantity: line.quantity,
  };
}

/** Whether a line can be sent: a material, its unit and a quantity above zero. */
export function issueLineReady(line: IssueLineDraft, material: ProjectCategory | undefined): boolean {
  return Boolean(line.category && lineUnit(line, material).unit && Number(line.quantity) > 0);
}

function IssueLineEditor({
  index,
  line,
  materials,
  onChange,
  onRemove,
}: {
  index: number;
  line: IssueLineDraft;
  materials: ProjectCategory[];
  onChange: (next: IssueLineDraft) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("contractorOps");
  const units = useMaterialUnits();
  const unitName = useUnitName();
  const material = materials.find((row) => row.id === line.category);
  const specs = offeredSpecs(material, line.spec_category);
  const pick = specChoice(material, line.spec_category);
  const unit = lineUnit(line, material);
  const set = (patch: Partial<IssueLineDraft>) => onChange({ ...line, ...patch });
  return (
    <fieldset className="space-y-3 rounded-xl border p-3" data-testid="issue-line">
      <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold">
        {t("issue.lineTitle", { n: index + 1 })}
      </legend>
      <FieldWrapper label={t("issue.material")} required>
        <Select
          value={line.category || undefined}
          onValueChange={(category) => {
            const chosen = materials.find((row) => row.id === category);
            onChange({
              ...line,
              category,
              spec_category: "",
              material_specification: "",
              unit: columnAutofill(chosen, { unit: "", supplier: "", manufacturer: "" }).unit,
            });
          }}
        >
          <SelectTrigger className="h-12 w-full text-base" aria-label={t("issue.material")}>
            <SelectValue placeholder={t("outgoing.chooseMaterial")} />
          </SelectTrigger>
          <SelectContent>
            {materials.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldWrapper>
      {isOtherMaterial(material) && (
        <FieldWrapper label={t("outgoing.materialName")} hint={t("outgoing.materialNameHint")}>
          <Input
            className="h-12 text-base"
            value={line.material_name}
            maxLength={200}
            onChange={(event) => set({ material_name: event.target.value })}
          />
        </FieldWrapper>
      )}
      {material && specs.length > 0 && (
        <FieldWrapper label={t("issue.spec")} hint={t("outgoing.specOptionalHint")}>
          <Select
            value={line.spec_category || undefined}
            onValueChange={(next) => set({ spec_category: next, material_specification: "" })}
          >
            <SelectTrigger className="h-12 w-full text-base" aria-label={t("issue.spec")}>
              <SelectValue placeholder={t("outgoing.chooseSpec")} />
            </SelectTrigger>
            <SelectContent>
              {specs.map((spec) => (
                <SelectItem key={spec.id} value={spec.id}>
                  {spec.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      )}
      {pick.typed && (
        <FieldWrapper label={t("outgoing.specName")}>
          <Input
            className="h-12 text-base"
            value={line.material_specification}
            maxLength={200}
            onChange={(event) => set({ material_specification: event.target.value })}
          />
        </FieldWrapper>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("issue.quantity")} required>
          <Input
            className="h-12 text-base"
            type="number"
            min="0.001"
            step="0.001"
            inputMode="decimal"
            value={line.quantity}
            aria-label={t("issue.quantity")}
            onChange={(event) => set({ quantity: event.target.value })}
          />
        </FieldWrapper>
        <FieldWrapper label={t("issue.unit")} required>
          {unit.locked ? (
            <div className="flex h-12 items-center rounded-lg border bg-muted/40 px-3 text-base font-medium">
              {unitName(unit.unit)}
            </div>
          ) : (
            <Select value={line.unit || undefined} onValueChange={(next) => set({ unit: next })}>
              <SelectTrigger className="h-12 w-full text-base" aria-label={t("issue.unit")}>
                <SelectValue placeholder={t("issue.unit")} />
              </SelectTrigger>
              <SelectContent>
                {(units.data ?? []).map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {unitName(row.code, row.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <QueryFailedNote query={units} what={t("issue.unit")} />
        </FieldWrapper>
      </div>
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
          <Trash2 />
          {t("issue.removeMaterial")}
        </Button>
      )}
    </fieldset>
  );
}

/** The machine as the register says it now: 设备编号 and 所属公司. */
export function machineNumber(machine: Pick<SiteEquipment, "site_no" | "code">): string {
  return (machine.site_no || machine.code || "").trim();
}

/**
 * 「申请材料领用」 on the phone (JB168). Queued like a return when there is no
 * signal; the 领用编号 comes back from the server and is said at once.
 */
export function IssueDialog({
  project: initialProject,
  onClose,
  onSaved,
}: {
  project: string;
  onClose: () => void;
  /**
   * ``eventId`` is the application's own id: once uploaded, the record (and
   * its 领用编号) is found by it; ``queued`` when it waits on the phone.
   */
  onSaved: (outcome: { eventId: string; queued: boolean }) => void;
}) {
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const [project, setProject] = useDraftState("issue:project", initialProject);
  const [machineId, setMachineId] = useDraftState("issue:machine", "");
  const [recipient, setRecipient] = useDraftState("issue:recipient", "");
  const [lines, setLines] = useDraftState<IssueLineDraft[]>("issue:lines", () => [emptyIssueLine()]);
  const [photos, setPhotos] = useDraftState("issue:photos", createEmptyFieldEvidence);
  const [note, setNote] = useDraftState("issue:note", "");
  const [clientEventId, setClientEventId] = useDraftState("issue:clientEventId", "");
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [error, setError] = useState("");
  const machines = useQuery({
    queryKey: ["site-equipment", "field", project],
    queryFn: () => getSiteEquipment({ project: project || undefined, page_size: 200 }),
    enabled: Boolean(project),
  });
  const materials = useQuery({
    queryKey: ["project-categories", "outgoing", project],
    queryFn: () =>
      getProjectCategories({
        project,
        kind: "MATERIAL",
        is_active: true,
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(project),
    staleTime: 30_000,
  });
  const materialRows: ProjectCategory[] = materials.data?.results ?? [];
  // Any working machine of this project: material goes to what is there.
  const machineRows = (machines.data?.results ?? []).filter((row) => row.is_active);
  const machine = machineRows.find((row) => row.id === machineId) ?? null;
  const photoPrompts = [
    t("outgoing.evidence.overview"),
    t("outgoing.evidence.quantity"),
    t("outgoing.evidence.vehicle"),
    t("outgoing.evidence.loading"),
  ];
  const taken = photos.filter((file): file is File => Boolean(file));
  const materialOf = (line: IssueLineDraft) => materialRows.find((row) => row.id === line.category);
  const allReady = lines.length > 0 && lines.every((line) => issueLineReady(line, materialOf(line)));
  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Authentication required.");
      const eventId = clientEventId || newClientEventId("material-issue");
      if (!clientEventId) setClientEventId(eventId);
      const outcome = await submitMaterialOutgoingOfflineAware(user.id, {
        project,
        kind: "ISSUE",
        equipment: machineId,
        recipient_name: recipient.trim(),
        lines: JSON.stringify(lines.map((line) => issueLinePayload(line, materialOf(line)))),
        quantity: lines[0]?.quantity ?? "",
        executor_name: user.full_name,
        reason: note.trim(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        client_event_id: eventId,
        photos: taken,
        photo_captions: taken.map((_, index) =>
          index < photoPrompts.length ? photoPrompts[index] : t("outgoing.evidence.other"),
        ),
      });
      return { outcome, eventId };
    },
    onSuccess: ({ outcome, eventId }) => {
      clearDraft();
      onSaved({ eventId, queued: outcome === "queued" });
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors).flat().join("; ") || failure.message
          : t("issue.handoverFailed"),
      ),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("issue.createTitle")}</DialogTitle>
          <DialogDescription>{t("issue.createHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldWrapper label={t("field.project")} required>
            <ProjectPicker
              value={project}
              onValueChange={(next) => {
                setProject(next);
                setMachineId("");
                setLines([emptyIssueLine()]);
              }}
              placeholder={t("field.selectProject")}
              disabled={Boolean(initialProject) && isFieldStaff}
            />
          </FieldWrapper>
          <FieldWrapper label={t("issue.equipment")} required>
            {machine ? (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-3" data-testid="issue-machine">
                <p className="text-base font-semibold">{machine.name}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
                  <dt className="text-muted-foreground">{t("issue.equipmentNo")}</dt>
                  <dd className="font-semibold">{machineNumber(machine)}</dd>
                  <dt className="text-muted-foreground">{t("issue.equipmentCompany")}</dt>
                  <dd className="font-semibold">{machine.supplier_name || t("issue.noCompany")}</dd>
                </dl>
                <Button variant="outline" size="sm" onClick={() => setMachineId("")}>
                  {t("issue.rescan")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <MachineScanButton
                  project={project}
                  machines={machineRows}
                  offered={machineRows}
                  going
                  disabled={!project}
                  onChosen={(chosen) => setMachineId(chosen.id)}
                />
                {/* The same fallback the equipment flows offer: the number on the machine. */}
                <MachineNumberField
                  project={project}
                  machines={machineRows}
                  offered={machineRows}
                  disabled={!project}
                  onChosen={(chosen) => setMachineId(chosen.id)}
                />
                <QueryFailedNote query={machines} what={t("issue.equipment")} />
              </div>
            )}
          </FieldWrapper>
          <FieldWrapper label={t("issue.recipient")} required>
            <Input
              className="h-12 text-base"
              value={recipient}
              maxLength={150}
              autoComplete="off"
              onChange={(event) => setRecipient(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("issue.materials")} required>
            <div className="space-y-3">
            <QueryFailedNote query={materials} what={t("what.materials")} />
            {project && materials.isSuccess && !materialRows.length ? (
              <p className="text-sm text-muted-foreground">{t("outgoing.noMaterials")}</p>
            ) : null}
            {lines.map((line, index) => (
              <IssueLineEditor
                key={line.key}
                index={index}
                line={line}
                materials={materialRows}
                onChange={(next) => setLines((old) => old.map((row) => (row.key === line.key ? next : row)))}
                onRemove={
                  lines.length > 1
                    ? () => setLines((old) => old.filter((row) => row.key !== line.key))
                    : undefined
                }
              />
            ))}
            <Button
              variant="outline"
              className="h-12 w-full text-base"
              disabled={!project}
              disabledReason={!project ? t("field.chooseProjectFirst") : undefined}
              onClick={() => setLines((old) => [...old, emptyIssueLine()])}
            >
              <Plus />
              {t("issue.addMaterial")}
            </Button>
            </div>
          </FieldWrapper>
          {isFieldStaff ? (
            <FieldWrapper label={t("outgoing.evidence.title")} required>
              <FieldEvidenceGrid
                labels={photoPrompts}
                files={photos}
                progressLabel={t("outgoing.evidence.progress", {
                  current: taken.length,
                  required: FIELD_EVIDENCE_PHOTO_COUNT,
                })}
                onChange={setPhotos}
              />
            </FieldWrapper>
          ) : null}
          <LocationField
            label={t("field.location")}
            readyLabel={t("action.locationReady")}
            value={location}
            onChange={setLocation}
            required={isFieldStaff}
            allowMissing
          />
          <FieldWrapper label={t("issue.note")}>
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-12" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            className="h-12 text-base"
            requires={[
              [project, t("field.project")],
              [machine, t("issue.equipment")],
              [recipient.trim(), t("issue.recipient")],
              [allReady, t("issue.materials")],
              [!isFieldStaff || hasRequiredFieldEvidence(photos), t("outgoing.evidence.title")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("issue.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「领用编号」 said right after submitting (客户 11-11 「Material Issue Note系统
 * 自动生成领用编号」). Offline, the number comes when the application uploads.
 */
export function IssueSubmittedNote({ row, onClose }: { row: MaterialOutgoing; onClose: () => void }) {
  const t = useTranslations("contractorOps");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("issue.docTitle")}</DialogTitle>
          <DialogDescription>{t(issueStatusKey(row.status))}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">{t("issue.issueNo")}</p>
          <p className="mt-1 text-2xl font-bold tabular" data-testid="issue-number">
            {row.reference_no}
          </p>
        </div>
        <DialogFooter>
          <Button className="h-12 w-full text-base" onClick={onClose}>
            <Check />
            {t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* The phone: 正式领用                                                   */
/* ------------------------------------------------------------------ */

/**
 * 「手机端正式领用 → 双方签名 → 拍照归档」: every material's actual quantity
 * (0 when it was not taken), the photographs a return's exit needs, the
 * position or 「没有定位」 (JB142), and 发料负责人 / 领用人 sign.
 */
export function IssueHandoverForm({
  record,
  onClose,
  onSaved,
}: {
  record: MaterialOutgoing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const field = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const unitName = useUnitName();
  const draft = (name: string) => `issue-out:${record.id}:${name}`;
  const lines = record.lines ?? [];
  const [issued, setIssued] = useDraftState<Record<string, string>>(draft("issued"), () =>
    Object.fromEntries(lines.map((line) => [line.id, String(Number(line.quantity) || "")])),
  );
  const [photos, setPhotos] = useDraftState(draft("photos"), createEmptyFieldEvidence);
  const [note, setNote] = useDraftState(draft("note"), "");
  const [issuerSignature, setIssuerSignature] = useDraftState<File | undefined>(draft("issuerSignature"));
  const [recipientSignature, setRecipientSignature] = useDraftState<File | undefined>(draft("recipientSignature"));
  const [clientEventId, setClientEventId] = useDraftState(draft("clientEventId"), "");
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [error, setError] = useState("");
  const taken = photos.filter((file): file is File => Boolean(file));
  const values = lines.map((line) => issued[line.id] ?? "");
  const allFilled = values.every((value) => value !== "" && Number(value) >= 0);
  const someIssued = values.some((value) => Number(value) > 0);
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      const eventId = clientEventId || newClientEventId("material-issue-out");
      if (!clientEventId) setClientEventId(eventId);
      return submitMaterialOutgoingExitOfflineAware(user.id, {
        outgoing: record.id,
        reference_no: record.reference_no,
        photos: taken,
        note: note.trim() || undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
        returned_quantity: "",
        issued: JSON.stringify(
          lines.map((line) => ({ line: line.id, issued_quantity: issued[line.id] ?? "" })),
        ),
        site_signature: issuerSignature as File,
        supplier_signature: recipientSignature as File,
        client_event_id: eventId,
      });
    },
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors).flat().join("; ") || failure.message
          : t("issue.handoverFailed"),
      ),
  });
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border bg-muted/30 p-3 text-base">
        <dt className="text-muted-foreground">{t("issue.issueNo")}</dt>
        <dd className="font-semibold">{record.reference_no}</dd>
        <dt className="text-muted-foreground">{t("issue.equipmentNo")}</dt>
        <dd className="font-semibold">{record.equipment_no || "—"}</dd>
        <dt className="text-muted-foreground">{t("issue.equipmentCompany")}</dt>
        <dd className="font-semibold">{record.equipment_company || t("issue.noCompany")}</dd>
        <dt className="text-muted-foreground">{t("issue.recipientShort")}</dt>
        <dd className="font-semibold">{record.recipient_name || "—"}</dd>
      </dl>
      <FieldWrapper label={t("issue.materials")} hint={t("issue.atLeastOne")} required>
        <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="rounded-xl border p-3" data-testid="issue-handover-line">
            <p className="text-base font-semibold">
              {[line.material_name, line.material_specification].filter(Boolean).join(" · ")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("issue.requestedShort", { quantity: `${line.quantity} ${unitName(line.unit)}` })}
            </p>
            <FieldWrapper
              label={`${t("issue.issued")} (${unitName(line.unit)})`}
              hint={t("issue.notIssuedHint")}
              required
            >
              <Input
                className="h-12 text-base"
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={issued[line.id] ?? ""}
                aria-label={t("issue.issued")}
                onChange={(event) => setIssued((old) => ({ ...old, [line.id]: event.target.value }))}
              />
            </FieldWrapper>
          </div>
        ))}
        </div>
      </FieldWrapper>
      <FieldWrapper label={t("issue.handoverPhotos")} required>
        <FieldEvidenceGrid
          labels={[
            t("outgoing.evidence.overview"),
            t("outgoing.evidence.quantity"),
            t("outgoing.evidence.vehicle"),
            t("outgoing.evidence.loading"),
          ]}
          files={photos}
          progressLabel={t("outgoing.evidence.progress", {
            current: taken.length,
            required: isFieldStaff ? FIELD_EVIDENCE_PHOTO_COUNT : 1,
          })}
          onChange={setPhotos}
        />
      </FieldWrapper>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSignaturePad
          label={t("issue.issuerSignature")}
          clearLabel={field("action.clearSignature")}
          required
          value={issuerSignature}
          onChange={setIssuerSignature}
        />
        <FieldSignaturePad
          label={t("issue.recipientSignature")}
          clearLabel={field("action.clearSignature")}
          required
          value={recipientSignature}
          onChange={setRecipientSignature}
        />
      </div>
      <FieldWrapper label={t("issue.note")} optional={common("optional")}>
        <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </FieldWrapper>
      <LocationField
        label={t("issue.handoverLocation")}
        readyLabel={t("issue.handoverLocationReady")}
        value={location}
        onChange={setLocation}
        allowMissing
      />
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" className="h-12" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          className="h-12 text-base"
          requires={[
            [isFieldStaff ? hasRequiredFieldEvidence(photos) : taken.length > 0, t("issue.handoverPhotos")],
            [allFilled && someIssued, t("issue.materials")],
            [issuerSignature, t("issue.issuerSignature")],
            [recipientSignature, t("issue.recipientSignature")],
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("issue.sendHandover")}
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The detail: every material                                           */
/* ------------------------------------------------------------------ */

/** The receipts list narrowed to one material and specification on the project. */
export function receiptsHref(row: Pick<MaterialOutgoing, "project">, line: { category: string | null; spec_category: string | null; material_name: string }) {
  const params = new URLSearchParams({ project: row.project });
  if (line.category) params.set("category", line.category);
  if (line.spec_category) params.set("spec_category", line.spec_category);
  if (!line.category) params.set("search", line.material_name);
  return `/receipts?${params.toString()}`;
}

/**
 * 「点击「查看」，显示完整领用资料」: each material with what was applied for
 * and what was actually taken; for the office its unit price, 领用金额 (or
 * 「没有单价」) and 累计进场 / 累计领用 / 结余 on the project, with the
 * deliveries one press away (「材料进场：对应同项目、同材料名称及规格的进场记录」).
 */
export function IssueLinesPanel({ row }: { row: MaterialOutgoing }) {
  const t = useTranslations("contractorOps");
  const unitName = useUnitName();
  const lines = row.lines ?? [];
  return (
    <section className="rounded-lg border bg-card p-3" data-testid="issue-lines">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("issue.materials")}
      </h3>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.id} className="rounded-md border p-2 text-sm">
            <p className="font-semibold">
              {[line.material_name, line.material_specification].filter(Boolean).join(" · ")}
            </p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-muted-foreground">{t("issue.requested")}</dt>
              <dd className="tabular">{line.quantity} {unitName(line.unit)}</dd>
              <dt className="text-muted-foreground">{t("issue.issued")}</dt>
              <dd className="tabular font-medium">
                {line.issued_quantity === null ? "—" : `${line.issued_quantity} ${unitName(line.unit)}`}
              </dd>
              {line.priced !== null && (
                <>
                  <dt className="text-muted-foreground">{t("issue.unitPrice")}</dt>
                  <dd className="tabular">
                    {line.unit_price ?? <span className="text-warning">{t("issue.unpriced")}</span>}
                  </dd>
                  <dt className="text-muted-foreground">{t("issue.amount")}</dt>
                  <dd className="tabular">
                    {line.issue_amount ?? (line.priced === false ? <span className="text-warning">{t("issue.unpriced")}</span> : "—")}
                  </dd>
                </>
              )}
            </dl>
            {line.stock && (
              <div className="mt-2 rounded bg-muted/40 p-2 text-xs">
                <p className="mb-1 font-medium text-muted-foreground">{t("issue.stockTitle")}</p>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-muted-foreground">{t("issue.stockReceived")}</dt>
                    <dd className="tabular font-semibold">{line.stock.received}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("issue.stockIssued")}</dt>
                    <dd className="tabular font-semibold">{line.stock.issued}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("issue.stockBalance")}</dt>
                    <dd className="tabular font-semibold">{line.stock.balance}</dd>
                  </div>
                </dl>
                <Link
                  href={receiptsHref(row, line)}
                  className="mt-1 inline-block text-primary underline-offset-2 hover:underline"
                >
                  {t("issue.openReceipts")}
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The facts an issue's detail shows in place of a return's supplier, DO and lorry. */
export function useIssueFacts() {
  const t = useTranslations("contractorOps");
  const df = useDateFormat();
  return (row: MaterialOutgoing) => [
    { label: t("issue.issueNo"), value: row.reference_no },
    { label: t("issue.equipmentNo"), value: row.equipment_no || "—" },
    { label: t("issue.equipmentCompany"), value: row.equipment_company || t("issue.noCompany") },
    { label: t("issue.recipientShort"), value: row.recipient_name || "—" },
    { label: t("issue.issuer"), value: row.issuer_name || "—" },
    { label: t("outgoing.capturedAt"), value: df.dateTime(row.captured_at) },
    ...(row.processed_at
      ? [
          {
            label: t("issue.gps"),
            value: row.handover_without_gps
              ? t("issue.noGps")
              : `${row.processed_latitude}, ${row.processed_longitude}`,
          },
        ]
      : []),
  ];
}

/* ------------------------------------------------------------------ */
/* The office: 供应商退货 | 材料领用                                      */
/* ------------------------------------------------------------------ */

/** 「通过「材料领用」按钮查看对应记录」: the switch at the top of 材料出场. */
export function OutgoingKindSwitch({
  value,
  onChange,
}: {
  value: "RETURN" | "ISSUE";
  onChange: (next: "RETURN" | "ISSUE") => void;
}) {
  const t = useTranslations("contractorOps");
  return (
    <div role="tablist" className="inline-flex rounded-lg border bg-muted/40 p-1" data-testid="outgoing-kind-switch">
      {(["RETURN", "ISSUE"] as const).map((kind) => (
        <Button
          key={kind}
          role="tab"
          aria-selected={value === kind}
          variant={value === kind ? "default" : "ghost"}
          className="h-10 px-5 text-base"
          onClick={() => onChange(kind)}
        >
          {kind === "RETURN" ? <Undo2 /> : <Wrench />}
          {kind === "RETURN" ? t("issue.tabReturns") : t("issue.tabIssues")}
        </Button>
      ))}
    </div>
  );
}

const ISSUE_FILTERS = ["project", "date_from", "date_to", "material", "company", "equipment_no", "recipient"];

function OptionFilter({
  list,
  param,
  allLabel,
  options,
}: {
  list: ReturnType<typeof useListQuery>;
  param: string;
  allLabel: string;
  options: string[];
}) {
  return (
    <Select
      value={list.filters[param] ?? "__all"}
      onValueChange={(value) => list.setFilter(param, value === "__all" ? undefined : value)}
    >
      <SelectTrigger className="w-full sm:w-40" aria-label={allLabel}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Signed({ url }: { url: string | null }) {
  const t = useTranslations("contractorOps");
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signature image as stored */}
      <img src={url} alt={t("issue.signed")} className="h-8 w-16 rounded border bg-background object-contain" />
    </a>
  ) : (
    <span className="text-xs text-muted-foreground">{t("issue.unsigned")}</span>
  );
}

/**
 * 「材料领用」 in the office's 材料出场 (JB168 G). Filters, in the client's
 * order: 项目｜日期｜材料名称｜所属公司｜设备编号｜领用人. Columns: 领用编号 (客户
 * 11-11 追加), then his: 日期时间｜材料名称｜规格｜领用数量｜单位｜所属公司｜设备
 * 编号｜领用人｜发料负责人｜双方签名｜照片｜查看. One row per material, newest
 * first; the row opens the record.
 */
export function MaterialIssueList({ onOpen }: { onOpen: (recordId: string) => void }) {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const unitName = useUnitName();
  const list = useListQuery(ISSUE_FILTERS);
  const project = list.filters.project;
  const rows = useQuery({
    queryKey: ["material-outgoing", "issues", list.query],
    queryFn: () => getMaterialIssueLines({ ...list.query, page_size: list.pageSize }),
  });
  // query-failure: the filters fall back to typing nothing - the list itself says when it failed.
  const options = useQuery({
    queryKey: ["material-outgoing", "issue-options", project ?? ""],
    queryFn: () => getMaterialIssueOptions(project || undefined),
  });
  const results: MaterialIssueListRow[] = rows.data?.results ?? [];
  const total = rows.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / list.pageSize));
  return (
    <section className="space-y-3" data-testid="material-issue-list">
      <div className="flex flex-wrap items-end gap-2">
        <ProjectListFilter list={list} />
        <Input
          type="date"
          className="w-full sm:w-40"
          aria-label={tRoot("supplierDateFilter.from")}
          title={tRoot("supplierDateFilter.from")}
          value={list.filters.date_from ?? ""}
          onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
        />
        <Input
          type="date"
          className="w-full sm:w-40"
          aria-label={tRoot("supplierDateFilter.toLabel")}
          title={tRoot("supplierDateFilter.toLabel")}
          value={list.filters.date_to ?? ""}
          onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
        />
        <OptionFilter list={list} param="material" allLabel={t("issue.allMaterials")} options={options.data?.materials ?? []} />
        <OptionFilter list={list} param="company" allLabel={t("issue.allCompanies")} options={options.data?.companies ?? []} />
        <OptionFilter list={list} param="equipment_no" allLabel={t("issue.allEquipment")} options={options.data?.equipment_nos ?? []} />
        <OptionFilter list={list} param="recipient" allLabel={t("issue.allRecipients")} options={options.data?.recipients ?? []} />
      </div>
      <QueryFailedNote query={rows} what={t("issue.tabIssues")} />
      {rows.isLoading ? (
        <div className="grid min-h-32 place-items-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : !results.length ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("issue.empty")}</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("issue.issueNo")}</TableHead>
                <TableHead>{t("issue.colAt")}</TableHead>
                <TableHead>{t("issue.material")}</TableHead>
                <TableHead>{t("issue.spec")}</TableHead>
                <TableHead className="text-right">{t("issue.quantity")}</TableHead>
                <TableHead>{t("issue.unit")}</TableHead>
                <TableHead>{t("issue.equipmentCompany")}</TableHead>
                <TableHead>{t("issue.equipmentNo")}</TableHead>
                <TableHead>{t("issue.recipientShort")}</TableHead>
                <TableHead>{t("issue.issuer")}</TableHead>
                <TableHead>{t("issue.colSignatures")}</TableHead>
                <TableHead>{t("issue.colPhotos")}</TableHead>
                <TableHead>{t("issue.colView")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(row.record)}
                  data-testid="material-issue-row"
                >
                  <TableCell className="font-medium tabular">
                    <div>{row.reference_no}</div>
                    <StatusBadge label={t(issueStatusKey(row.status))} tone={row.status === "REJECTED" ? "danger" : row.status === "COMPLETED" ? "positive" : "info"} />
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">{df.dateTime(row.at)}</TableCell>
                  <TableCell className="font-medium">{row.material_name}</TableCell>
                  <TableCell>{row.material_specification || "—"}</TableCell>
                  <TableCell className="text-right tabular">
                    {row.issued_quantity ?? (
                      <span className="text-muted-foreground">{t("issue.requestedShort", { quantity: row.quantity })}</span>
                    )}
                  </TableCell>
                  <TableCell>{unitName(row.unit)}</TableCell>
                  <TableCell>{row.equipment_company || "—"}</TableCell>
                  <TableCell className="tabular">{row.equipment_no || "—"}</TableCell>
                  <TableCell>{row.recipient_name || "—"}</TableCell>
                  <TableCell>{row.issuer_name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Signed url={row.issuer_signature} />
                      <Signed url={row.recipient_signature} />
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.cover_photo_url ? (
                      <span className="flex items-center gap-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- the record's own watermarked thumbnail */}
                        <img src={row.cover_photo_url} alt={t("issue.colPhotos")} className="size-10 rounded object-cover" />
                        <span className="text-xs text-muted-foreground tabular">{row.photo_count}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground tabular">{row.photo_count}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(row.record);
                      }}
                    >
                      <Eye />
                      {t("issue.view")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          {list.page > 1 && (
            <Button size="sm" variant="outline" onClick={() => list.setPage(list.page - 1)}>
              {tRoot("table.previous")}
            </Button>
          )}
          <span className="tabular text-muted-foreground">{`${list.page} / ${pages}`}</span>
          {list.page < pages && (
            <Button size="sm" variant="outline" onClick={() => list.setPage(list.page + 1)}>
              {tRoot("table.next")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
