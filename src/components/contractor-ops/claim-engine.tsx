"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Coins, FileUp, Inbox, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { CategoryDialog } from "@/components/contractor-ops/operations-workspaces";
import { CategoryOptionItems } from "@/components/shared/category-options";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { QuickAddSupplierButton } from "@/components/suppliers/quick-add-supplier";

import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
import { AmountDialog, VoucherDialog, Vouchers } from "@/components/contractor-ops/package-claim-facet";
import { Shell } from "@/components/contractor-ops/package-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import { EmptyState, FieldWrapper, FilterBar, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useOnProjectChange, usePageProject } from "@/components/providers/current-project-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type {
  ClaimDetail,
  ClaimKind,
  ClaimPaymentState,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  confirmClaim,
  createClaim,
  deleteClaim,
  evidencePackageFile,
  previewEvidencePackage,
  getClaim,
  getClaimCandidates,
  exportClaims,
  getClaims,
  getProjectCategories,
  getSubcontractorOptions,
  removeClaimItem,
  updateClaim,
  selectClaimItems,
  setClaimPayment,
} from "@/services/contractor-ops.service";

/**
 * Claim Engine - this period's claim, what is already claimed, and the money
 * (T-236).
 *
 * ## Two entry points, one screen
 *
 * 材料到场 and 施工进度 differ in exactly one thing: where the candidate records
 * come from. Everything else - the period, the four counts, the two rounds,
 * the returned lines, the payment state - is identical, and the consultant
 * said so in as many words: 「开发团队只需要开发一次底层状态和退回机制，两个模块
 * 分别读取不同资料」. So this is one screen with a kind, not two screens that
 * have to be kept equal.
 *
 * ## What is deliberately not here
 *
 * There is no send-for-review control and no returned-items inbox. Confirming
 * a claim raises an evidence package, and reviewing it is Multi Engine's
 * (D-158): the contractor sends it from `/evidence-packages`, the consultant
 * works it on the `package-reviews` screen they already have, and a returned
 * line comes back to this screen as an item marked 原路返回. A second review
 * surface here would be a second place for the two to disagree about what the
 * consultant actually decided.
 *
 * ## The two rounds are drawn as two rounds
 *
 * Ticking a record puts it on this period at once - 勾选后自动进入本期 - and
 * that is reversible. Confirming is the second round and is not: it is what
 * takes those records out of every later period. So the confirm control lives
 * behind its own dialog with the remarks it requires, rather than beside the
 * ticks where a mis-click would claim a month.
 *
 * ## Its category and its subcontractor (I10)
 *
 * Progress Claim categories are back, made by each project (ID6: Sundry /
 * Manpower / Subcontractor / Other Claim to start with): a claim names one,
 * the list filters and searches by it, and a 分包商 is chosen from the
 * companies marked so on the supplier list (ID7). 「一般」 Claim (ID50) is for
 * the categories with no records to tick - a description, an optional amount
 * and the papers uploaded on it, with a conversation like every record.
 */

const KINDS: ClaimKind[] = ["MATERIAL_ON_SITE", "PROGRESS", "GENERAL"];
const NO_CATEGORY = "__none__";
const ALL = "all";

/** One project's claim categories, for a form (on only) or a filter (all). */
function useClaimCategories(project: string, { offered }: { offered: boolean }) {
  return useQuery({
    queryKey: ["project-categories", "claims", project, offered],
    queryFn: () =>
      getProjectCategories({
        project,
        kind: "CLAIM",
        page_size: 200,
        ...(offered ? { is_active: true } : {}),
      }),
    enabled: Boolean(project),
  });
}

/** The companies marked 分包商 (ID7), searched as typed. */
function useSubcontractors(search: string) {
  return useQuery({
    queryKey: ["claims", "subcontractors", search],
    queryFn: () => getSubcontractorOptions(search || undefined),
  });
}
const PAYMENT_STATES: ClaimPaymentState[] = [
  "NOT_RECEIVED",
  "PARTIAL",
  "RECEIVED",
];
const PAGE_SIZE = 20;

