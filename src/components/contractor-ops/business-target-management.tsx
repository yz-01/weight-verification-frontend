"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  BusinessTarget,
  BusinessTargetPayload,
  TargetMetric,
  TargetPeriod,
} from "@/interfaces/business-target";
import { getProjects } from "@/services/contractor.service";
import { getProjectCategories } from "@/services/contractor-ops.service";
import {
  createBusinessTarget,
  deleteBusinessTarget,
  getBusinessTargets,
  refreshBusinessTarget,
  updateBusinessTarget,
} from "@/services/business-target.service";
import { getUsers } from "@/services/users.service";

const TARGET_METRICS: TargetMetric[] = [
  "FIELD_TASK_COUNT",
  "MATERIAL_RECEIPT_COUNT",
  "MATERIAL_RECEIPT_QUANTITY",
  "SETTLED_RECYCLING_WEIGHT",
];
const MATERIAL_UNITS = ["TONNE", "KG", "M3", "PIECE", "LOAD", "BAG"];
const WASTE_TYPES = [
  "MIXED",
  "CONCRETE",
  "METAL",
  "TIMBER",
  "PLASTIC",
  "PAPER",
  "SOIL",
  "HAZARDOUS",
  "OTHER",
];
const TARGET_PERIODS: TargetPeriod[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "ONE_TIME",
];

type Draft = BusinessTargetPayload;

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  metric: "FIELD_TASK_COUNT",
  material_keyword: "",
  material_unit: "",
  waste_type: "",
  period: "MONTHLY",
  target_value: "",
  period_start: "",
  period_end: "",
  project: null,
  category: null,
  notify_at_50: true,
  notify_at_80: true,
  notify_at_90: true,
  notify_at_100: true,
  notify_user_ids: [],
  is_active: true,
});

function decimal(value: string): string {
  return value.trim().replace(",", ".");
}

