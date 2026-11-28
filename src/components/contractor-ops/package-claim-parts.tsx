"use client";

/**
 * Multi Engine after 客户 10-28 (JB51, JB52):
 *
 * - a Progress Claim is made in 「新建资料包」 like every other package, with
 *   its 期数 / Claim 类型 / 分类 / 分包商 on the package (JB307-3, 客户 11-28j:
 *   「Claim 类型及 Claim 分类必须填写。属于分包商的 Progress Claim，必须选择对应
 *   分包商」 - 期数 stays optional)
 *   (`ClaimInfoFields`, `ClaimInfoBlock`); a subcontractor's claim also names
 *   its 施工分类, 实际施工日期范围, 期数, Claim No. and 申请金额, and shows its
 *   「历史申请」 (JB309-1/3, 客户 11-28l, `ClaimHistoryPanel`); the Progress Claim tab only filters,
 *   and its one button manages the Claim categories (`ClaimCategoriesDialog`,
 *   客户: 「这个应该是新增claim 分类，不是新增claim」);
 * - 「对外分享（WhatsApp / 电邮）」 is the system's one 发送 (JB64,
 *   `usePackageSend`): to whom, written as 已打开分享窗口, and a person marks
 *   it 已确认发送;
 * - 「发送记录」 lists the in-system sends and the shares by time (`SendLog`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  ClaimFieldsForm,
  EMPTY_FIELDS,
  useClaimCategories,
  type ClaimFields,
} from "@/components/contractor-ops/claim-engine";
import { CategoryDialog } from "@/components/contractor-ops/operations-workspaces";
import { rm } from "@/components/contractor-ops/package-review-loop";
import { Shell } from "@/components/contractor-ops/package-shell";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ShareLine, useMarkSent } from "@/components/shared/record-send-log";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  EvidencePackageDetail,
  EvidencePackageRow,
  PackageClaimHistory,
  ProjectCategory,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  getConstructionPhases,
  getPackageClaimHistory,
  updateEvidencePackage,
  updateProjectCategory,
  type PackageClaimFieldsPayload,
} from "@/services/contractor-ops.service";

/* -- 期数 / Claim 类型 / 分类 / 分包商 ------------------------------------- */

export type ClaimKindChoice = "" | "MATERIAL_ON_SITE" | "PROGRESS";
/** JB307-3: Claim 类型 is required - no 「不选」 any more ("" is only "not chosen yet"). */
const CLAIM_KINDS: ClaimKindChoice[] = ["MATERIAL_ON_SITE", "PROGRESS"];

/** The seeded 「Subcontractor Claim」, by its code (a rename keeps it). */
const SUBCONTRACTOR_CLAIM_CODE = "CLM-SUBCONTRACTOR";
const SUBCONTRACTOR_CLAIM_WORDS = ["分包", "subcon", "sub-con", "sub con", "subkon"];

/**
 * Whether a claim of this 分类 is a subcontractor's (JB307-3) - the server's
 * `multi_engine.claim_needs_subcontractor`: the seeded Subcontractor Claim, or
 * a 分类 whose name (its parent's, 「其他」's typed name) says 分包 / subcon.
 */
export function claimNeedsSubcontractor(
  category: Pick<ProjectCategory, "code" | "name" | "name_zh" | "name_en" | "parent_name" | "is_other"> | undefined,
  otherName = "",
): boolean {
  if (!category) return false;
  if (category.code === SUBCONTRACTOR_CLAIM_CODE) return true;
  const text = [category.name, category.name_zh, category.name_en, category.parent_name, category.is_other ? otherName : ""]
    .map((part) => part ?? "")
    .join(" ")
    .toLowerCase();
  return SUBCONTRACTOR_CLAIM_WORDS.some((word) => text.includes(word));
}