/** `YYYY-MM` for today, which is what a claim's period is (D-164). */
function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ClaimEngineWorkspace() {
  const t = useTranslations("claims");
  const formatter = useDateFormat();
  const { can } = useAuth();
  // The top bar's 「当前项目」 (B13).
  const [project, setProject] = usePageProject();
  const [kind, setKind] = useState<ClaimKind | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // A record link (a message, the report centre) opens its claim (I10).
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(searchParams.get("claim"));
  // By category and subcontractor (I10: 「可按 Claim 分类查询记录」).
  const [category, setCategory] = useState(ALL);
  const [subcontractor, setSubcontractor] = useState(ALL);
  const filterCategories = useClaimCategories(project, { offered: false });
  const subcontractors = useSubcontractors("");
  // Page 1 of the next project, and the one open on the last project closes
  // (B13 audit #8).
  useOnProjectChange(project, () => {
    setPage(1);
    setOpenId(null);
  });
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ["claims", project, kind, search, page, category, subcontractor],
    queryFn: () =>
      getClaims({
        project: project || undefined,
        kind: kind || undefined,
        search: search || undefined,
        ...(category === NO_CATEGORY
          ? { uncategorised: "true" }
          : category !== ALL
            ? { category }
            : {}),
        ...(subcontractor !== ALL ? { subcontractor } : {}),
        page,
        page_size: PAGE_SIZE,
      }),
  });

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          can("claim.manage") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <ProjectFilter
          value={project}
          onChange={(next) => {
            setProject(next);
            setPage(1);
          }}
        />
        <Select
          value={kind || "all"}
          onValueChange={(next) => {
            setKind(next === "all" ? "" : (next as ClaimKind));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allKinds")}</SelectItem>
            {KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`kind.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Claim 分类 (I10): a project's categories, 未分类 for older claims. */}
        <Select
          value={category}
          onValueChange={(next) => {
            setCategory(next);
            setPage(1);
          }}
          disabled={!project}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label={t("field.category")}>
            <SelectValue placeholder={t("filter.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filter.allCategories")}</SelectItem>
            <SelectItem value={NO_CATEGORY}>{t("filter.noCategory")}</SelectItem>
            <CategoryOptionItems rows={filterCategories.data?.results ?? []} groupsSelectable />
          </SelectContent>
        </Select>
        <Select
          value={subcontractor}
          onValueChange={(next) => {
            setSubcontractor(next);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label={t("field.subcontractor")}>
            <SelectValue placeholder={t("filter.allSubcontractors")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filter.allSubcontractors")}</SelectItem>
            {(subcontractors.data?.results ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QueryFailedNote query={filterCategories} what={t("what.categories")} />
        <QueryFailedNote query={subcontractors} what={t("what.subcontractors")} />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full sm:w-72"
        />
        {/* The claims listed, as a file (H16, HD13). */}
        <ExportButton
          disabled={total === 0}
          disabledReason={t("empty")}
          title={t("title")}
          onExport={(format) =>
            exportClaims({
              format,
              title: t("title"),
              query: {
                project: project || undefined,
                kind: kind || undefined,
                search: search || undefined,
                ...(category === NO_CATEGORY
                  ? { uncategorised: "true" }
                  : category !== ALL
                    ? { category }
                    : {}),
                ...(subcontractor !== ALL ? { subcontractor } : {}),
              },
              columns: [
                { key: "claim_no", label: t("export.claimNo") },
                { key: "period", label: t("field.period") },
                { key: "project_name", label: t("field.project") },
                { key: "category_name", label: t("field.category") },
                { key: "subcontractor_name", label: t("field.subcontractor") },
                {
                  key: "state",
                  label: t("column.state"),
                  values: { DRAFT: t("state.DRAFT"), CONFIRMED: t("state.CONFIRMED") },
                },
                { key: "amount", label: t("field.amount") },
                {
                  key: "payment_state",
                  label: t("column.payment"),
                  values: Object.fromEntries(PAYMENT_STATES.map((value) => [value, t(`payment.${value}`)])),
                },
                { key: "item_count", label: t("column.items") },
                { key: "returned_count", label: t("export.returned") },
                { key: "confirmed_at", label: t("export.confirmedAt") },
              ],
            })
          }
        />
      </FilterBar>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("empty")} />
      ) : (
        <div className="surface-panel overflow-hidden rounded-xl">
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.claimNo")}</TableHead>
                <TableHead>{t("column.kind")}</TableHead>
                <TableHead>{t("field.category")}</TableHead>
                <TableHead>{t("column.period")}</TableHead>
                <TableHead className="text-right tabular">{t("column.items")}</TableHead>
                <TableHead>{t("column.state")}</TableHead>
                <TableHead>{t("column.payment")}</TableHead>
                <TableHead className="text-right">{t("column.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.claim_no}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {row.project_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`kind.${row.kind}`)}
                  </TableCell>
                  <TableCell>
                    {row.category_name ?? (
                      <span className="text-muted-foreground">{t("filter.noCategory")}</span>
                    )}
                    {row.subcontractor_name && (
                      <span className="block text-xs text-muted-foreground">
                        {row.subcontractor_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular">
                    {formatter.date(row.period)}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {row.item_count}
                    {row.returned_count > 0 && (
                      <span className="ml-1.5 text-xs text-destructive">
                        {t("returnedCount", { count: row.returned_count })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(`state.${row.state}`)}
                      tone={row.state === "CONFIRMED" ? "positive" : "neutral"}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(`payment.${row.payment_state}`)}
                      tone={
                        row.payment_state === "RECEIVED"
                          ? "positive"
                          : row.payment_state === "PARTIAL"
                            ? "warning"
                            : "neutral"
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(row.id)}
                    >
                      {t("open")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages: lastPage })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              disabledReason={t("firstPage")}
              onClick={() => setPage((current) => current - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= lastPage}
              disabledReason={t("lastPage")}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      )}

      {creating && (
        <NewClaimDialog
          onClose={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            setOpenId(row.id);
          }}
        />
      )}
      {openId && <ClaimSheet id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function NewClaimDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: ClaimDetail) => void;
}) {
  const t = useTranslations("claims");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [kind, setKind] = useState<ClaimKind>("MATERIAL_ON_SITE");
  const [period, setPeriod] = useState(thisMonth());
  const [fields, setFields] = useState<ClaimFields>(EMPTY_FIELDS);
  const general = kind === "GENERAL";

  const create = useMutation({
    mutationFn: () =>
      createClaim({
        project,
        kind,
        period,
        ...(fields.category ? { category: fields.category } : {}),
        ...(fields.otherName.trim() ? { other_name: fields.otherName.trim() } : {}),
        ...(fields.subcontractor ? { subcontractor: fields.subcontractor } : {}),
        ...(general
          ? { description: fields.description.trim(), ...(fields.amount.trim() ? { amount: fields.amount.trim() } : {}) }
          : {}),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      onCreated(row);
    },
  });
  const categories = useClaimCategories(project, { offered: true });
  const chosen = (categories.data?.results ?? []).find((row) => row.id === fields.category);

  return (
    <Shell title={t("newTitle")} onClose={onClose}>
      <div className="space-y-4 p-4">
        {/* The project cannot move afterwards: a claim is what one site is
            asking for, and the records on it come from that site's columns.
            Said here rather than discovered when a tick is refused. */}
        <FieldWrapper label={t("field.project")} required hint={t("projectLocked")}>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("field.selectProject")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.kind")} required hint={t(`kindHelp.${kind}`)}>
          <Select
            value={kind}
            onValueChange={(next) => setKind(next as ClaimKind)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`kind.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label={t("field.period")} required>
          {/* A month, not a date range: the number on the claim is
              `CLM-<site>-<YYMM>-<NN>`, and a range would be two different
              answers to "which period is this". */}
          <Input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </FieldWrapper>
        <ClaimFieldsForm
          project={project}
          general={general}
          value={fields}
          onChange={setFields}
          categories={categories}
        />
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[
            [project, t("field.project")],
            [period, t("field.period")],
            ...(general
              ? ([
                  [fields.category, t("field.category")],
                  [fields.description.trim(), t("field.description")],
                ] as [string, string][])
              : []),
            ...(chosen?.is_other ? ([[fields.otherName.trim(), t("field.otherName")]] as [string, string][]) : []),
          ]}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {t("openPeriod")}
        </Button>
      </footer>
    </Shell>
  );
}

function ClaimSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("claims");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [money, setMoney] = useState<"amount" | "voucher" | null>(null);
  const [editing, setEditing] = useState(false);

  const claim = useQuery({
    queryKey: ["claims", id],
    queryFn: () => getClaim(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["claims"] });
    queryClient.invalidateQueries({ queryKey: ["claim-candidates"] });
  };

  const remove = useMutation({
    mutationFn: (item: string) => removeClaimItem(id, item),
    onSuccess: refresh,
  });
  const discard = useMutation({
    mutationFn: () => deleteClaim(id),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const data = claim.data;

  return (
    <Shell title={data ? data.claim_no : t("open")} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {claim.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : claim.isLoadingError || !data ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {t("failed")}
          </p>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Summary label={t("field.project")} value={data.project_name} />
              <Summary label={t("field.kind")} value={t(`kind.${data.kind}`)} />
              {/* I10: its category and subcontractor. */}
              <Summary label={t("field.category")} value={data.category_name ?? t("filter.noCategory")} />
              <Summary label={t("field.subcontractor")} value={data.subcontractor_name ?? t("noSubcontractor")} />
              {data.kind === "GENERAL" && (
                <Summary label={t("field.description")} value={data.description || t("noRemarks")} />
              )}
              <Summary
                label={t("field.period")}
                value={formatter.date(data.period)}
              />
              <Summary
                label={t("column.state")}
                value={t(`state.${data.state}`)}
              />
              <Summary
                label={t("column.payment")}
                value={t(`payment.${data.payment_state}`)}
              />
              {/* HD17: 「Progress Claim 要补上金额和付款凭证」. */}
              <Summary
                label={t("field.amount")}
                value={data.amount ? `RM ${data.amount}` : t("noAmount")}
              />
              <Summary
                label={t("field.remarks")}
                value={data.remarks || t("noRemarks")}
              />
              {/* Where the bundle stands with the consultant. Read off the
                  package rather than tracked again here, so the two can never
                  disagree about whether it was sent (D-158). */}
              {data.state === "CONFIRMED" && (
                <Summary
                  label={t("reviewState")}
                  value={
                    data.package_review_state
                      ? t(`review.${data.package_review_state}`)
                      : t("review.NOT_SENT")
                  }
                />
              )}
              {data.payment_note && (
                <Summary
                  label={t("field.paymentNote")}
                  value={data.payment_note}
                />
              )}
            </div>

            {data.state === "CONFIRMED" && (
              /* Where the evidence went. A claim's bundle is reviewed on the
                 Multi Engine screen (D-158), so this says where to go rather
                 than drawing a second send control that would have to be
                 kept in step with that one. */
              <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                {t("packageHint")}
              </p>
            )}

            {data.state === "CONFIRMED" && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("vouchers")}</h3>
                <Vouchers proofs={data.payment_proofs ?? []} />
              </section>
            )}

            {data.state === "DRAFT" && can("claim.manage") && data.kind !== "GENERAL" && (
              <CandidatePicker claim={data} onChanged={refresh} />
            )}

            {/* 一般 Claim (ID50): its papers are uploaded on it; every claim
                keeps its files and its conversation (I10). */}
            <RecordAttachmentsPanel kind="CLAIM" recordId={data.id} />
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t("conversation")}</h3>
              <RecordConversationPanel kind="CLAIM" recordId={data.id} />
            </section>

            {data.kind !== "GENERAL" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t("onThisPeriod", { count: data.items.length })}
              </h3>
              {data.items.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
                  {t("nothingSelected")}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="min-w-[34rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("column.record")}</TableHead>
                        <TableHead>{t("column.itemState")}</TableHead>
                        {data.state === "DRAFT" && can("claim.manage") && (
                          <TableHead>{t("column.action")}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.source_missing ? (
                              <span className="text-muted-foreground">
                                {t("sourceMissing")}
                              </span>
                            ) : (
                              <>
                                <span className="font-medium">
                                  {item.record?.reference}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {item.record?.detail}
                                </span>
                              </>
                            )}
                            {item.state === "RETURNED" && (
                              /* The reason stays on the claim with the line.
                                 A returned record that only said "returned"
                                 would give the applicant nothing to act on. */
                              <span className="mt-1 block text-xs text-destructive">
                                {t("returnedBecause", {
                                  reason: item.returned_reason,
                                })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={t(`itemState.${item.state}`)}
                              tone={
                                item.state === "RETURNED"
                                  ? "danger"
                                  : item.state === "CLAIMED"
                                    ? "positive"
                                    : "neutral"
                              }
                            />
                          </TableCell>
                          {data.state === "DRAFT" && can("claim.manage") && (
                            <TableCell>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive"
                                title={t("takeOff")}
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(item.id)}
                              >
                                <Trash2 />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
            )}
          </div>
        )}
      </div>

      {data && (
        <footer className="flex flex-wrap justify-end gap-2 border-t p-4">
          {data.state === "DRAFT" && can("claim.manage") && (
            <>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={discard.isPending}
                onClick={() => discard.mutate()}
              >
                <Trash2 />
                {t("discard")}
              </Button>
              <Button
                disabled={data.kind !== "GENERAL" && data.items.length === 0}
                disabledReason={t("nothingSelected")}
                onClick={() => setConfirming(true)}
              >
                <CheckCheck />
                {t("confirmPeriod")}
              </Button>
            </>
          )}
          {/* The claim's own document. It is the package's PDF - there is
              only ever one file (D-158) - so this is the same download the
              Multi Engine screen offers, not a second copy of the merge.
              Gated on `package.view` because that is what the endpoint
              checks: head office may hold `claim.view` without it, and a
              button that answers 403 is worse than no button.
              预览 · 打印 · 导出 · 发送 as on every export (PDF 统一操作规则):
              only 导出 and 发送 count as the package having left (D-148). */}
          {data.state === "CONFIRMED" && data.package && can("package.view") && (
            <FileActionButtons
              source={{
                load: () => previewEvidencePackage(data.package as string, data.claim_no),
                loadToSend: () => evidencePackageFile(data.package as string, data.claim_no),
                title: data.claim_no,
              }}
            />
          )}
          {can("claim.manage") && data.payment_state !== "RECEIVED" && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                {t("editDetails")}
              </Button>
              <Button variant="outline" onClick={() => setMoney("amount")}>
                {t("setAmount")}
              </Button>
            </>
          )}
          {data.state === "CONFIRMED" && can("claim.confirm_payment") && (
            <>
              <Button variant="outline" onClick={() => setMoney("voucher")}>
                <FileUp />
                {t("addVoucher")}
              </Button>
              <Button variant="outline" onClick={() => setPaying(true)}>
                <Coins />
                {t("recordPayment")}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            {common("close")}
          </Button>
        </footer>
      )}

      {confirming && data && (
        <ConfirmClaimDialog
          claim={data}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            refresh();
          }}
        />
      )}
      {editing && data && (
        <EditClaimDialog
          claim={data}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {money === "amount" && data && (
        <AmountDialog
          claimId={data.id}
          current={data.amount ?? ""}
          onClose={() => setMoney(null)}
          onDone={() => {
            setMoney(null);
            refresh();
          }}
        />
      )}
      {money === "voucher" && data && (
        <VoucherDialog
          claimId={data.id}
          onClose={() => setMoney(null)}
          onDone={() => {
            setMoney(null);
            refresh();
          }}
        />
      )}
      {paying && data && (
        <PaymentDialog
          claim={data}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            refresh();
          }}
        />
      )}
    </Shell>
  );
}