function percent(row: BusinessTarget): number {
  const value = Number(row.completion_percent);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function BusinessTargetManagement() {
  const t = useTranslations("businessTargets");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("company_settings.manage");
  const [editing, setEditing] = useState<BusinessTarget | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [removing, setRemoving] = useState<BusinessTarget | null>(null);

  const targets = useQuery({
    queryKey: ["business-targets"],
    queryFn: () => getBusinessTargets({ page_size: 200, sort_by: "period_start", sort_order: "desc" }),
  });
  const projects = useQuery({
    queryKey: ["projects", "business-target-options"],
    queryFn: () => getProjects({ page_size: 500, sort_by: "name", sort_order: "asc" }),
  });
  const categories = useQuery({
    queryKey: ["project-categories", "business-target-options", draft.project],
    queryFn: () => getProjectCategories({ page_size: 500, project: draft.project ?? undefined }),
    enabled: Boolean(draft.project),
  });
  const users = useQuery({
    queryKey: ["users", "business-target-options"],
    queryFn: () => getUsers({ page_size: 500, sort_by: "full_name", sort_order: "asc" }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["business-targets"] });
    setEditing(null);
  };
  const save = useMutation({
    mutationFn: () => {
      const payload: Draft = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description?.trim() ?? "",
        target_value: decimal(draft.target_value),
        project: draft.project || null,
        category: draft.project ? draft.category || null : null,
        notify_user_ids: draft.notify_user_ids ?? [],
      };
      return editing && editing !== "new"
        ? updateBusinessTarget(editing.id, payload)
        : createBusinessTarget(payload);
    },
    onSuccess: invalidate,
  });
  const refresh = useMutation({
    mutationFn: refreshBusinessTarget,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["business-targets"] }),
  });
  const remove = useMutation({
    mutationFn: deleteBusinessTarget,
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["business-targets"] });
    },
  });

  function openNew() {
    setDraft(emptyDraft());
    setEditing("new");
  }
  function openEdit(row: BusinessTarget) {
    setDraft({
      name: row.name,
      description: row.description,
      metric: row.metric,
      material_keyword: row.material_keyword,
      material_unit: row.material_unit,
      waste_type: row.waste_type,
      period: row.period,
      target_value: row.target_value,
      period_start: row.period_start,
      period_end: row.period_end,
      project: row.project,
      category: row.category,
      notify_at_50: row.notify_at_50,
      notify_at_80: row.notify_at_80,
      notify_at_90: row.notify_at_90,
      notify_at_100: row.notify_at_100,
      notify_user_ids: row.notify_user_ids,
      is_active: row.is_active,
    });
    setEditing(row);
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="space-y-4">
      <ListHeader
        title={t("management.title")}
        subtitle={t("management.subtitle")}
        action={canManage ? <Button size="sm" onClick={openNew}><Plus />{t("management.new")}</Button> : undefined}
      />
      {targets.isLoading ? (
        <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-primary" /></div>
      ) : targets.isError ? (
        <p className="rounded-lg border p-6 text-center text-sm text-destructive">{t("loadError")}</p>
      ) : (targets.data?.results.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center"><Target className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">{t("management.empty")}</p></div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(targets.data?.results ?? []).map((row) => {
            const value = percent(row);
            return (
              <article key={row.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate font-semibold">{row.name}</h3><p className="mt-1 text-xs text-muted-foreground">{row.project_name || t("management.companyWide")} / {row.period_start} - {row.period_end}</p></div>
                  <StatusBadge label={row.is_active ? t("status.active") : t("status.inactive")} tone={row.is_active ? "positive" : "neutral"} />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${value}%` }} /></div>
                <div className="mt-2 flex items-center justify-between text-sm"><span>{row.current_value} / {row.target_value}</span><strong>{value.toFixed(2)}%</strong></div>
                {row.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate(row.id)}><RefreshCw className={refresh.isPending ? "animate-spin" : ""} />{t("management.refresh")}</Button>
                  {canManage && <Button size="sm" variant="outline" onClick={() => openEdit(row)}><Edit3 />{t("management.edit")}</Button>}
                  {canManage && <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRemoving(row)}><Trash2 />{t("management.remove")}</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{editing === "new" ? t("management.newTitle") : t("management.editTitle")}</DialogTitle><DialogDescription>{t("management.formHelp")}</DialogDescription></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldWrapper label={t("field.name")} required className="sm:col-span-2"><Input value={draft.name} onChange={(event) => setField("name", event.target.value)} /></FieldWrapper>
              <FieldWrapper label={t("field.description")} className="sm:col-span-2"><Textarea value={draft.description ?? ""} onChange={(event) => setField("description", event.target.value)} /></FieldWrapper>
              <FieldWrapper label={t("field.project")}><Select value={draft.project ?? "all"} onValueChange={(value) => { setField("project", value === "all" ? null : value); setField("category", null); }}><SelectTrigger><SelectValue placeholder={t("field.allProjects")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("field.companyWide")}</SelectItem>{(projects.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.code} - {row.name}</SelectItem>)}</SelectContent></Select></FieldWrapper>
              <FieldWrapper label={t("field.category")} hint={!draft.project ? t("field.categoryHint") : draft.metric !== "FIELD_TASK_COUNT" ? t("field.categoryMetricHint") : undefined}><Select disabled={!draft.project || draft.metric !== "FIELD_TASK_COUNT"} value={draft.category ?? "all"} onValueChange={(value) => setField("category", value === "all" ? null : value)}><SelectTrigger><SelectValue placeholder={t("field.allCategories")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("field.allCategories")}</SelectItem>{(categories.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.code} - {row.name}</SelectItem>)}</SelectContent></Select></FieldWrapper>
              <FieldWrapper label={t("field.metric")} required><Select value={draft.metric} onValueChange={(value) => setDraft((current) => ({ ...current, metric: value as TargetMetric, category: value === "FIELD_TASK_COUNT" ? current.category : null, material_keyword: value.startsWith("MATERIAL_RECEIPT") ? current.material_keyword : "", material_unit: value === "MATERIAL_RECEIPT_QUANTITY" ? current.material_unit : "", waste_type: value === "SETTLED_RECYCLING_WEIGHT" ? current.waste_type : "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_METRICS.map((value) => <SelectItem key={value} value={value}>{t(`metric.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>
              <FieldWrapper label={t("field.period")} required><Select value={draft.period} onValueChange={(value) => setField("period", value as TargetPeriod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_PERIODS.map((value) => <SelectItem key={value} value={value}>{t(`period.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>
              {(draft.metric === "MATERIAL_RECEIPT_COUNT" || draft.metric === "MATERIAL_RECEIPT_QUANTITY") && <FieldWrapper label={t("field.materialKeyword")} hint={t("field.materialKeywordHint")}><Input value={draft.material_keyword ?? ""} onChange={(event) => setField("material_keyword", event.target.value)} /></FieldWrapper>}
              {draft.metric === "MATERIAL_RECEIPT_QUANTITY" && <FieldWrapper label={t("field.materialUnit")} required><Select value={draft.material_unit || undefined} onValueChange={(value) => setField("material_unit", value)}><SelectTrigger><SelectValue placeholder={t("field.chooseUnit")} /></SelectTrigger><SelectContent>{MATERIAL_UNITS.map((value) => <SelectItem key={value} value={value}>{t(`materialUnit.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>}
              {draft.metric === "SETTLED_RECYCLING_WEIGHT" && <FieldWrapper label={t("field.wasteType")}><Select value={draft.waste_type || "all"} onValueChange={(value) => setField("waste_type", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("field.allWasteTypes")}</SelectItem>{WASTE_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`wasteType.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>}
              <FieldWrapper label={t("field.targetValue")} required hint={t(`field.targetValueHint.${draft.metric}`)}><Input type="number" min="0.001" step="0.001" value={draft.target_value} onChange={(event) => setField("target_value", event.target.value)} /></FieldWrapper>
              <FieldWrapper label={t("field.periodStart")} required><Input type="date" value={draft.period_start} onChange={(event) => setField("period_start", event.target.value)} /></FieldWrapper>
              <FieldWrapper label={t("field.periodEnd")} required><Input type="date" value={draft.period_end} onChange={(event) => setField("period_end", event.target.value)} /></FieldWrapper>
              <FieldWrapper label={t("field.notifyUsers")} hint={t("field.notifyUsersHint")} className="sm:col-span-2"><div className="max-h-36 overflow-y-auto rounded-md border">{(users.data?.results ?? []).map((user) => <label key={user.id} className="flex min-h-10 items-center gap-2 border-b px-3 py-2 last:border-0"><Checkbox checked={(draft.notify_user_ids ?? []).includes(user.id)} onCheckedChange={(checked) => setField("notify_user_ids", checked === true ? [...(draft.notify_user_ids ?? []), user.id] : (draft.notify_user_ids ?? []).filter((id) => id !== user.id))} /><span className="text-sm">{user.full_name}</span></label>)}{!users.isLoading && (users.data?.results.length ?? 0) === 0 && <p className="p-3 text-sm text-muted-foreground">{t("field.noUsers")}</p>}</div></FieldWrapper>
              <div className="grid gap-2 sm:col-span-2"><p className="text-sm font-medium">{t("field.milestones")}</p><div className="grid gap-2 sm:grid-cols-4">{([50, 80, 90, 100] as const).map((threshold) => { const key = `notify_at_${threshold}` as keyof Draft; return <label key={threshold} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Checkbox checked={draft[key] === true} onCheckedChange={(checked) => setField(key, checked === true)} />{threshold}%</label>; })}</div><p className="text-xs text-muted-foreground">{t("field.milestonesHint")}</p></div>
              {save.isError && <p className="text-sm text-destructive sm:col-span-2">{t("saveError")}</p>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}><X />{t("management.cancel")}</Button><Button requires={[[draft.name, t("field.name")], [decimal(draft.target_value) && Number(decimal(draft.target_value)) > 0, t("field.targetValue")], [draft.period_start, t("field.periodStart")], [draft.period_end && draft.period_start <= draft.period_end, t("field.periodEnd")], [draft.metric !== "MATERIAL_RECEIPT_QUANTITY" || draft.material_unit, t("field.materialUnit")]]}
                                                                                                                                   disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Check />}{t("management.save")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {removing && <ConfirmDialog open onOpenChange={(open) => !open && setRemoving(null)} title={t("management.removeTitle", { name: removing.name })} description={t("management.removeDescription")} confirmLabel={t("management.removeConfirm")} isPending={remove.isPending} onConfirm={() => remove.mutate(removing.id)} />}
    </section>
  );
}
