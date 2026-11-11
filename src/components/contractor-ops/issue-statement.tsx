"use client";

/**
 * 材料领用's 自动汇总 and 「批量预览 / 打印」 (JB171, 客户 11-11 晚上「第四批」
 * 事项 2 第 3–5 点):
 *
 *   「支持按所属公司、材料名称及日期筛选，并自动汇总领用数量及总金额。」
 *   「例如 HH Machinery Sdn. Bhd. 一个月领用50次柴油，可以按日期及公司筛选，一次
 *    预览全部50条记录，批量打印或导出一份PDF。底部显示总领用数量及应收总金额（RM）。」
 *   「批量打印可以不需要照片。但要有双方签名。」
 *
 * Both work on the list's own filters and on every line they select, not on
 * the page shown. Only what was handed over is counted - the same lines in
 * the 汇总, the preview and the PDF. 打印 and 导出 PDF both use the server's
 * one PDF, so the paper and the file are the same.
 */

import { useQuery } from "@tanstack/react-query";
import { Download, FileSearch, Loader2, Printer } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useFileActions } from "@/components/shared/file-actions";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUnitName } from "@/hooks/use-material-units";
import { ApiError, type ListQuery } from "@/interfaces/api";
import type {
  MaterialIssueStatement,
  MaterialIssueTotals,
  MaterialIssueUnitTotal,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { issueMoney, statementLetterhead, type MoneyCell } from "@/lib/issue-money";
import {
  exportMaterialIssueStatement,
  getMaterialIssueStatement,
} from "@/services/contractor-ops.service";

/** Money as the cost report writes it: MYR 5,760.00. */
export function useMoney() {
  const formatter = useFormatter();
  return (value: string) => formatter.number(Number(value), { style: "currency", currency: "MYR" });
}

/** 「180.000 Liter；20.000 吨」: one figure per unit, never added across units. */
function UnitQuantities({ quantities }: { quantities: readonly MaterialIssueUnitTotal[] }) {
  const unitName = useUnitName();
  if (!quantities.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      {quantities.map((row) => (
        <span key={row.unit} className="tabular font-semibold">
          {row.quantity} {unitName(row.unit)}
        </span>
      ))}
    </span>
  );
}

/** A 单价 / 金额 cell: the money, 「没有单价」, or a dash. */
export function MoneyText({ cell, muted = false }: { cell: MoneyCell; muted?: boolean }) {
  const t = useTranslations("contractorOps");
  const money = useMoney();
  if (cell.kind === "money") return <span className={muted ? "text-muted-foreground" : undefined}>{money(cell.value)}</span>;
  if (cell.kind === "unpriced") return <span className="text-warning">{t("issue.unpriced")}</span>;
  return <span className="text-muted-foreground">—</span>;
}

/**
 * 自动汇总 under the list (JB171 C4): 领用数量 per unit and 总金额 of every
 * line the filters select that was handed over. What is still waiting, and
 * the lines with no price, are said, never quietly left out.
 */
export function IssueTotalsPanel({
  totals,
  seesMoney,
}: {
  totals: MaterialIssueTotals;
  seesMoney: boolean;
}) {
  const t = useTranslations("contractorOps");
  const money = useMoney();
  return (
    <section className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="issue-totals">
      <p className="font-medium">{t("issue.totalsTitle", { count: totals.counted_lines })}</p>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{t("issue.quantity")}</dt>
        <dd>
          <UnitQuantities quantities={totals.quantities} />
        </dd>
        {seesMoney && totals.amount_total !== null && (
          <>
            <dt className="text-muted-foreground">{t("issue.totalsAmount")}</dt>
            <dd className="tabular font-semibold" data-issue-amount-total>
              {money(totals.amount_total)}
            </dd>
          </>
        )}
      </dl>
      {totals.waiting_lines > 0 && (
        <p className="text-xs text-muted-foreground">{t("issue.totalsWaiting", { count: totals.waiting_lines })}</p>
      )}
      {seesMoney && totals.unpriced_lines > 0 && (
        <p className="text-xs font-medium text-warning">{t("issue.totalsUnpriced", { count: totals.unpriced_lines })}</p>
      )}
    </section>
  );
}

/**
 * 「批量预览 / 打印」 above the list (JB171 D1). Only for 金额查看 - the caller
 * leaves it out otherwise. With nothing handed over in the selection it does
 * not press, and says why beside it.
 */
export function IssueStatementButton({
  filters,
  totals,
}: {
  filters: ListQuery;
  totals: MaterialIssueTotals | undefined;
}) {
  const t = useTranslations("contractorOps");
  const [open, setOpen] = useState(false);
  const none = !totals || totals.counted_lines === 0;
  const reason = none ? t("issue.statementNone") : undefined;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid="issue-statement">
      {reason && (
        <p role="status" className="text-sm text-muted-foreground" data-issue-statement-why>
          {reason}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        data-issue-statement-open
        disabled={none}
        disabledReason={reason}
        onClick={() => setOpen(true)}
      >
        <FileSearch />
        {t("issue.statementButton")}
      </Button>
      {open && <IssueStatementDialog filters={filters} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * The preview: everything the paper will carry, unpaged - the letterhead,
 * 「材料领用结账单 / Material Issue Statement」, the filters, every line with
 * both signatures (no photographs), and at the foot 总领用数量 and 应收总金额.
 */
export function IssueStatementDialog({
  filters,
  onClose,
}: {
  filters: ListQuery;
  onClose: () => void;
}) {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const files = useFileActions();
  const statement = useQuery({
    queryKey: ["material-outgoing", "issue-statement", filters],
    queryFn: () => getMaterialIssueStatement(filters),
    staleTime: 0,
    gcTime: 0,
  });
  const failure = statement.error instanceof ApiError ? statement.error : null;
  // 「这次筛选出来有 N 项，一份最多 500 项。请把日期范围缩小一点再试。」 - said
  // here, in the server's words; anything else is the usual 「读取失败」.
  const tooLong = failure?.code === "issue_statement_too_long";
  const ready = Boolean(statement.data && statement.data.rows.length > 0);
  const notReady = statement.isLoading
    ? t("issue.statementLoading")
    : tooLong
      ? failure?.message
      : statement.isError
        ? tRoot("common.loadFailed", { what: t("issue.statementWhat") })
        : !ready
          ? t("issue.statementNone")
          : undefined;
  const source = {
    load: () => exportMaterialIssueStatement(filters),
    title: t("issue.statementTitle"),
    project: typeof filters.project === "string" ? filters.project : undefined,
  };
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[94dvh] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("issue.statementButton")}</DialogTitle>
          <DialogDescription>{t("issue.statementHelp")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {statement.isLoading ? (
            <div className="grid min-h-40 place-items-center">
              <Loader2 className="size-7 animate-spin text-primary" />
            </div>
          ) : tooLong ? (
            <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm font-medium" data-issue-statement-too-long>
              {failure?.message}
            </p>
          ) : statement.isError ? (
            <QueryFailedNote query={statement} what={t("issue.statementWhat")} />
          ) : statement.data ? (
            <StatementSheet statement={statement.data} filters={filters} />
          ) : null}
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            {tRoot("common.close")}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-issue-statement-print
            disabled={Boolean(notReady) || Boolean(files.busy)}
            disabledReason={notReady}
            onClick={() => void files.run("print", source, { key: "print" })}
          >
            {files.busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />}
            {t("issue.statementPrint")}
          </Button>
          <Button
            type="button"
            data-issue-statement-export
            disabled={Boolean(notReady) || Boolean(files.busy)}
            disabledReason={notReady}
            onClick={() => void files.run("save", source, { key: "save" })}
          >
            {files.busy === "save" ? <Loader2 className="animate-spin" /> : <Download />}
            {t("issue.statementExport")}
          </Button>
        </DialogFooter>
        {files.element}
      </DialogContent>
    </Dialog>
  );
}

/** The statement as it will print, laid out like the PDF. */
export function StatementSheet({
  statement,
  filters,
}: {
  statement: MaterialIssueStatement;
  filters: ListQuery;
}) {
  const t = useTranslations("contractorOps");
  const df = useDateFormat();
  const unitName = useUnitName();
  const money = useMoney();
  const head = statementLetterhead(statement);
  const applied = { ...stringFilters(filters), ...stringFilters(statement.filters ?? {}) };
  const all = t("issue.statementAll");
  const dateRange =
    applied.date_from && applied.date_to
      ? t("issue.statementRange", { from: df.date(applied.date_from), to: df.date(applied.date_to) })
      : applied.date_from
        ? t("issue.statementFrom", { from: df.date(applied.date_from) })
        : applied.date_to
          ? t("issue.statementUntil", { to: df.date(applied.date_to) })
          : all;
  const filterParts: Array<[string, string]> = [
    ...(head.project ? ([[t("issue.statementProject"), head.project]] as Array<[string, string]>) : []),
    [t("issue.equipmentCompany"), applied.company || all],
    [t("issue.colDate"), dateRange],
    [t("issue.material"), applied.material || all],
    ...(applied.equipment_no ? ([[t("issue.equipmentNo"), applied.equipment_no]] as Array<[string, string]>) : []),
    ...(applied.recipient ? ([[t("issue.recipientShort"), applied.recipient]] as Array<[string, string]>) : []),
  ];
  const totals = statement.totals;
  return (
    <article
      className="space-y-3 rounded-md border bg-card p-4 text-sm text-card-foreground"
      data-testid="issue-statement-sheet"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-foreground/70 pb-2">
        <div className="flex min-w-0 items-start gap-3">
          {head.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- the company's own logo, as on every formal document (JB162)
            <img src={head.logo} alt="" className="max-h-16 max-w-36 object-contain" />
          )}
          <div className="min-w-0">
            {head.name && <p className="text-base font-bold">{head.name}</p>}
            {head.lines.map((line) => (
              <p key={line} className="text-2xs leading-tight text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </div>
        <h2 className="text-lg font-bold">{t("issue.statementTitle")}</h2>
      </header>
      <dl className="flex flex-wrap gap-x-5 gap-y-1" data-issue-statement-filters>
        {filterParts.map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground">
        {t("issue.statementCount", { records: totals.records, lines: totals.lines })}
      </p>
      <div className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              {/* The list's eleven, then both signatures; no photographs (第 5 点). */}
              <TableHead>{t("issue.colDate")}</TableHead>
              <TableHead>{t("issue.issueNo")}</TableHead>
              <TableHead>{t("issue.material")}</TableHead>
              <TableHead>{t("issue.spec")}</TableHead>
              <TableHead>{t("issue.equipmentCompany")}</TableHead>
              <TableHead>{t("issue.equipmentNo")}</TableHead>
              <TableHead>{t("issue.recipientShort")}</TableHead>
              <TableHead className="text-right">{t("issue.quantity")}</TableHead>
              <TableHead>{t("issue.unit")}</TableHead>
              <TableHead className="text-right">{t("issue.unitPrice")}</TableHead>
              <TableHead className="text-right">{t("issue.colAmount")}</TableHead>
              <TableHead>{t("issue.issuerSignature")}</TableHead>
              <TableHead>{t("issue.recipientSignature")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.rows.map((row) => (
              <TableRow key={row.id} data-issue-statement-row>
                <TableCell className="tabular whitespace-nowrap">
                  <div>{df.date(row.at)}</div>
                  <div className="text-2xs text-muted-foreground">{df.time(row.at)}</div>
                </TableCell>
                <TableCell className="tabular whitespace-nowrap">{row.reference_no}</TableCell>
                <TableCell className="font-medium">{row.material_name}</TableCell>
                <TableCell>{row.material_specification || "—"}</TableCell>
                <TableCell>{row.equipment_company || "—"}</TableCell>
                <TableCell className="tabular">{row.equipment_no || "—"}</TableCell>
                <TableCell>{row.recipient_name || "—"}</TableCell>
                <TableCell className="tabular text-right">{row.issued_quantity ?? "—"}</TableCell>
                <TableCell>{unitName(row.unit)}</TableCell>
                <TableCell className="tabular text-right whitespace-nowrap">
                  <MoneyText cell={issueMoney(row.unit_price, row.priced)} />
                </TableCell>
                <TableCell className="tabular text-right whitespace-nowrap">
                  <MoneyText cell={issueMoney(row.amount, row.priced)} />
                </TableCell>
                <TableCell>
                  <SignatureImage url={row.issuer_signature} label={t("issue.issuerSignature")} />
                </TableCell>
                <TableCell>
                  <SignatureImage url={row.recipient_signature} label={t("issue.recipientSignature")} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <footer className="space-y-1 border-t-2 border-foreground/70 pt-2" data-issue-statement-totals>
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-muted-foreground">{t("issue.statementTotalQuantity")}</span>
          <UnitQuantities quantities={totals.quantities} />
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-muted-foreground">{t("issue.statementTotalAmount")}</span>
          <span className="tabular text-base font-bold">
            {totals.amount_total !== null ? money(totals.amount_total) : "—"}
          </span>
        </p>
        {totals.unpriced_lines > 0 && (
          <p className="text-xs font-medium text-warning">
            {t("issue.statementUnpriced", { count: totals.unpriced_lines })}
          </p>
        )}
      </footer>
    </article>
  );
}

function SignatureImage({ url, label }: { url: string | null; label: string }) {
  const t = useTranslations("contractorOps");
  if (!url) return <span className="text-2xs text-muted-foreground">{t("issue.unsigned")}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- a signature image as stored
  return <img src={url} alt={label} className="h-9 w-20 object-contain" />;
}

/** Only the filters that are words: what the statement says it was made of. */
function stringFilters(filters: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value) out[key] = value;
  }
  return out;
}