interface ClaimFields {
  category: string;
  otherName: string;
  subcontractor: string;
  description: string;
  amount: string;
}

const EMPTY_FIELDS: ClaimFields = {
  category: "",
  otherName: "",
  subcontractor: "",
  description: "",
  amount: "",
};

/**
 * A claim's category, 「其他」's name, subcontractor and - for a 一般 Claim -
 * its description and amount (I10). The category picker has 「＋ 新增分类」
 * beside it for whoever keeps the categories, opened in place (I11).
 */
function ClaimFieldsForm({
  project,
  general,
  value,
  onChange,
  categories,
  withAmount = true,
}: {
  project: string;
  general: boolean;
  value: ClaimFields;
  onChange: (next: ClaimFields) => void;
  categories: ReturnType<typeof useClaimCategories>;
  withAmount?: boolean;
}) {
  const t = useTranslations("claims");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const subcontractors = useSubcontractors(term.trim());
  const rows = categories.data?.results ?? [];
  const chosen = rows.find((row) => row.id === value.category);
  const set = (patch: Partial<ClaimFields>) => onChange({ ...value, ...patch });
  return (
    <>
      <FieldWrapper
        label={t("field.category")}
        required={general}
        hint={general ? t("categoryHintGeneral") : t("categoryHint")}
      >
        <div className="flex gap-2">
          <Select
            value={value.category || NO_CATEGORY}
            onValueChange={(next) =>
              set({ category: next === NO_CATEGORY ? "" : next, otherName: "" })
            }
            disabled={!project}
          >
            <SelectTrigger className="min-w-0 flex-1" aria-label={t("field.category")}>
              <SelectValue placeholder={t("filter.noCategory")} />
            </SelectTrigger>
            <SelectContent>
              {!general && <SelectItem value={NO_CATEGORY}>{t("filter.noCategory")}</SelectItem>}
              <CategoryOptionItems rows={rows} />
            </SelectContent>
          </Select>
          {can("category.manage") && (
            <Button
              type="button"
              variant="outline"
              requires={[[project, t("field.project")]]}
              onClick={() => setAdding(true)}
            >
              <Plus />
              {t("addCategory")}
            </Button>
          )}
        </div>
        <QueryFailedNote query={categories} what={t("what.categories")} />
      </FieldWrapper>
      {chosen?.is_other && (
        <FieldWrapper label={t("field.otherName")} required hint={t("otherNameHint")}>
          <Input value={value.otherName} onChange={(event) => set({ otherName: event.target.value })} />
        </FieldWrapper>
      )}
      <FieldWrapper label={t("field.subcontractor")} hint={t("subcontractorHint")}>
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("subcontractorSearch")}
        />
        <Select
          value={value.subcontractor || NO_CATEGORY}
          onValueChange={(next) => set({ subcontractor: next === NO_CATEGORY ? "" : next })}
        >
          <SelectTrigger className="mt-2 w-full" aria-label={t("field.subcontractor")}>
            <SelectValue placeholder={t("noSubcontractor")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>{t("noSubcontractor")}</SelectItem>
            {(subcontractors.data?.results ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QueryFailedNote query={subcontractors} what={t("what.subcontractors")} />
        {/* 「名单里没有可以顺手新增」 (ID7): marked subcontractor at once. */}
        <QuickAddSupplierButton
          defaults={{ company_types: ["SUBCONTRACTOR"] }}
          onCreated={(supplier) => {
            void queryClient.invalidateQueries({ queryKey: ["claims", "subcontractors"] });
            set({ subcontractor: supplier.id });
          }}
        />
      </FieldWrapper>
      {general && (
        <>
          <FieldWrapper label={t("field.description")} required hint={t("descriptionHint")}>
            <Textarea
              rows={3}
              value={value.description}
              onChange={(event) => set({ description: event.target.value })}
            />
          </FieldWrapper>
          {withAmount && (
            <FieldWrapper label={t("field.amount")} hint={t("amountOptional")}>
              <Input
                inputMode="decimal"
                value={value.amount}
                onChange={(event) => set({ amount: event.target.value })}
              />
            </FieldWrapper>
          )}
        </>
      )}
      {adding && (
        <CategoryDialog
          project={project}
          defaultKind="CLAIM"
          row={null}
          nextSortOrder={rows.length}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
          }}
        />
      )}
    </>
  );
}

