"use client";

/**
 * 检验结果 (J11, J12-6..J12-12, Q11, Q12-4..Q12-7).
 *
 * The result of an inspection report, filed with it in the document archive
 * by whoever may 填写检验结果 (project and safety managers). Asked to confirm
 * first - 「提交后不能修改，确定吗？」 - then read-only; a re-inspection is a new
 * one. Machines and materials show the latest: 「合格」 or 「不合格」 and the
 * date, nothing for none, never in red and never stopping a clock-in.
 *
 * One report can cover several machines, or several materials: they are all
 * chosen here and each gets its own result with the same report details
 * (Lucas 2026-10-24: 「做成多选」; Q12-5 「不需要重复填写」).
 *
 * Machines (JB54, client 10-28): the list is the 设备清单's machines on site
 * now (``presence=on``), and every machine ticked gets its own 合格 / 不合格,
 * chosen beside it; one submit files one result per machine. Materials keep
 * the one result for everything chosen.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { InspectionInfo, InspectionPayload } from "@/interfaces/document-workflow";
import { useDateFormat } from "@/lib/dates";
import { getProjectCategories, getSiteEquipment } from "@/services/contractor-ops.service";
import { addInspection } from "@/services/document-workflow.service";

type Verdict = "PASS" | "FAIL";

/** The machines ticked, in the order ticked, each with its own result (JB54). */
export type ChosenMachines = { equipment: string; result: Verdict | "" }[];

/** What 「提交」 sends for the machines, or null while one still has no result. */
export function machineInspectionItems(chosen: ChosenMachines): { equipment: string; result: Verdict }[] | null {
  if (chosen.length === 0 || chosen.some((row) => !row.result)) return null;
  return chosen.map((row) => ({ equipment: row.equipment, result: row.result as Verdict }));
}

/** 「合格 · 2026-10-05」 / 「不合格 · …」, with the expiry when near; nothing for none. */
export function InspectionBadge({ inspection }: { inspection: InspectionInfo | null | undefined }) {
  const t = useTranslations("documents.inspection");
  const df = useDateFormat();
  if (!inspection) return null;
  return (
    <span className="inline-flex flex-col gap-0.5" data-testid="inspection-badge">
      <span className="inline-flex items-center gap-1.5">
        {/* Never red (Q11-4): 「不合格」 in plain words. */}
        <StatusBadge
          label={t(`result.${inspection.result}`)}
          tone={inspection.result === "PASS" ? "positive" : "neutral"}
        />
        <span className="text-xs text-muted-foreground tabular-nums">{df.date(inspection.inspected_on)}</span>
      </span>
      {inspection.expiry && inspection.valid_until ? (
        <span className="text-xs text-muted-foreground">
          {inspection.expiry === "EXPIRED"
            ? t("expired", { date: df.date(inspection.valid_until) })
            : t("expiring", { date: df.date(inspection.valid_until) })}
        </span>
      ) : null}
    </span>
  );
}