export interface ClaimInfoValue {
  /** `YYYY-MM`, or "" for none. */
  period: string;
  kind: ClaimKindChoice;
  fields: ClaimFields;
  /** JB309-1 (a subcontractor's claim): 施工分类 id, 实际施工日期范围 `YYYY-MM-DD`, Claim No. */
  phase: string;
  workFrom: string;
  workTo: string;
  refNo: string;
}

export const EMPTY_CLAIM_INFO: ClaimInfoValue = {
  period: "",
  kind: "",
  fields: EMPTY_FIELDS,
  phase: "",
  workFrom: "",
  workTo: "",
  refNo: "",
};

/** The form's value from a package's own claim fields. */
export function claimInfoValue(pkg: Pick<EvidencePackageRow, "claim_info" | "claim_other_name">): ClaimInfoValue {
  const info = pkg.claim_info;
  if (!info) return EMPTY_CLAIM_INFO;
  return {
    period: info.period ? info.period.slice(0, 7) : "",
    kind: info.kind,
    fields: {
      ...EMPTY_FIELDS,
      category: info.category ?? "",
      otherName: pkg.claim_other_name ?? "",
      subcontractor: info.subcontractor ?? "",
    },
    phase: info.phase ?? "",
    workFrom: info.work_from ?? "",
    workTo: info.work_to ?? "",
    refNo: info.ref_no ?? "",
  };
}

/**
 * What the server takes; empty strings clear a field. `application`: the
 * claim is a subcontractor's (JB309-1) - another claim keeps no 施工分类,
 * dates or Claim No.
 */
export function claimInfoPayload(value: ClaimInfoValue, application = true): Required<PackageClaimFieldsPayload> {
  return {
    claim_period: value.period,
    claim_kind: value.kind,
    claim_category: value.fields.category,
    claim_other_name: value.fields.otherName.trim(),
    claim_subcontractor: value.fields.subcontractor,
    claim_phase: application ? value.phase : "",
    claim_work_from: application ? value.workFrom : "",
    claim_work_to: application ? value.workTo : "",
    claim_ref_no: application ? value.refNo.trim() : "",
  };
}

/** Whether the chosen 分类 makes this a subcontractor's claim (JB307-3), with the JB309 fields. */
export function useClaimIsApplication(project: string, value: ClaimInfoValue): boolean {
  // query-failure: the same query ClaimInfoFields draws, with its own note there.
  const categories = useClaimCategories(project, { offered: true });
  const chosen = (categories.data?.results ?? []).find((row) => row.id === value.fields.category);
  return claimNeedsSubcontractor(chosen, value.fields.otherName);
}

/** The work dates end before they start (JB309-1). */
export function workDatesReversed(value: Pick<ClaimInfoValue, "workFrom" | "workTo">): boolean {
  return Boolean(value.workFrom && value.workTo && value.workFrom > value.workTo);
}

/**
 * The fields a Progress Claim adds to 「新建资料包」 (JB52 第 1 点). Since
 * JB307-3 Claim 类型 and 分类 carry a star, and 分包商 too when the 分类 is a
 * subcontractor's; 「其他」 asks what it is, as on a claim.
 */