/** Change a claim's category, subcontractor and description (I10). */
function EditClaimDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: ClaimDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("claims");
  const common = useTranslations("common");
  const general = claim.kind === "GENERAL";
  const [fields, setFields] = useState<ClaimFields>({
    category: claim.category ?? "",
    otherName: claim.other_name ?? "",
    subcontractor: claim.subcontractor ?? "",
    description: claim.description ?? "",
    amount: "",
  });
  const categories = useClaimCategories(claim.project, { offered: true });
  const rows = categories.data?.results ?? [];
  const chosen = rows.find((row) => row.id === fields.category);
  const save = useMutation({
    mutationFn: () =>
      updateClaim(claim.id, {
        category: fields.category || null,
        other_name: fields.otherName.trim(),
        subcontractor: fields.subcontractor || null,
        ...(general ? { description: fields.description.trim() } : {}),
      }),
    onSuccess: onDone,
  });
  return (
    <Shell title={t("editDetails")} onClose={onClose}>
      <div className="space-y-4 p-4">
        <ClaimFieldsForm
          project={claim.project}
          general={general}
          value={fields}
          onChange={setFields}
          categories={categories}
          withAmount={false}
        />
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[
            ...(general
              ? ([
                  [fields.category, t("field.category")],
                  [fields.description.trim(), t("field.description")],
                ] as [string, string][])
              : []),
            ...(chosen?.is_other ? ([[fields.otherName.trim(), t("field.otherName")]] as [string, string][]) : []),
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {common("save")}
        </Button>
      </footer>
    </Shell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium break-words">{value}</p>
    </div>
  );
}