/** Every result filed with a document, newest first (J12-11). */
export function InspectionList({ rows }: { rows: InspectionInfo[] }) {
  const t = useTranslations("documents.inspection");
  const df = useDateFormat();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <ul className="divide-y rounded-md border" data-testid="inspection-list">
      {rows.map((row) => (
        <li key={row.id} className="space-y-1 px-3 py-2 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <InspectionBadge inspection={row} />
            <span>{row.inspection_no}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              row.target === "EQUIPMENT"
                ? row.equipment_name
                : [row.material_name, row.spec_name].filter(Boolean).join(" · "),
              row.inspector,
              row.valid_until ? t("validUntil", { date: df.date(row.valid_until) }) : "",
              t("filedBy", { name: row.created_by_name, at: df.dateTime(row.created_at) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function InspectionDialog({
  documentId,
  project,
  onClose,
}: {
  documentId: string;
  project: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("documents.inspection");
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<"EQUIPMENT" | "MATERIAL">("EQUIPMENT");
  const [machinesChosen, setMachinesChosen] = useState<ChosenMachines>([]);
  // The material and specification being picked; 「加入」 adds the pair.
  const [material, setMaterial] = useState("");
  const [spec, setSpec] = useState("");
  const [materialsChosen, setMaterialsChosen] = useState<{ material: string; spec: string }[]>([]);
  const [number, setNumber] = useState("");
  const [inspectedOn, setInspectedOn] = useState("");
  const [inspector, setInspector] = useState("");
  const [result, setResult] = useState<Verdict | "">("");
  const [reportDate, setReportDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const machines = useQuery({
    queryKey: ["site-equipment", "inspection", project ?? ""],
    // Only machines on site now, by the 设备清单's own 在场 rule (JB54).
    queryFn: () => getSiteEquipment({ ...(project ? { project } : {}), presence: "on", page_size: 200 }),
    enabled: target === "EQUIPMENT",
  });
  const materials = useQuery({
    queryKey: ["project-categories", "inspection", project ?? "", "MATERIAL"],
    queryFn: () =>
      getProjectCategories({ ...(project ? { project } : {}), kind: "MATERIAL", is_active: true, page_size: 200 }),
    enabled: target === "MATERIAL",
  });
  const materialRows = (materials.data?.results ?? []).filter((row) => !row.parent);
  const specRows = (materialRows.find((row) => row.id === material)?.specs ?? []).filter((row) => !row.is_other);
  const materialLabel = (item: { material: string; spec: string }) => {
    const row = materialRows.find((candidate) => candidate.id === item.material);
    const specName = row?.specs?.find((candidate) => candidate.id === item.spec)?.name;
    return [row?.name ?? "", specName ?? t("allSpecs")].join(" · ");
  };
  const addMaterial = () => {
    const item = { material, spec };
    setMaterialsChosen((current) =>
      current.some((row) => row.material === item.material && row.spec === item.spec) ? current : [...current, item],
    );
    setMaterial("");
    setSpec("");
  };
  const chosenCount = target === "EQUIPMENT" ? machinesChosen.length : materialsChosen.length;
  const machineItems = machineInspectionItems(machinesChosen);
  const setMachineResult = (equipment: string, verdict: Verdict) =>
    setMachinesChosen((current) => current.map((row) => (row.equipment === equipment ? { ...row, result: verdict } : row)));
  const save = useMutation({
    mutationFn: () => {
      const payload: InspectionPayload = {
        target,
        items:
          target === "EQUIPMENT"
            ? (machineItems ?? [])
            : materialsChosen.map((item) => ({ material: item.material, ...(item.spec ? { spec: item.spec } : {}) })),
        inspection_no: number.trim(),
        inspected_on: inspectedOn,
        inspector: inspector.trim(),
        ...(target === "MATERIAL" ? { result: result as Verdict } : {}),
        ...(reportDate ? { report_date: reportDate } : {}),
        ...(validUntil ? { valid_until: validUntil } : {}),
      };
      return addInspection(documentId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["site-equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
      onClose();
    },
    onError: (reason) => {
      setConfirming(false);
      setError(reason instanceof ApiError ? reason.message : t("failed"));
    },
  });
  const requires: [unknown, string][] = [
    [chosenCount > 0, target === "EQUIPMENT" ? t("equipment") : t("material")],
    [number.trim(), t("number")],
    [inspectedOn, t("inspectedOn")],
    [inspector.trim(), t("inspector")],
    [target === "EQUIPMENT" ? machineItems : result, t("result.label")],
  ];
  const machineRows = machines.data?.results ?? [];
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("target")} required className="sm:col-span-2">
            <Select value={target} onValueChange={(value) => setTarget(value as "EQUIPMENT" | "MATERIAL")}>
              <SelectTrigger className="w-full bg-card" aria-label={t("target")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EQUIPMENT">{t("equipment")}</SelectItem>
                <SelectItem value="MATERIAL">{t("material")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
          {target === "EQUIPMENT" ? (
            <FieldWrapper
              label={t("equipment")}
              required
              hint={t("machinesHint", { count: machinesChosen.length })}
              className="sm:col-span-2"
            >
              <div
                role="group"
                aria-label={t("equipment")}
                className="max-h-72 overflow-y-auto rounded-md border bg-card"
              >
                {machines.isSuccess && machineRows.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t("noMachinesOnSite")}</p>
                )}
                {machineRows.map((row) => {
                  const chosen = machinesChosen.find((item) => item.equipment === row.id);
                  const name = [row.site_no, row.name, row.registration_no].filter(Boolean).join(" · ");
                  return (
                    <div
                      key={row.id}
                      className="flex min-h-11 flex-wrap items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={Boolean(chosen)}
                          onCheckedChange={(checked) =>
                            setMachinesChosen((current) =>
                              checked === true
                                ? [...current, { equipment: row.id, result: "" }]
                                : current.filter((item) => item.equipment !== row.id),
                            )
                          }
                        />
                        <span className="min-w-0 break-words">{name}</span>
                      </label>
                      {chosen && (
                        // Each machine its own 合格 / 不合格 (JB54), never red (Q11-4).
                        <div role="radiogroup" aria-label={`${name} ${t("result.label")}`} className="flex gap-1.5">
                          {(["PASS", "FAIL"] as const).map((verdict) => (
                            <Button
                              key={verdict}
                              type="button"
                              size="sm"
                              role="radio"
                              aria-checked={chosen.result === verdict}
                              variant={chosen.result === verdict ? "default" : "outline"}
                              onClick={() => setMachineResult(row.id, verdict)}
                            >
                              {t(`result.${verdict}`)}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <QueryFailedNote query={machines} what={t("equipment")} />
            </FieldWrapper>
          ) : (
            <>
              <FieldWrapper label={t("material")} required>
                <Select
                  value={material}
                  onValueChange={(value) => {
                    setMaterial(value);
                    setSpec("");
                  }}
                >
                  <SelectTrigger className="w-full bg-card" aria-label={t("material")}>
                    <SelectValue placeholder={t("choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {materialRows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <QueryFailedNote query={materials} what={t("material")} />
              </FieldWrapper>
              <FieldWrapper label={t("spec")}>
                <Select value={spec || "__none__"} onValueChange={(value) => setSpec(value === "__none__" ? "" : value)}>
                  <SelectTrigger className="w-full bg-card" aria-label={t("spec")} disabled={!material}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("allSpecs")}</SelectItem>
                    {specRows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <div className="space-y-2 sm:col-span-2">
                <Button variant="outline" requires={[[material, t("material")]]} onClick={addMaterial}>
                  <Plus />
                  {t("addItem")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("severalHint", { count: materialsChosen.length })}</p>
                {materialsChosen.length > 0 && (
                  <ul className="divide-y rounded-md border bg-card" data-testid="inspection-materials">
                    {materialsChosen.map((item) => (
                      <li key={`${item.material}:${item.spec}`} className="flex items-center gap-2 px-3 py-1 text-sm">
                        <span className="flex-1">{materialLabel(item)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("removeItem")}
                          onClick={() =>
                            setMaterialsChosen((current) =>
                              current.filter((row) => row.material !== item.material || row.spec !== item.spec),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          <FieldWrapper label={t("number")} required hint={t("numberHint")}>
            <Input value={number} maxLength={100} onChange={(event) => setNumber(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("inspectedOn")} required>
            <Input type="date" value={inspectedOn} onChange={(event) => setInspectedOn(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("inspector")} required>
            <Input value={inspector} maxLength={200} onChange={(event) => setInspector(event.target.value)} />
          </FieldWrapper>
          {target === "MATERIAL" && (
            <FieldWrapper label={t("result.label")} required>
              <Select value={result} onValueChange={(value) => setResult(value as Verdict)}>
                <SelectTrigger className="w-full bg-card" aria-label={t("result.label")}>
                  <SelectValue placeholder={t("choose")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PASS">{t("result.PASS")}</SelectItem>
                  <SelectItem value="FAIL">{t("result.FAIL")}</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          <FieldWrapper label={t("reportDate")}>
            <Input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("validUntilLabel")} hint={t("validUntilHint")}>
            <Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
          </FieldWrapper>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {confirming ? (
          // 「提交后不能修改，确定吗？」 (Q12-6): said in the dialog, never a browser box.
          <div role="alert" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">{t("confirm")}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={save.isPending} onClick={() => setConfirming(false)}>
                {t("back")}
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {t("submitNow")}
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button requires={requires} onClick={() => setConfirming(true)}>
              <ClipboardCheck />
              {t("submit")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