export function ClaimInfoFields({
  project,
  value,
  onChange,
  packageId,
}: {
  project: string;
  value: ClaimInfoValue;
  onChange: (next: ClaimInfoValue) => void;
  /** The draft being edited: not its own 「历史申请」. */
  packageId?: string;
}) {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  const words = useTranslations("jb307b");
  const jb309 = useTranslations("jb309d");
  // query-failure: passed to ClaimFieldsForm, which shows QueryFailedNote under the picker.
  const categories = useClaimCategories(project, { offered: true });
  const chosen = (categories.data?.results ?? []).find((row) => row.id === value.fields.category);
  const needsSub = claimNeedsSubcontractor(chosen, value.fields.otherName);
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3" data-claim-info-fields>
      <p className="text-sm font-medium">{t("claimInfo.title")}</p>
      <p className="text-xs text-muted-foreground">{words("required")}</p>
      {needsSub && <p className="text-xs text-muted-foreground">{jb309("required")}</p>}
      <FieldWrapper label={t("claimInfo.period")} required={needsSub}>
        <Input
          type="month"
          value={value.period}
          onChange={(event) => onChange({ ...value, period: event.target.value })}
          className="w-48"
        />
      </FieldWrapper>
      <FieldWrapper label={t("claimInfo.kind")} required>
        <div className="grid grid-cols-2 gap-2" data-claim-kind>
          {CLAIM_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={value.kind === option}
              onClick={() => onChange({ ...value, kind: option })}
              className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                value.kind === option
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {claims(`kind.${option}`)}
            </button>
          ))}
        </div>
      </FieldWrapper>
      <ClaimFieldsForm
        project={project}
        general={false}
        withAmount={false}
        value={value.fields}
        onChange={(fields) => onChange({ ...value, fields })}
        categories={categories}
        categoryRequired
        subcontractorRequired={needsSub}
        subcontractorHint={chosen ? (needsSub ? words("subRequired") : words("subOptional")) : undefined}
      />
      {needsSub && <ApplicationFields project={project} value={value} onChange={onChange} packageId={packageId} />}
    </div>
  );
}

/**
 * JB309-1 (客户 11-28l 第 1 点): a subcontractor's claim also names its 施工分类
 * (the project's construction phases, as progress records carry them), the
 * 实际施工日期范围 and the subcontractor's Claim No.; and the form shows the
 * 「历史申请」 of the same 分包商 with the same 期数 or overlapping dates
 * (第 3 点) before it is saved.
 */
function ApplicationFields({
  project,
  value,
  onChange,
  packageId,
}: {
  project: string;
  value: ClaimInfoValue;
  onChange: (next: ClaimInfoValue) => void;
  packageId?: string;
}) {
  const words = useTranslations("jb309d");
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () => getConstructionPhases({ project, page_size: 200 }),
    enabled: Boolean(project),
  });
  const options = (phases.data?.results ?? []).filter((row) => row.is_active || row.id === value.phase);
  const reversed = workDatesReversed(value);
  const subcontractor = value.fields.subcontractor;
  const datesReady = Boolean(value.workFrom && value.workTo && !reversed);
  const asked = Boolean(project && subcontractor && (value.period || datesReady));
  const history = useQuery({
    queryKey: ["package-claim-history", project, subcontractor, value.period, datesReady ? value.workFrom : "", datesReady ? value.workTo : "", packageId ?? ""],
    queryFn: () =>
      getPackageClaimHistory({
        project,
        subcontractor,
        ...(value.period ? { period: value.period } : {}),
        ...(datesReady ? { work_from: value.workFrom, work_to: value.workTo } : {}),
        ...(packageId ? { exclude: packageId } : {}),
      }),
    enabled: asked,
  });
  return (
    <>
      <FieldWrapper label={words("phase")} required hint={words("phaseHint")}>
        <Select value={value.phase} onValueChange={(phase) => onChange({ ...value, phase })} disabled={!project}>
          <SelectTrigger className="w-full" aria-label={words("phase")} data-claim-phase>
            <SelectValue placeholder={words("phasePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QueryFailedNote query={phases} what={words("phase")} />
        {phases.isSuccess && options.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{words("noPhases")}</p>
        )}
      </FieldWrapper>
      <FieldWrapper label={words("workDates")} required>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{words("workFrom")}</span>
            <Input
              type="date"
              value={value.workFrom}
              onChange={(event) => onChange({ ...value, workFrom: event.target.value })}
              aria-label={words("workFrom")}
              data-claim-work-from
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{words("workTo")}</span>
            <Input
              type="date"
              value={value.workTo}
              min={value.workFrom || undefined}
              onChange={(event) => onChange({ ...value, workTo: event.target.value })}
              aria-label={words("workTo")}
              data-claim-work-to
            />
          </label>
        </div>
        {reversed && <p className="mt-1 text-xs text-destructive">{words("datesOrder")}</p>}
      </FieldWrapper>
      <FieldWrapper label={words("refNo")} required hint={words("refNoHint")}>
        <Input
          value={value.refNo}
          maxLength={100}
          placeholder={words("refNoPlaceholder")}
          onChange={(event) => onChange({ ...value, refNo: event.target.value })}
          data-claim-ref-no
        />
      </FieldWrapper>
      {asked && (
        <ClaimHistoryPanel history={history.data} loading={history.isPending} variant="form" />
      )}
      {asked && <QueryFailedNote query={history} what={words("history.what")} />}
    </>
  );
}

