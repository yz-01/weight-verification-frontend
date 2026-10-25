"use client";

/**
 * 材料管理 → 材料目标 (I18, ID39-ID42).
 *
 * 「项目经理 / QS 可在后台按材料、规格、单位设置目标数量。系统自动显示：目标数量、
 * 累计净进场数量、剩余数量及超出数量。」 One row per target: the material and
 * specification from the project's material data (I19), the unit that comes
 * with the specification, the target, what came in net (deliveries not
 * rejected, less the returns the office confirmed), what is left, what is
 * over, a bar and the state. Each row opens its deliveries and its returns,
 * already filtered (ID42). Loads in another unit are not converted - the row
 * says 「单位不同，未计入」.
 *
 * Whoever holds `material_target.manage` (project manager, QS) adds, changes
 * and removes; everybody who reads deliveries reads the targets. The alerts at
 * 接近 / 达到 / 超出 are the server's (ID41).
 *
 * JB26 (客户 10-26 事项 2): a target is raised, never overwritten - 「修改目标
 * 数量」 adds to it (+200 Ton), with the user's own PIN, and is open to anyone
 * who sees the targets (「只要拥有有效的个人六位数密码，就有修改权限」). A raised
 * target shows each of its lines under its row, the additions each in their
 * own colour, filled in order: 「旧目标剩余数量先累计完成，再自动接续新目标」.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Loader2, Pencil, Plus, Save, Target, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import { AppendTargetDialog } from "@/components/receipts/material-target-append";
import { MaterialTabs } from "@/components/receipts/material-tabs";
import { ProjectListFilter } from "@/components/shared/module-records-table";
import {
  EmptyState,
  FieldWrapper,
  ListHeader,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type { MaterialTarget } from "@/interfaces/material-target";
import { offeredSpecs } from "@/lib/material-catalogue";
import {
  isValidTargetQuantity,
  parseTargetAlerts,
  targetBar,
  targetRecordLinks,
  targetTone,
  trancheLines,
} from "@/lib/material-targets";
import { getProjectCategories } from "@/services/contractor-ops.service";
import {
  createMaterialTarget,
  deleteMaterialTarget,
  getMaterialTargets,
  updateMaterialTarget,
} from "@/services/material-target.service";

export function MaterialTargets() {
  const t = useTranslations("materialTargets");
  const router = useRouter();
  const unitName = useUnitName();
  const qc = useQueryClient();
  const list = useListQuery(["project", "target"]);
  const project = list.filters.project ?? "";
  const focused = list.filters.target ?? "";
  const targets = useQuery({
    queryKey: ["material-targets", project],
    queryFn: () => getMaterialTargets({ project }),
  });
  const rows = targets.data?.results ?? [];
  const canManage = Boolean(targets.data?.can_manage);
  const [editing, setEditing] = useState<MaterialTarget | "new" | null>(null);
  const [appending, setAppending] = useState<MaterialTarget | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const removal = useMutation({
    mutationFn: (id: string) => deleteMaterialTarget(id),
    onSuccess: () => {
      setArmed(null);
      setError("");
      void qc.invalidateQueries({ queryKey: ["material-targets"] });
    },
    onError: (reason) => {
      setArmed(null);
      setError(reason instanceof ApiError ? reason.message : t("failed"));
    },
  });

  const addButton = canManage && (
    <Button
      // A target is one project's: chosen in the project filter beside the views.
      disabledReason={project ? undefined : t("chooseProjectFirst")}
      disabled={!project}
      onClick={() => setEditing("new")}
    >
      <Plus />
      {t("add")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={targets.isLoading ? "—" : t("count", { count: rows.length })}
        action={addButton || undefined}
      />
      <MaterialTabs>
        <ProjectListFilter list={list} />
      </MaterialTabs>
      <p className="text-xs text-muted-foreground">{t("basis")}</p>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {targets.isError ? (
        <LoadFailed what={t("title")} onRetry={() => void targets.refetch()} />
      ) : targets.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={project ? t("empty") : t("emptyAll")} action={addButton || undefined} />
      ) : (
        <div className="rounded-lg border">
          {/* Fits the page (I39): no sideways scroll at 1366 px. */}
          <Table fit>
            <TableHeader>
              <TableRow>
                {!project && <TableHead>{t("field.project")}</TableHead>}
                <TableHead>{t("field.material")}</TableHead>
                <TableHead>{t("field.spec")}</TableHead>
                <TableHead>{t("field.unit")}</TableHead>
                <TableHead className="text-right">{t("field.target")}</TableHead>
                <TableHead className="text-right">{t("field.net")}</TableHead>
                <TableHead className="text-right">{t("field.remaining")}</TableHead>
                <TableHead className="text-right">{t("field.exceeded")}</TableHead>
                <TableHead>{t("field.progress")}</TableHead>
                <TableHead>{t("field.status")}</TableHead>
                <TableHead>{t("field.records")}</TableHead>
                <TableHead pin="end">{t("field.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const bar = targetBar(row);
                const links = targetRecordLinks(row);
                return (
                  <Fragment key={row.id}>
                    <TableRow className={row.id === focused ? "bg-primary/8" : undefined}>
                      {!project && (
                        <TableCell className="text-muted-foreground">{row.project_code}</TableCell>
                      )}
                      <TableCell className="font-medium">{row.category_name}</TableCell>
                      <TableCell>{row.spec_name ?? <span className="text-muted-foreground">{t("wholeMaterial")}</span>}</TableCell>
                      <TableCell>{unitName(row.unit, row.unit_label)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.target_quantity}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {row.net}
                        {/* The net's makings, said rather than hidden: 「60 进 · 3 退」. */}
                        <span className="block text-2xs font-normal text-muted-foreground">
                          {t("netMakings", { received: row.received, returned: row.returned, rejected: row.rejected })}
                        </span>
                        {row.other_units.length > 0 && (
                          <span className="block text-2xs font-normal text-warning">
                            {t("otherUnits", {
                              units: row.other_units.map((item) => unitName(item.unit, item.unit_label)).join("、"),
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.remaining}</TableCell>
                      <TableCell className={`text-right tabular-nums ${Number(row.exceeded) > 0 ? "font-semibold text-destructive" : ""}`}>
                        {row.exceeded}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-20 space-y-1">
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full ${bar.tone}`} style={{ width: `${bar.width}%` }} />
                          </div>
                          <p className="text-2xs tabular-nums text-muted-foreground">
                            {row.percent === null ? "—" : `${row.percent}%`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={t(`status.${row.status}`)} tone={targetTone(row.status)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" className="h-7" onClick={() => router.push(links.deliveries)}>
                            {t("deliveries")}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7" onClick={() => router.push(links.returns)}>
                            {t("returns")}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell pin="end">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="h-7" onClick={() => setAppending(row)}>
                            <ListPlus />
                            {t("changeTarget")}
                          </Button>
                          {canManage && (
                            <>
                              <Button size="icon-sm" variant="ghost" title={t("edit")} onClick={() => setEditing(row)}>
                                <Pencil />
                              </Button>
                              {/* Removing is armed by the switch, then the bin acts (rule 8). */}
                              <Switch
                                checked={armed === row.id}
                                onCheckedChange={(next) => setArmed(next ? row.id : null)}
                                aria-label={t("armRemove")}
                              />
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive"
                                title={t("remove")}
                                disabledReason={armed !== row.id ? t("armFirst") : undefined}
                                disabled={armed !== row.id || removal.isPending}
                                onClick={() => removal.mutate(row.id)}
                              >
                                {removal.isPending && armed === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {trancheLines(row).map((line) => (
                      <TableRow key={`${row.id}-${line.index}`} className={line.row} data-tranche={line.index}>
                        {!project && <TableCell />}
                        <TableCell colSpan={3} className={`pl-6 text-xs font-medium ${line.text}`}>
                          {line.index === 0
                            ? t("tranche.original")
                            : t("tranche.added", { index: line.index, quantity: line.tranche.quantity })}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {t("tranche.cumulative", { total: line.tranche.cumulative_target })}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right text-xs tabular-nums ${line.text}`}>{line.tranche.quantity}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{line.tranche.filled}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{line.tranche.remaining}</TableCell>
                        <TableCell />
                        <TableCell>
                          <div className="min-w-20 space-y-1">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full ${line.bar}`} style={{ width: `${line.width}%` }} />
                            </div>
                            <p className="text-2xs tabular-nums text-muted-foreground">
                              {line.tranche.percent === null ? "—" : `${line.tranche.percent}%`}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell colSpan={3} />
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {appending && (
        <AppendTargetDialog
          row={appending}
          onClose={() => setAppending(null)}
          onSaved={() => {
            setAppending(null);
            void qc.invalidateQueries({ queryKey: ["material-targets"] });
            void qc.invalidateQueries({ queryKey: ["material-target-history"] });
          }}
        />
      )}
      {editing && (
        <TargetDialog
          project={project}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ["material-targets"] });
          }}
        />
      )}
    </div>
  );
}

/**
 * Add one, or change the lines and the note of one. The figure of one already
 * set is only raised, with 「修改目标数量」 (JB26).
 */
function TargetDialog({
  project,
  row,
  onClose,
  onSaved,
}: {
  project: string;
  row: MaterialTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("materialTargets");
  const unitName = useUnitName();
  const [category, setCategory] = useState(row?.category ?? "");
  const [spec, setSpec] = useState(row?.spec_category ?? "");
  const [chosenUnit, setChosenUnit] = useState(row?.unit ?? "");
  const [quantity, setQuantity] = useState(row?.target_quantity ?? "");
  const [alerts, setAlerts] = useState((row?.alert_percentages ?? [80, 100]).join(", "));
  const [note, setNote] = useState(row?.note ?? "");
  const [error, setError] = useState("");
  const materials = useQuery({
    queryKey: ["project-categories", "material-targets", project],
    queryFn: () =>
      getProjectCategories({ project, kind: "MATERIAL", is_active: true, page_size: 200, sort_by: "sort_order", sort_order: "asc" }),
    enabled: Boolean(project) && !row,
  });
  const units = useMaterialUnits({ enabled: !row });
  const material = (materials.data?.results ?? []).find((item) => item.id === category);
  // 「其他」 is typed on each record, so it is not a specification a target counts.
  const specs = offeredSpecs(material, spec).filter((item) => !item.is_other);
  const chosenSpec = specs.find((item) => item.id === spec) ?? null;
  const unit = chosenSpec ? chosenSpec.default_unit : chosenUnit || material?.default_unit || "";
  const parsedAlerts = parseTargetAlerts(alerts);
  const quantityOk = isValidTargetQuantity(quantity);

  const save = useMutation({
    mutationFn: () =>
      row
        ? updateMaterialTarget(row.id, { alert_percentages: parsedAlerts ?? [], note })
        : createMaterialTarget({
            project,
            category,
            spec_category: spec || undefined,
            unit,
            target_quantity: quantity,
            alert_percentages: parsedAlerts ?? [],
            note,
          }),
    onSuccess: onSaved,
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5" />
            {row ? t("editTitle") : t("addTitle")}
          </DialogTitle>
          <DialogDescription>{t("dialogHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.material")} required className="sm:col-span-2">
            {row ? (
              <Input value={row.category_name} disabled readOnly />
            ) : (
              <>
                  <Select
                    value={category || undefined}
                    onValueChange={(next) => {
                      setCategory(next);
                      setSpec("");
                      setChosenUnit("");
                    }}
                    disabled={materials.isLoading}
                  >
                    <SelectTrigger className="w-full" aria-label={t("field.material")}>
                      <SelectValue placeholder={t("chooseMaterial")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(materials.data?.results ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <QueryFailedNote query={materials} what={t("field.material")} />
              </>
            )}
          </FieldWrapper>
          <FieldWrapper label={t("field.spec")} hint={t("specHint")}>
            {row ? (
              <Input value={row.spec_name ?? t("wholeMaterial")} disabled readOnly />
            ) : (
              <Select value={spec || "__whole__"} onValueChange={(next) => setSpec(next === "__whole__" ? "" : next)} disabled={!category}>
                <SelectTrigger className="w-full" aria-label={t("field.spec")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__whole__">{t("wholeMaterial")}</SelectItem>
                  {specs.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldWrapper>
          <FieldWrapper label={t("field.unit")} required hint={chosenSpec ? t("unitFromSpec") : undefined}>
            {row || chosenSpec ? (
              // The unit comes with the specification (I19, ID46).
              <Input value={unitName(row?.unit ?? unit, row?.unit_label ?? chosenSpec?.default_unit_label)} disabled readOnly />
            ) : (
              <Select value={unit || undefined} onValueChange={setChosenUnit} disabled={!category}>
                <SelectTrigger className="w-full" aria-label={t("field.unit")}>
                  <SelectValue placeholder={t("chooseUnit")} />
                </SelectTrigger>
                <SelectContent>
                  {(units.data ?? []).map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {unitName(item.code, item.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <QueryFailedNote query={units} what={t("field.unit")} />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.target")}
            required
            error={quantity && !quantityOk ? t("quantityRule") : undefined}
            hint={row ? t("targetOnlyAdded") : t("quantityRule")}
          >
            <Input
              disabled={Boolean(row)}
              readOnly={Boolean(row)}
              type="number"
              inputMode="decimal"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.alerts")}
            hint={t("alertsHint")}
            error={parsedAlerts === null ? t("alertsInvalid") : undefined}
          >
            <Input value={alerts} onChange={(event) => setAlerts(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.note")} className="sm:col-span-2">
            <Textarea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("recipients")}</p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[
              [row || category, t("field.material")],
              [row || unit, t("field.unit")],
              [quantityOk, t("field.target")],
            ]}
            disabledReason={parsedAlerts === null ? t("alertsInvalid") : undefined}
            disabled={parsedAlerts === null || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
