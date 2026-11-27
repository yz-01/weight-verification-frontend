"use client";

/**
 * 设备租赁月结单 (JB280, 客户 11-26 事项 21): its own page under 设备管理.
 *
 * The client: 「1. 支持按项目、设备公司、开始日期及结束日期，自动生成设备租赁月结单。
 * 2. 设置「核对与结算」按钮，区分待核对、已核对、已结算三个状态。3. 已核对及已结算的
 * 单据，自动移出待处理列表，归入核对与结算管理页面。4. 核对及结算时，必须填写凭证编号、
 * 上传相关凭证，并记录操作人、日期及时间。5. 月结单与设备原始记录、核对编号及结算编号
 * 实现双向关联。6. 所有历史月结单支持按设备公司、项目及日期查询，并支持A4预览、PDF导出、
 * 打印及发送。7. 防止同一笔设备费用重复结算，已结算的金额及原始证据不得修改。这里只记录
 * 核对及结算结果，不涉及实际付款及财务操作。」
 *
 * The page: 「待核对｜已核对｜已结算｜全部月结单」 (each statement in one of the
 * first three), the 设备公司 / 项目 / dates filters, 【生成月结单】 and
 * 【核对与结算】 (the 材料领用 dialog, kind `RENTAL`). A statement opens in
 * `RentalStatementWindow`: its machines (each opens that machine's 按月 page),
 * the five amounts and their 合计, the 核对 / 结算 numbers (each opens its
 * window), the four file buttons on the A4 PDF, and 【作废】 while 待核对.
 *
 * JB288 (客户 11-27b): 【租赁费用设定】 beside 【生成月结单】 - the 设备租赁设定
 * window of 设备操作员工时 (`RentalTermsDialog`), for the top bar's project.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Eye, FileSpreadsheet, Loader2, Receipt } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  officeMay,
  ReconcileSettleButton,
  ReturnCheckWindow,
  SettlementWindow,
} from "@/components/contractor-ops/return-checks";
import { RentalTermsDialog, displayPieces, rentalMoney } from "@/components/equipment-hours/rental-fees";
import { useAuth } from "@/components/providers/auth-provider";
import { useSeesAmounts } from "@/hooks/use-sees-amounts";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { DataTable } from "@/components/shared/data-table";
import { FileActionButtons } from "@/components/shared/file-actions";
import { PlainHeader, ProjectListFilter } from "@/components/shared/module-records-table";
import { FieldWrapper, ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordWindowFailure } from "@/components/shared/record-window-failure";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import {
  cancelRentalStatement,
  createRentalStatement,
  getRentalStatement,
  getRentalStatementCompanies,
  getRentalStatements,
  previewRentalStatement,
  rentalStatementPdfFile,
  type RentalAmounts,
  type RentalStatementChoices,
  type RentalStatementLine,
  type RentalStatementPreview,
  type RentalStatementRow,
  type RentalStatementState,
} from "@/services/rental-statement.service";

/** Who works on the rental pages (JB255): the people who set rental terms. */
export const RENTAL_PERMISSION = "equipment.manage";
export const STATEMENT_KEYS = ["base_rent", "overtime_fee", "diesel_fee", "adjustment_amount", "rental_total"] as const;

/** 「待核对｜已核对｜已结算｜全部月结单」, kept in the address as `?tab=…`. */
export type StatementTab = "pending" | "checked" | "settled" | "all";

export function statementTabOf(value: string | null): StatementTab {
  return value === "checked" || value === "settled" || value === "all" ? value : "pending";
}

const TAB_STATE: Record<StatementTab, RentalStatementState | ""> = {
  pending: "PENDING",
  checked: "CHECKED",
  settled: "SETTLED",
  all: "",
};

const STATE_TONE: Record<RentalStatementState, "warning" | "info" | "positive" | "neutral"> = {
  PENDING: "warning",
  CHECKED: "info",
  SETTLED: "positive",
  CANCELLED: "neutral",
};

/** The 按月 page of one machine and month: the statement's 设备原始记录 (第 5 点). */
export function monthHref(project: string, equipment: string, month: string): string {
  const query = new URLSearchParams({ view: "month", month, equipment, project });
  return `/equipment-operator-hours?${query.toString()}`;
}