/**
 * The four counts, and the records behind them (D-134).
 *
 * 已查看 comes from the archive queue's own per-person marks, so a record can
 * be ticked without having been read and read without being ticked - which is
 * why both numbers are shown rather than one derived from the other.
 */
function CandidatePicker({
  claim,
  onChanged,
}: {
  claim: ClaimDetail;
  onChanged: () => void;
}) {
  const t = useTranslations("claims");
  const formatter = useDateFormat();
  const [chosen, setChosen] = useState<string[]>([]);

  const candidates = useQuery({
    queryKey: ["claim-candidates", claim.project, claim.kind, claim.id],
    queryFn: () =>
      getClaimCandidates({
        project: claim.project,
        kind: claim.kind,
        claim: claim.id,
      }),
  });

  const [refused, setRefused] = useState(0);
  const select = useMutation({
    mutationFn: () => selectClaimItems(claim.id, chosen),
    onSuccess: (row) => {
      // Said on the screen and not only in a toast that disappears: a record
      // that would not go on is the one thing the person has to act on.
      setRefused(row.refused?.length ?? 0);
      setChosen([]);
      onChanged();
      void candidates.refetch();
    },
  });

  const counts = candidates.data?.counts;
  const rows = (candidates.data?.results ?? []).filter((row) => !row.selected);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("candidates")}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label={t("count.eligible")} value={counts?.eligible} />
        <Count label={t("count.seen")} value={counts?.seen} />
        <Count label={t("count.unseen")} value={counts?.unseen} />
        <Count label={t("count.selected")} value={counts?.selected} />
      </div>

      {candidates.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : candidates.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("candidatesFailed")}
        </p>
      ) : rows.length === 0 ? (
        /* An empty list is a legal answer, not a symptom: this site may have
           nothing claimable left this month (T-237's fourth finding). */
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
          {t("noCandidates")}
        </p>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table className="min-w-[32rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>{t("column.record")}</TableHead>
                  <TableHead>{t("column.when")}</TableHead>
                  <TableHead>{t("column.read")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox
                        checked={chosen.includes(row.id)}
                        aria-label={row.reference}
                        onCheckedChange={(next) =>
                          setChosen((current) =>
                            next
                              ? [...new Set([...current, row.id])]
                              : current.filter((value) => value !== row.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{row.reference}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.detail}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatter.dateTime(row.submitted_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.seen ? t("read") : t("unread")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {refused > 0 && (
            <p role="alert" className="text-xs text-destructive">
              {t("someRefused", { count: refused })}
            </p>
          )}
          <Button
            size="sm"
            disabled={chosen.length === 0 || select.isPending}
            disabledReason={t("chooseSomething")}
            onClick={() => select.mutate()}
          >
            {t("putOnPeriod", { count: chosen.length })}
          </Button>
        </>
      )}
    </section>
  );
}

function Count({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {/* A dash until the counts arrive, and if they never do: a failed
          request must not read as zero records. */}
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value ?? "—"}</p>
    </div>
  );
}

function ConfirmClaimDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: ClaimDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("claims");
  const common = useTranslations("common");
  const [remarks, setRemarks] = useState(claim.remarks);
  const [includePhotos, setIncludePhotos] = useState(true);

  const confirm = useMutation({
    mutationFn: () => confirmClaim(claim.id, remarks, includePhotos),
    onSuccess: onDone,
  });

  return (
    <Shell title={t("confirmTitle")} onClose={onClose}>
      <div className="space-y-4 p-4">
        <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {claim.kind === "GENERAL"
            ? t("confirmBodyGeneral")
            : t("confirmBody", { count: claim.items.length })}
        </p>
        <FieldWrapper label={t("field.remarks")} required hint={t("remarksHelp")}>
          <Textarea
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </FieldWrapper>
        {/* 客户红笔：「进入 PDF 后可以选择…（不需要照片）只有必要和 DO」. The
            delivery orders are never offered as a choice - they are what the
            claim is made of. */}
        {claim.kind !== "GENERAL" && (
        <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <Checkbox
            checked={includePhotos}
            onCheckedChange={(next) => setIncludePhotos(next === true)}
          />
          <span>
            {t("includePhotos")}
            <span className="block text-xs text-muted-foreground">
              {t("includePhotosHelp")}
            </span>
          </span>
        </label>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[[remarks.trim(), t("field.remarks")]]}
          disabled={confirm.isPending}
          onClick={() => confirm.mutate()}
        >
          <CheckCheck />
          {t("confirmPeriod")}
        </Button>
      </footer>
    </Shell>
  );
}

export function PaymentDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: Pick<ClaimDetail, "id" | "payment_state" | "payment_note">;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("claims");
  const common = useTranslations("common");
  const [state, setState] = useState<ClaimPaymentState>(claim.payment_state);
  const [note, setNote] = useState(claim.payment_note);

  const save = useMutation({
    mutationFn: () =>
      setClaimPayment(claim.id, {
        payment_state: state,
        payment_note: note,
      }),
    onSuccess: onDone,
  });

  return (
    <Shell title={t("paymentTitle")} onClose={onClose}>
      <div className="space-y-4 p-4">
        <FieldWrapper label={t("column.payment")} required>
          <Select
            value={state}
            onValueChange={(next) => setState(next as ClaimPaymentState)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`payment.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        {/* "Partly" is not a number: without this the row says money came
            and nothing about how much, which reads as settled. */}
        <FieldWrapper label={t("field.paymentNote")} required={state === "PARTIAL"} hint={t("paymentNoteHelp")}>
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FieldWrapper>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={
            state === "PARTIAL" ? [[note.trim(), t("field.paymentNote")]] : []
          }
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {common("save")}
        </Button>
      </footer>
    </Shell>
  );
}
