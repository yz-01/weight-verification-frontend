"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Coins, Download, FolderOpen, Inbox, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FileIntoColumnDialog } from "@/components/contractor-ops/file-into-column";
import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
import { Shell } from "@/components/contractor-ops/package-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
  downloadEvidencePackage,
  fileClaim,
  getClaim,
  getClaimCandidates,
  getClaims,
  getProjectCategories,
  removeClaimItem,
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
 * ## Filed under a CLAIM column
 *
 * A claim is opened here and filed afterwards under one of the project's
 * CLAIM columns - 「Claim 由后台放」 (D-275). Both kinds share the one column
 * list, as they share everything else; the list filters by it, with 未归类
 * for the ones nobody has filed yet.
 */

const KINDS: ClaimKind[] = ["MATERIAL_ON_SITE", "PROGRESS"];
const PAYMENT_STATES: ClaimPaymentState[] = [
  "NOT_RECEIVED",
  "PARTIAL",
  "RECEIVED",
];
const PAGE_SIZE = 20;
/** Select sentinels: Radix has no value for "nothing chosen". */
const ALL_COLUMNS = "__all__";
const UNFILED = "__unfiled__";

/** `YYYY-MM` for today, which is what a claim's period is (D-164). */
function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ClaimEngineWorkspace() {
  const t = useTranslations("claims");
  const ops = useTranslations("contractorOps");
  const formatter = useDateFormat();
  const { can } = useAuth();
  const [project, setProject] = useState("");
  const [kind, setKind] = useState<ClaimKind | "">("");
  /** A CLAIM column id, UNFILED, or ALL_COLUMNS. */
  const [column, setColumn] = useState(ALL_COLUMNS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ["claims", project, kind, column, search, page],
    queryFn: () =>
      getClaims({
        project: project || undefined,
        kind: kind || undefined,
        category:
          column === ALL_COLUMNS || column === UNFILED ? undefined : column,
        uncategorised: column === UNFILED ? "true" : undefined,
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
  });

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          can("claim.manage") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ProjectFilter
          value={project}
          onChange={(next) => {
            setProject(next);
            // A column belongs to one site; keeping it would filter the new
            // site by a column it does not have.
            setColumn(ALL_COLUMNS);
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
        <ClaimColumnFilter
          project={project}
          value={column}
          onChange={(next) => {
            setColumn(next);
            setPage(1);
          }}
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full sm:w-72"
        />
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          <Inbox className="size-4" />
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.claimNo")}</TableHead>
                <TableHead>{t("column.kind")}</TableHead>
                <TableHead>{t("column.period")}</TableHead>
                <TableHead>{t("column.items")}</TableHead>
                <TableHead>{t("column.state")}</TableHead>
                <TableHead>{t("column.payment")}</TableHead>
                <TableHead>{ops("filing.fileInto")}</TableHead>
                <TableHead>{t("column.action")}</TableHead>
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
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatter.date(row.period)}
                  </TableCell>
                  <TableCell className="tabular-nums">
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
                  <TableCell
                    className={row.category_name ? "" : "text-muted-foreground"}
                  >
                    {row.category_name || ops("filing.unfiled")}
                  </TableCell>
                  <TableCell>
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
        <div className="flex items-center justify-between text-sm">
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

  const create = useMutation({
    mutationFn: () => createClaim({ project, kind, period }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      onCreated(row);
    },
  });

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
      </div>
      <footer className="flex justify-end gap-2 border-t p-4">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[
            [project, t("field.project")],
            [period, t("field.period")],
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
  const ops = useTranslations("contractorOps");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [filing, setFiling] = useState(false);

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
        ) : claim.isError || !data ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {t("failed")}
          </p>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Summary label={t("field.project")} value={data.project_name} />
              <Summary label={t("field.kind")} value={t(`kind.${data.kind}`)} />
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
              {/* Where the office filed it, or 未归类 (D-275). */}
              <Summary
                label={ops("filing.fileInto")}
                value={data.category_name || ops("filing.unfiled")}
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

            {data.state === "DRAFT" && can("claim.manage") && (
              <CandidatePicker claim={data} onChanged={refresh} />
            )}

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
                disabled={data.items.length === 0}
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
              button that answers 403 is worse than no button. */}
          {data.state === "CONFIRMED" && data.package && can("package.view") && (
            <Button
              variant="outline"
              onClick={() =>
                downloadEvidencePackage(data.package as string, data.claim_no)
              }
            >
              <Download />
              {t("downloadPdf")}
            </Button>
          )}
          {/* Filing is the office's step, at either round: the server checks
              the same permission (D-275). */}
          {can("claim.manage") && (
            <Button variant="outline" onClick={() => setFiling(true)}>
              <FolderOpen />
              {ops("filing.title")}
            </Button>
          )}
          {data.state === "CONFIRMED" && can("claim.confirm_payment") && (
            <Button variant="outline" onClick={() => setPaying(true)}>
              <Coins />
              {t("recordPayment")}
            </Button>
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
      {filing && data && (
        <FileIntoColumnDialog
          projectId={data.project}
          kind="CLAIM"
          current={data.category ?? null}
          reference={data.claim_no}
          onFile={(category, reason) => fileClaim(data.id, { category, reason })}
          onFiled={() => {
            refresh();
            void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
            void queryClient.invalidateQueries({ queryKey: ["category-management"] });
          }}
          onClose={() => setFiling(false)}
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

/**
 * The CLAIM columns, plus 未归类 - the same choice every module list offers
 * (`ColumnFilter`), kept on this screen's own state because this list does
 * not use the shared list query. Only CLAIM columns: another module's would
 * be options that always return nothing.
 */
function ClaimColumnFilter({
  project,
  value,
  onChange,
}: {
  project: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const table = useTranslations("moduleTable");
  const columns = useQuery({
    queryKey: ["project-categories", "module-columns", "CLAIM", project],
    queryFn: () =>
      getProjectCategories({
        page_size: 200,
        kind: "CLAIM",
        ...(project ? { project } : {}),
      }),
  });
  return (
    <>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full sm:w-56" aria-label={table("allColumns")}>
          <SelectValue placeholder={table("allColumns")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_COLUMNS}>{table("allColumns")}</SelectItem>
          <SelectItem value={UNFILED}>{table("unfiled")}</SelectItem>
          {(columns.data?.results ?? []).map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QueryFailedNote query={columns} what={table("what.columns")} />
    </>
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
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
          {t("confirmBody", { count: claim.items.length })}
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
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
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
      </div>
      <footer className="flex justify-end gap-2 border-t p-4">
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

function PaymentDialog({
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
      <footer className="flex justify-end gap-2 border-t p-4">
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