export function RentalStatementsPage() {
  const tr = useTranslations("jb280");
  const df = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const list = useListQuery(["project", "supplier", "date_from", "date_to"]);
  const tab = statementTabOf(searchParams.get("tab"));
  const switchTab = (next: StatementTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (next === "pending") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [viewing, setViewing] = useUrlSelection("statement");
  const state = TAB_STATE[tab];
  const query = { ...list.query, ...(state ? { state } : {}) };
  // QA288: the server refuses statements without 设备管理 or without 「金额查看」
  // (they are all amounts); say which right is missing and who switches it on,
  // instead of a list that 「加载失败」.
  const { can, user } = useAuth();
  const seesAmounts = useSeesAmounts();
  const refused = !officeMay(user, can, RENTAL_PERMISSION) ? "statementsNoManage" : !seesAmounts ? "statementsNoAmounts" : null;
  const tj = useTranslations("jb288");
  const rows = useQuery({
    queryKey: ["rental-statements", "list", query],
    queryFn: () => getRentalStatements(query),
    enabled: !refused,
  });
  // query-failure: without the list of companies the filter shows only 「全部设备公司」; the table still loads.
  const companies = useQuery({
    queryKey: ["rental-statements", "companies", list.filters.project ?? ""],
    queryFn: () => getRentalStatementCompanies(list.filters.project || undefined),
    enabled: !refused,
  });
  const total = rows.data?.count ?? 0;
  const columns = useMemo<ColumnDef<RentalStatementRow, unknown>[]>(
    () => [
      {
        accessorKey: "statement_no",
        meta: { label: tr("col.statementNo") },
        header: () => <PlainHeader label={tr("col.statementNo")} />,
        cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.statement_no}</span>,
      },
      { accessorKey: "project_name", meta: { label: tr("col.project") }, header: () => <PlainHeader label={tr("col.project")} /> },
      { accessorKey: "supplier_name", meta: { label: tr("col.company") }, header: () => <PlainHeader label={tr("col.company")} /> },
      {
        accessorKey: "date_from",
        meta: { label: tr("col.period") },
        header: () => <PlainHeader label={tr("col.period")} />,
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">
            {df.date(row.original.date_from)} – {df.date(row.original.date_to)}
          </span>
        ),
      },
      {
        accessorKey: "machine_count",
        meta: { label: tr("col.machines") },
        header: () => <PlainHeader label={tr("col.machines")} />,
        cell: ({ row }) => <span className="tabular">{tr("machinesValue", { count: row.original.machine_count })}</span>,
      },
      {
        accessorKey: "rental_total",
        meta: { label: tr("col.total") },
        header: () => <PlainHeader label={tr("col.total")} />,
        cell: ({ row }) => <span className="tabular font-semibold">{rentalMoney(row.original.rental_total)}</span>,
      },
      {
        accessorKey: "state",
        meta: { label: tr("col.state") },
        header: () => <PlainHeader label={tr("col.state")} />,
        cell: ({ row }) => (
          <StatusBadge label={tr(`state.${row.original.state}`)} tone={STATE_TONE[row.original.state]} />
        ),
      },
      {
        accessorKey: "check_no",
        meta: { label: tr("col.checkNo") },
        header: () => <PlainHeader label={tr("col.checkNo")} />,
        cell: ({ row }) => <span>{row.original.check_no || "—"}</span>,
      },
      {
        accessorKey: "settlement_no",
        meta: { label: tr("col.settlementNo") },
        header: () => <PlainHeader label={tr("col.settlementNo")} />,
        cell: ({ row }) => <span>{row.original.settlement_no || "—"}</span>,
      },
      {
        id: "view",
        enableHiding: false,
        meta: { label: tr("col.view") },
        header: () => <PlainHeader label={tr("col.view")} />,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              setViewing(row.original.id);
            }}
          >
            <Eye className="size-3.5" />
            {tr("view")}
          </Button>
        ),
      },
    ],
    [tr, df, setViewing],
  );
  const refresh = () => void qc.invalidateQueries({ queryKey: ["rental-statements"] });
  if (refused) {
    return (
      <div className="flex flex-col gap-4" data-slot="rental-statements">
        {/* Without 「金额查看」 the 租赁费用设定 window still lists the terms (no prices). */}
        <ListHeader title={tr("title")} subtitle="" action={refused === "statementsNoAmounts" ? <RentalTermsButton /> : undefined} />
        <p role="status" className="rounded-lg border bg-muted/30 px-4 py-3 text-sm" data-slot="rental-statements-refused">
          {tj(refused)}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 max-sm:[&>*]:shrink-0 sm:h-[calc(100dvh-5rem)]" data-slot="rental-statements">
      <ListHeader
        title={tr("title")}
        subtitle={rows.isLoading ? "—" : tr("count", { count: total })}
        action={
          <div className="flex flex-wrap gap-2">
            <RentalTermsButton />
            <GenerateStatementButton
              onSaved={(statement) => {
                refresh();
                setViewing(statement);
              }}
            />
            <ReconcileSettleButton
              kind="RENTAL"
              step={tab === "checked" ? "settle" : "check"}
              permission={RENTAL_PERMISSION}
              onChecked={() => {
                refresh();
                switchTab("checked");
              }}
              onSettled={() => {
                refresh();
                switchTab("settled");
              }}
            />
          </div>
        }
      />
      <div className="flex flex-col gap-2">
        <div
          role="tablist"
          aria-label={tr("tabsLabel")}
          className="inline-flex self-start rounded-lg border bg-muted/40 p-1"
          data-testid="rental-statement-tabs"
        >
          {(["pending", "checked", "settled", "all"] as const).map((each) => (
            <Button
              key={each}
              role="tab"
              aria-selected={tab === each}
              variant={tab === each ? "default" : "ghost"}
              className="h-10 px-5 text-base"
              data-slot={`statement-tab-${each}`}
              onClick={() => switchTab(each)}
            >
              {tr(`tab.${each}`)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{tr("resultOnly")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <ProjectListFilter list={list} />
          <Select
            value={list.filters.supplier ?? "__all"}
            onValueChange={(value) => list.setFilter("supplier", value === "__all" ? undefined : value)}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label={tr("allCompanies")}>
              <SelectValue placeholder={tr("allCompanies")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{tr("allCompanies")}</SelectItem>
              {(companies.data?.suppliers ?? []).map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-full sm:w-40"
            aria-label={tr("dateFrom")}
            title={tr("dateFrom")}
            value={list.filters.date_from ?? ""}
            onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
          />
          <Input
            type="date"
            className="w-full sm:w-40"
            aria-label={tr("dateTo")}
            title={tr("dateTo")}
            value={list.filters.date_to ?? ""}
            onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
          />
        </div>
      </div>
      {rows.isError ? <QueryFailedNote query={rows} what={tr("what")} /> : null}
      <DataTable
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={rows.isLoading}
        isError={rows.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="rental-statements.v1"
        onRowClick={(row) => setViewing(row.id)}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
      {viewing ? <RentalStatementWindow id={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

/**
 * 【生成月结单】 (第 1 点): 项目, 设备公司, 开始日期, 结束日期 → 【先看一下】 shows
 * what would be kept (or the server's reason: a month not confirmed yet, a
 * machine with no terms, dates another statement already covers) →
 * 【生成月结单】, PIN.
 */
/**
 * 【租赁费用设定】 (JB288): 「在「设备租赁月结单」页面右上方「生成月结单」旁边设置
 * 一个「租赁费用设定」按钮。由建筑商后台根据设备及供应商填写合同约定的租赁条件及
 * 费用，只需设定一次」. Office only, like 【生成月结单】; the server asks for the PIN
 * and refuses a phone account. On 全部项目 the window asks for a project first.
 */
export function RentalTermsButton() {
  const tj = useTranslations("jb288");
  const { can, user } = useAuth();
  const current = useCurrentProject();
  const [open, setOpen] = useState(false);
  if (!officeMay(user, can, RENTAL_PERMISSION)) return null;
  return (
    <>
      <Button variant="outline" data-slot="rental-terms-button" onClick={() => setOpen(true)}>
        <Receipt />
        {tj("termsButton")}
      </Button>
      {open ? (
        <RentalTermsDialog
          project={current.active ? current.projectId : ""}
          title={tj("termsButton")}
          pickProject
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function GenerateStatementButton({ onSaved }: { onSaved: (id: string) => void }) {
  const tr = useTranslations("jb280");
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!officeMay(user, can, RENTAL_PERMISSION)) return null;
  return (
    <>
      <Button variant="outline" data-slot="generate-statement-button" onClick={() => setOpen(true)}>
        <FileSpreadsheet />
        {tr("generate")}
      </Button>
      {open ? (
        <GenerateStatementDialog
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false);
            onSaved(id);
          }}
        />
      ) : null}
    </>
  );
}

function GenerateStatementDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const tr = useTranslations("jb280");
  const current = useCurrentProject();
  const [project, setProject] = useState(current.active ? current.projectId : "");
  const [supplier, setSupplier] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const companies = useQuery({
    queryKey: ["rental-statements", "companies", project],
    queryFn: () => getRentalStatementCompanies(project || undefined),
    enabled: Boolean(project),
  });
  const choices: RentalStatementChoices = { project, supplier, date_from: dateFrom, date_to: dateTo };
  const ready = Boolean(project && supplier && dateFrom && dateTo);
  const preview = useMutation({ mutationFn: () => previewRentalStatement(choices) });
  const save = useMutation({
    mutationFn: () => createRentalStatement(choices),
    onSuccess: (statement) => onSaved(statement.id),
  });
  const shown: RentalStatementPreview | undefined =
    preview.data &&
    preview.data.project === project &&
    preview.data.supplier === supplier &&
    preview.data.date_from === dateFrom &&
    preview.data.date_to === dateTo
      ? preview.data
      : undefined;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="generate-statement-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{tr("generate")}</DialogTitle>
          <DialogDescription>{tr("generateHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <FieldWrapper label={tr("col.project")} required>
            <ProjectPicker value={project} placeholder={tr("chooseProject")} onValueChange={(next) => setProject(next)} />
          </FieldWrapper>
          <FieldWrapper label={tr("col.company")} required>
            <Select value={supplier || undefined} onValueChange={setSupplier} disabled={!project}>
              <SelectTrigger aria-label={tr("col.company")}>
                <SelectValue placeholder={tr("chooseCompany")} />
              </SelectTrigger>
              <SelectContent>
                {(companies.data?.suppliers ?? []).map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Without the list there is nothing to choose: say the list failed, not that there is none. */}
            {companies.isError ? <QueryFailedNote query={companies} what={tr("col.company")} /> : null}
          </FieldWrapper>
          <FieldWrapper label={tr("dateFrom")} required>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={tr("dateTo")} required>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </FieldWrapper>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            data-slot="preview-statement-button"
            requires={[
              [project, tr("col.project")],
              [supplier, tr("col.company")],
              [dateFrom, tr("dateFrom")],
              [dateTo, tr("dateTo")],
            ]}
            disabled={preview.isPending}
            onClick={() => preview.mutate()}
          >
            {preview.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
            {tr("preview")}
          </Button>
        </div>
        {shown ? (
          <section className="space-y-3" data-slot="statement-preview">
            <StatementLines lines={shown.lines} totals={shown} project={shown.project} />
            {shown.will_confirm?.length ? (
              // 「自动生成」: the months not confirmed yet are confirmed with this statement.
              <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm" data-slot="statement-will-confirm">
                <p>{tr("willConfirm")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {shown.will_confirm.map((item) => (
                    <li key={`${item.equipment}-${item.month}`}>
                      {tr("willConfirmItem", {
                        equipment: [item.equipment_no, item.equipment_name].filter(Boolean).join(" "),
                        month: item.month,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {shown.overlap ? (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm" data-slot="statement-overlap">
                {tr("overlap", { number: shown.overlap })}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{tr("generatePin")}</p>
            <div className="flex justify-end">
              <Button
                size="lg"
                data-slot="create-statement-button"
                requires={[
                  [project, tr("col.project")],
                  [supplier, tr("col.company")],
                  [dateFrom, tr("dateFrom")],
                  [dateTo, tr("dateTo")],
                ]}
                // Overlapping dates are no field to fill: the button stays off and says why.
                disabled={save.isPending || Boolean(shown.overlap)}
                disabledReason={shown.overlap ? tr("overlapShort") : undefined}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                {tr("generate")}
              </Button>
            </div>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The machines of a statement (第 5 点 「月结单与设备原始记录…双向关联」): each
 * line opens that machine's 按月 page for each of its months; the 合计 at the
 * foot is the 设备租赁费用报表's 累计总金额 for the same choices.
 */
export function StatementLines({
  lines,
  totals,
  project,
}: {
  lines: readonly RentalStatementLine[];
  totals: RentalAmounts;
  project: string;
}) {
  const tr = useTranslations("jb280");
  const tFee = useTranslations("equipmentRental");
  const tj = useTranslations("jb288");
  return (
    <div className="overflow-x-auto rounded-lg border" data-slot="statement-lines">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tr("line.equipment")}</TableHead>
            <TableHead>{tr("line.terms")}</TableHead>
            <TableHead className="text-right">{tr("line.daysWorked")}</TableHead>
            <TableHead className="text-right">{tr("line.normalHours")}</TableHead>
            <TableHead className="text-right">{tr("line.overtimeHours")}</TableHead>
            {STATEMENT_KEYS.map((key) => (
              <TableHead key={key} className="text-right">
                {tFee(`fee.${key}`)}
              </TableHead>
            ))}
            <TableHead>{tr("line.records")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.equipment} data-slot="statement-line">
              <TableCell className="font-medium">
                {[line.equipment_no, line.equipment_name].filter(Boolean).join(" · ")}
              </TableCell>
              <TableCell>
                {line.terms.method ? (
                  displayPieces(line.terms.pieces).length > 1 ? (
                    // JB288: the price changed in these dates - each set with its days
                    // (JB294: periods whose terms price a day the same are one).
                    displayPieces(line.terms.pieces).map((piece) => (
                      <span key={piece.from} className="block text-xs" style={{ whiteSpace: "nowrap" }} data-slot="statement-line-piece">
                        {tj("piece", {
                          from: piece.from,
                          to: piece.to,
                          terms: `${tFee(`method.${piece.terms.method}` as never)} RM ${rentalMoney(piece.terms.unit_price)}`,
                        })}
                      </span>
                    ))
                  ) : (
                    `${tFee(`method.${line.terms.method}` as never)} RM ${rentalMoney(line.terms.unit_price)}`
                  )
                ) : (
                  tFee("noTermsShort")
                )}
              </TableCell>
              <TableCell className="tabular text-right">{line.days_worked}</TableCell>
              <TableCell className="tabular text-right">{line.normal_hours}</TableCell>
              <TableCell className="tabular text-right">{line.overtime_hours}</TableCell>
              {STATEMENT_KEYS.map((key) => (
                <TableCell key={key} className="tabular text-right">
                  {rentalMoney(line[key])}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap">
                {line.months.map((month) => (
                  <Link
                    key={month.month}
                    href={monthHref(project, line.equipment, month.month)}
                    className="mr-2 text-primary underline-offset-2 hover:underline"
                    data-slot="statement-line-month"
                  >
                    {tr("openMonth", { month: month.month })}
                  </Link>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="font-semibold">
              {tr("line.total")}
            </TableCell>
            {STATEMENT_KEYS.map((key) => (
              <TableCell key={key} className="tabular text-right font-semibold" data-slot={`statement-total-${key}`}>
                {rentalMoney(totals[key])}
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/**
 * One statement (第 5、6 点): 月结单编号, 项目, 设备公司, 日期, 生成人; its
 * machines and 合计; 核对编号 and 结算编号 (each opens its window) with their
 * 凭证编号; 预览 · 打印 · 导出 · 发送 of the A4 PDF; 【作废】 while 待核对.
 */
export function RentalStatementWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const tr = useTranslations("jb280");
  const tj = useTranslations("jb278");
  const locale = useLocale();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const statement = useQuery({ queryKey: ["rental-statements", "detail", id], queryFn: () => getRentalStatement(id) });
  const data = statement.data;
  const [open, setOpen] = useState<"check" | "settlement" | "cancel" | null>(null);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="rental-statement-window" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{data ? tr("windowTitle", { number: data.statement_no }) : tr("title")}</DialogTitle>
          <DialogDescription>
            {data ? `${data.project_name} · ${data.supplier_name}` : tr("resultOnly")}
          </DialogDescription>
        </DialogHeader>
        {statement.isError ? <RecordWindowFailure query={statement} what={tr("what")} /> : null}
        {statement.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : null}
        {data ? (
          <div className="space-y-5">
            {/* 「支持A4预览、PDF导出、打印及发送」 - the PIN for all but 预览 (JB27). */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <FileActionButtons
                label={tr("pdf")}
                source={{
                  load: () => rentalStatementPdfFile(data.id, locale, data.statement_no),
                  title: tr("windowTitle", { number: data.statement_no }),
                  exportedOnServer: true,
                  recordKind: "EQUIPMENT_RENTAL_STATEMENT",
                  recordId: data.id,
                  project: data.project,
                }}
              />
            </div>
            <dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3" data-slot="statement-facts">
              <div>
                <dt className="text-xs text-muted-foreground">{tr("col.statementNo")}</dt>
                <dd className="text-base font-semibold">{data.statement_no}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tr("col.period")}</dt>
                <dd className="tabular text-base font-semibold">
                  {df.date(data.date_from)} – {df.date(data.date_to)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tr("col.state")}</dt>
                <dd>
                  <StatusBadge label={tr(`state.${data.state}`)} tone={STATE_TONE[data.state]} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tr("generatedBy")}</dt>
                <dd className="font-medium">
                  {data.generated_by_name} · {df.dateTime(data.generated_at)}
                </dd>
              </div>
              <div data-slot="statement-check">
                <dt className="text-xs text-muted-foreground">{tr("col.checkNo")}</dt>
                <dd>
                  {data.check ? (
                    <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => setOpen("check")}>
                      {data.check.check_no} · {data.check_voucher_no} · {data.check.checked_by_name} ·{" "}
                      {df.dateTime(data.check.checked_at)}
                    </Button>
                  ) : (
                    tj("statePending")
                  )}
                </dd>
              </div>
              <div data-slot="statement-settlement">
                <dt className="text-xs text-muted-foreground">{tr("col.settlementNo")}</dt>
                <dd>
                  {data.check?.settlement_id ? (
                    <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => setOpen("settlement")}>
                      {data.settlement_no} · {data.settlement_voucher_no} · {data.check.settled_by_name}
                    </Button>
                  ) : (
                    tj("stateNotSettled")
                  )}
                </dd>
              </div>
              {data.cancelled_at ? (
                <div className="sm:col-span-3">
                  <dt className="text-xs text-muted-foreground">{tr("state.CANCELLED")}</dt>
                  <dd>
                    {data.cancelled_by_name} · {df.dateTime(data.cancelled_at)} · {data.cancel_reason}
                  </dd>
                </div>
              ) : null}
            </dl>
            <section className="space-y-2">
              <div>
                <h3 className="text-base font-semibold">{tr("linesTitle")}</h3>
                <p className="text-sm text-muted-foreground">{tr("linesHelp")}</p>
              </div>
              <StatementLines lines={data.lines} totals={data} project={data.project} />
            </section>
            <p className="text-xs text-muted-foreground">{tr("resultOnly")}</p>
            {data.state === "PENDING" && officeMay(user, can, RENTAL_PERMISSION) ? (
              <div className="flex justify-end border-t pt-3">
                <Button variant="outline" data-slot="cancel-statement-button" onClick={() => setOpen("cancel")}>
                  <Ban />
                  {tr("cancel")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {open === "check" && data?.check ? (
          <ReturnCheckWindow id={data.check.check_id} kind="RENTAL" onClose={() => setOpen(null)} />
        ) : null}
        {open === "settlement" && data?.check?.settlement_id ? (
          <SettlementWindow id={data.check.settlement_id} kind="RENTAL" onClose={() => setOpen(null)} />
        ) : null}
        {open === "cancel" && data ? (
          <CancelStatementDialog id={data.id} number={data.statement_no} onClose={() => setOpen(null)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** 【作废】: only while 待核对; kept, never deleted; its dates are free again. */
function CancelStatementDialog({ id, number, onClose }: { id: string; number: string; onClose: () => void }) {
  const tr = useTranslations("jb280");
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => cancelRentalStatement(id, reason.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rental-statements"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="cancel-statement-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("cancelTitle", { number })}</DialogTitle>
          <DialogDescription>{tr("cancelHelp")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={tr("cancelReason")} required>
          <Textarea value={reason} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} />
        </FieldWrapper>
        <div className="flex justify-end">
          <Button
            variant="destructive"
            requires={[[reason.trim(), tr("cancelReason")]]}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
            {tr("confirmCancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