/**
 * 「历史申请」 (JB309-3, 客户 11-28l 第 3 点: 「再次建立相同期数或施工日期范围的
 * 申请时，系统必须显示历史申请、批准金额、结算金额及关联资料包编号，供审批人员
 * 核对」): the other applications of the same project and 分包商 - package no,
 * Claim No., 期数, 施工日期, 施工分类, the four amounts (none without 「金额查看」),
 * 审阅 and 结算状态. A warning in the form; a check list in the package window.
 */
export function ClaimHistoryPanel({
  history,
  loading = false,
  variant,
  onOpenPackage,
}: {
  history: PackageClaimHistory | null | undefined;
  loading?: boolean;
  variant: "form" | "window";
  onOpenPackage?: (id: string) => void;
}) {
  const words = useTranslations("jb309d");
  const loop = useTranslations("jb252");
  const settle = useTranslations("jb298");
  const formatter = useDateFormat();
  const rows = history?.rows ?? [];
  if (variant === "form" && !loading && rows.length === 0) return null;
  const warn = rows.length > 0;
  return (
    <section
      className={`space-y-2 rounded-lg border p-3 ${warn ? "border-warning/50 bg-warning/10" : "bg-muted/20"}`}
      aria-label={words("history.title")}
      data-claim-history={variant}
    >
      <p className="text-sm font-medium">
        {words("history.title")}
        {warn ? ` · ${rows.length}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {variant === "form" ? words("history.formHint") : words("history.windowHint")}
      </p>
      {loading ? (
        <p className="text-xs text-muted-foreground">{words("history.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{words("history.empty")}</p>
      ) : (
        <>
          {history?.amounts_locked && <p className="text-xs text-muted-foreground">{words("history.amountsLocked")}</p>}
          <ul className="space-y-2">
            {rows.map((row) => {
              const dates =
                row.work_from && row.work_to
                  ? `${formatter.date(row.work_from)} – ${formatter.date(row.work_to)}`
                  : "—";
              const stateWords = [
                row.state === "DRAFT" ? words("history.draft") : loop(`progress.${row.review_progress || "NOT_SENT"}`),
                row.settle_state && row.settle_state !== "NOT_NEEDED" ? settle(`state.${row.settle_state}`) : "",
              ].filter(Boolean);
              return (
                <li key={row.id} className="space-y-1 rounded-md border bg-card p-2 text-sm" data-claim-history-row>
                  <div className="flex flex-wrap items-center gap-2">
                    {onOpenPackage ? (
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => onOpenPackage(row.id)}
                      >
                        {row.package_no || row.name}
                      </button>
                    ) : (
                      <span className="font-medium">{row.package_no || row.name}</span>
                    )}
                    {row.ref_no && (
                      <span className="text-muted-foreground">
                        {words("refNoShort")} {row.ref_no}
                      </span>
                    )}
                    {row.same_period && <StatusBadge label={words("history.samePeriod")} tone="warning" />}
                    {row.dates_overlap && <StatusBadge label={words("history.datesOverlap")} tone="warning" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {words("history.period")} {periodLabel(row.period) || "—"} · {words("history.dates")} {dates}
                    {row.phase_name ? ` · ${words("history.phase")} ${row.phase_name}` : ""}
                  </p>
                  {!history?.amounts_locked && (
                    <p className="text-xs tabular">
                      {words("history.claim")} {rm(row.claim_amount)} · {words("history.approved")} {rm(row.approved_amount)} ·{" "}
                      {words("history.checked")} {rm(row.checked_amount)} · {words("history.settled")} {rm(row.settled_amount)}
                    </p>
                  )}
                  <p className="text-xs">
                    {stateWords.join(" · ")}
                    {row.check_no ? ` · ${row.check_no}` : ""}
                    {row.settlement_no ? ` · ${row.settlement_no}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * What the claim fields still need before they can be saved (JB307-3), as
 * the labels on screen: Claim 类型, Claim 分类, 「其他」's name, and the 分包商
 * of a subcontractor's claim. Empty when they can be saved.
 */
export function useClaimInfoMissing(project: string, value: ClaimInfoValue, amount?: string | null): string[] {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  const jb309 = useTranslations("jb309d");
  // query-failure: the same query ClaimInfoFields draws, with its own note there.
  const categories = useClaimCategories(project, { offered: true });
  const chosen = (categories.data?.results ?? []).find((row) => row.id === value.fields.category);
  const missing: string[] = [];
  if (!value.kind) missing.push(t("claimInfo.kind"));
  if (!value.fields.category) missing.push(t("claimInfo.category"));
  if (chosen?.is_other && !value.fields.otherName.trim()) missing.push(claims("field.otherName"));
  const application = claimNeedsSubcontractor(chosen, value.fields.otherName);
  if (application && !value.fields.subcontractor) {
    missing.push(t("claimInfo.subcontractor"));
  }
  // JB309-1: a subcontractor's claim, in the client's order. `amount`
  // undefined: the amount is not on this form.
  if (application) {
    if (!value.phase) missing.push(jb309("phase"));
    if (!value.workFrom || !value.workTo) missing.push(jb309("workDates"));
    if (!value.period) missing.push(t("claimInfo.period"));
    if (!value.refNo.trim()) missing.push(jb309("refNo"));
    if (amount !== undefined && !(amount ?? "").trim()) missing.push(jb309("amount"));
  }
  return missing;
}

/** The button's reason for `useClaimInfoMissing`, or `undefined` when nothing is missing. */
export function useClaimInfoReason(project: string, value: ClaimInfoValue, amount?: string | null): string | undefined {
  const common = useTranslations("common");
  const jb309 = useTranslations("jb309d");
  const missing = useClaimInfoMissing(project, value, amount);
  if (missing.length) return common("missingFields", { fields: missing.join(common("listSeparator")) });
  return workDatesReversed(value) ? jb309("datesOrder") : undefined;
}

/** `2026-10-01` as `2026-10`: the month a claim is for. */
export function periodLabel(period: string | null | undefined) {
  return period ? period.slice(0, 7) : "";
}

/** The facts of a Progress Claim package (JB52), and 「修改」 while it is a draft. */
export function ClaimInfoBlock({
  pkg,
  canEdit,
  onChanged,
  onOpenPackage,
}: {
  pkg: EvidencePackageDetail;
  canEdit: boolean;
  onChanged: () => void;
  /** JB309-3: a 「历史申请」 row opens that package. */
  onOpenPackage?: (id: string) => void;
}) {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  const jb309 = useTranslations("jb309d");
  const formatter = useDateFormat();
  const [editing, setEditing] = useState(false);
  const info = pkg.claim_info;
  if (!info) return null;
  const none = t("claimInfo.none");
  // An old CLM- claim keeps its own fields; only a package's own are edited here.
  const editable = canEdit && !info.claim_id;
  return (
    <section className="space-y-2 rounded-lg border bg-muted/20 p-3" aria-label={t("claimInfo.title")}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">{t("claimInfo.title")}</p>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {t("claimInfo.edit")}
          </Button>
        )}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {info.claim_no && <Fact label={t("claimInfo.claimNo")} value={info.claim_no} />}
        <Fact label={t("claimInfo.period")} value={periodLabel(info.period) || none} />
        <Fact label={t("claimInfo.kind")} value={info.kind ? claims(`kind.${info.kind}`) : none} />
        <Fact label={t("claimInfo.category")} value={info.category_name || none} />
        <Fact label={t("claimInfo.subcontractor")} value={info.subcontractor_name || none} />
        {/* JB309-1: shown when the package has them (older packages do not). */}
        {info.phase_name && <Fact label={jb309("phase")} value={info.phase_name} />}
        {info.work_from && info.work_to && (
          <Fact label={jb309("workDates")} value={`${formatter.date(info.work_from)} – ${formatter.date(info.work_to)}`} />
        )}
        {info.ref_no && <Fact label={jb309("refNo")} value={info.ref_no} />}
      </dl>
      {pkg.claim_history && (
        <ClaimHistoryPanel history={pkg.claim_history} variant="window" onOpenPackage={onOpenPackage} />
      )}
      {editing && (
        <EditClaimInfoDialog
          pkg={pkg}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function EditClaimInfoDialog({
  pkg,
  onClose,
  onSaved,
}: {
  pkg: EvidencePackageDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const jb309 = useTranslations("jb309d");
  const [value, setValue] = useState<ClaimInfoValue>(() => claimInfoValue(pkg));
  // JB309-1: the 申请金额 is typed in the window (with the PIN), so it is read here.
  const missing = useClaimInfoReason(pkg.project, value, pkg.claim_amount ?? "");
  const application = useClaimIsApplication(pkg.project, value);
  const save = useMutation({
    mutationFn: () => updateEvidencePackage(pkg.id, claimInfoPayload(value, application)),
    onSuccess: onSaved,
  });
  return (
    <Shell title={t("claimInfo.editTitle")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <ClaimInfoFields project={pkg.project} value={value} onChange={setValue} packageId={pkg.id} />
        {application && !pkg.claim_amount && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{jb309("amountMissing")}</p>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button disabled={save.isPending || Boolean(missing)} disabledReason={missing ?? common("saving")} onClick={() => save.mutate()}>
          {t("claimInfo.save")}
        </Button>
      </footer>
    </Shell>
  );
}

/* -- 新增 Claim 分类 ------------------------------------------------------- */

/**
 * The Progress Claim tab's one button (客户 10-28: 「这个应该是新增claim 分类，
 * 不是新增claim」): this project's Claim categories - add, rename, switch off.
 * No claim and no period is made here; that is 「新建资料包」.
 */
export function ClaimCategoriesDialog({
  project: initialProject,
  onClose,
}: {
  project: string;
  onClose: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [editing, setEditing] = useState<ProjectCategory | "new" | null>(null);
  const categories = useClaimCategories(project, { offered: false });
  const rows = categories.data?.results ?? [];
  const toggle = useMutation({
    mutationFn: (row: ProjectCategory) => updateProjectCategory(row.id, { is_active: !row.is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project-categories"] }),
  });
  return (
    <Shell title={t("claimCategories.title")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t("claimCategories.hint")}
        </p>
        <FieldWrapper label={t("claimCategories.project")}>
          <ProjectPicker value={project} onValueChange={setProject} placeholder={t("field.selectProject")} />
        </FieldWrapper>
        {project && (
          <>
            <Button className="w-full" onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t("claimCategories.add")}
            </Button>
            <QueryFailedNote query={categories} what={t("claimCategories.title")} />
            {categories.isSuccess && rows.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                {t("claimCategories.empty")}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border" data-claim-categories>
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 p-3">
                    <p className="min-w-0 flex-1 text-sm font-medium">
                      {row.parent_name ? `${row.parent_name} › ` : ""}
                      {row.name}
                    </p>
                    {!row.is_active && <StatusBadge label={t("claimCategories.off")} tone="neutral" />}
                    <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                      <Pencil className="size-4" />
                      {t("claimCategories.rename")}
                    </Button>
                    {!row.is_fixed && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggle.isPending}
                        disabledReason={common("saving")}
                        onClick={() => toggle.mutate(row)}
                      >
                        {row.is_active ? t("claimCategories.disable") : t("claimCategories.enable")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <footer className="flex justify-end border-t border-panel-border bg-muted p-4">
        <Button variant="outline" onClick={onClose}>
          {common("close")}
        </Button>
      </footer>
      {editing && project && (
        <CategoryDialog
          project={project}
          defaultKind="CLAIM"
          row={editing === "new" ? null : editing}
          nextSortOrder={rows.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
          }}
        />
      )}
    </Shell>
  );
}

/* -- 发送状态 -------------------------------------------------------------- */

/**
 * The list's and the header's words for how far a package went out (JB51 第
 * 4 点): 未发送 / 已发送系统内 / 已发起分享 / 已对外发送. 「已确认」 is the
 * lock and is not one of them.
 */
export function sendStatusKeys(row: Pick<EvidencePackageRow, "send_status" | "recipient_count">) {
  const status = row.send_status ?? {
    internal: (row.recipient_count ?? 0) > 0,
    external: "NONE" as const,
  };
  const keys: ("NOT_SENT" | "INTERNAL" | "STARTED" | "SENT")[] = [];
  if (status.internal) keys.push("INTERNAL");
  if (status.external !== "NONE") keys.push(status.external);
  return keys.length ? keys : (["NOT_SENT"] as const);
}

/* -- 对外分享: `package-share.tsx` (JB63, JB64) ------------------------------- */

export { packageRecord, usePackageSend, type PackageShareWhat } from "@/components/contractor-ops/package-share";

/* -- 发送记录 -------------------------------------------------------------- */

interface LogEntry {
  key: string;
  at: string;
  node: React.ReactNode;
}

/**
 * 「发送记录」 (JB51 第 3 点): every send, newest first - in the system (head
 * office, a consultant, a link: opened or not) and by hand (WhatsApp, email,
 * other: 已打开分享窗口 / 已确认发送, with 「标记为已发送」 - JB64).
 */
export function SendLog({ pkg, onChanged }: { pkg: EvidencePackageDetail; onChanged: () => void }) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  // 「标记为已发送」 (JB64): the one share log's, then the package again.
  const mark = useMarkSent(onChanged);

  const entries: LogEntry[] = [
    ...(pkg.recipients ?? []).map((row) => ({
      key: `r:${row.id}`,
      at: row.created_at,
      node: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={t("sendLog.internal")} tone="info" />
            <span className="text-sm font-medium">
              {t(`exchange.kind.${row.kind}`)}
              {row.display_name ? ` · ${row.display_name}` : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("sendLog.by", { name: row.created_by_name || "—", when: formatter.dateTime(row.created_at) })}
          </p>
          <p className="text-xs">
            {row.revoked_at
              ? t("sendLog.revoked")
              : row.first_opened_at
                ? t("sendLog.opened", { when: formatter.dateTime(row.first_opened_at) })
                : t("sendLog.notOpened")}
          </p>
        </>
      ),
    })),
    // 对外分享 (JB51, JB64): the one share log's rows for this package.
    ...(pkg.shares ?? []).map((row) => ({
      key: `s:${row.id}`,
      at: row.created_at,
      node: (
        <>
          <StatusBadge label={t("sendLog.external")} tone="neutral" />
          <ShareLine
            share={row}
            onMark={(share) => mark.mutate(share)}
            marking={mark.isPending}
            extra={
              row.part === "TRANSCRIPT"
                ? t("exchange.report")
                : row.part.startsWith("R")
                  ? t("exchange.round", { n: Number(row.part.slice(1)) || 1 })
                  : undefined
            }
          />
        </>
      ),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <section className="space-y-2" aria-label={t("sendLog.title")} data-send-log>
      <h3 className="text-sm font-semibold">{t("sendLog.title")}</h3>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          {t("sendLog.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.key} className="space-y-1 rounded-lg border p-3">
              {entry.node}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

