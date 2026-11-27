"use client";

/**
 * 人工结算单 (JB295, 客户 11-27i): 「支持按所属公司及月份生成结算单。保留待核对、
 * 已核对、已结算三个状态。」 Mirrors 设备租赁月结单 (JB280), as the client
 * asked (「参考现有设备租赁费用的核对与结算流程」).
 *
 * The page: 「待核对｜已核对｜已结算｜全部」 with how many in each, the 项目 /
 * 所属公司 / 月份 filters, 【生成结算单】 (项目, 所属公司, 月份 → 【先看一下】 →
 * PIN) and 【核对与结算】 (the shared dialog, kind `LABOUR`). A statement opens
 * in `LabourStatementWindow`: who it is for, each person (with the days it
 * was priced from), the 合计, the 核对 / 结算 numbers, the A4 PDF and 【作废】
 * while 待核对.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronDown, ChevronRight, Eye, FileSpreadsheet, HandCoins, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import {
  officeMay,
  ReconcileSettleButton,
  ReturnCheckWindow,
  SettlementWindow,
  type RowSelection,
} from "@/components/contractor-ops/return-checks";
import {
  companyText,
  hoursText,
  isMonth,
  LABOUR_MANAGE,
  labourMoney,
  lastFinishedMonth,
  monthEndShort,
  ratePrice,
  tradeText,
} from "@/components/labour/labour-shared";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { FileActionButtons } from "@/components/shared/file-actions";
import { clickOpensRow } from "@/components/shared/inside-row-control";
import { FieldWrapper, FilterBar, FilterField, ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordWindowFailure } from "@/components/shared/record-window-failure";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useSeesAmounts } from "@/hooks/use-sees-amounts";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { getLabourOptions } from "@/services/labour.service";
import {
  cancelLabourStatement,
  createLabourStatement,
  getLabourStatement,
  getLabourStatementFilters,
  getLabourStatements,
  labourStatementPdfFile,
  previewLabourStatement,
  type LabourStatementChoices,
  type LabourStatementLine,
  type LabourStatementPreview,
  type LabourStatementState,
  type LabourStatementSummary,
  type LabourStatementTab,
  type LabourStatementTotals,
} from "@/services/labour-statement.service";

const ALL = "__all";
export const LABOUR_TABS: readonly LabourStatementTab[] = ["pending", "checked", "settled", "all"];

export function labourTabOf(value: string | null): LabourStatementTab {
  return value === "checked" || value === "settled" || value === "all" ? value : "pending";
}

export const STATE_TONE: Record<LabourStatementState, "warning" | "info" | "positive" | "neutral"> = {
  PENDING: "warning",
  CHECKED: "info",
  SETTLED: "positive",
  CANCELLED: "neutral",
};

/** The totals row of a statement: its own, else added up from its lines. */
export function statementTotals(lines: readonly LabourStatementLine[], given?: LabourStatementTotals): LabourStatementTotals {
  if (given && given.labour_amount !== undefined) return given;
  const cents = (value: string | null | undefined) => Math.round(Number(value || 0) * 100);
  const hours = (value: string | null | undefined) => Math.round(Number(value || 0) * 100);
  const sum = (pick: (line: LabourStatementLine) => number) => lines.reduce((total, line) => total + pick(line), 0);
  const hidden = lines.some((line) => line.labour_amount === null);
  return {
    days_worked: sum((line) => line.days_worked),
    normal_hours: (sum((line) => hours(line.normal_hours)) / 100).toFixed(2),
    overtime_hours: (sum((line) => hours(line.overtime_hours)) / 100).toFixed(2),
    normal_amount: hidden ? null : (sum((line) => cents(line.normal_amount)) / 100).toFixed(2),
    overtime_amount: hidden ? null : (sum((line) => cents(line.overtime_amount)) / 100).toFixed(2),
    labour_amount: hidden ? null : (sum((line) => cents(line.labour_amount)) / 100).toFixed(2),
  };
}

/** The 合计 row of a kept statement: its own frozen totals. */
export function summaryTotals(statement: LabourStatementSummary): LabourStatementTotals {
  return {
    days_worked: statement.days_total,
    normal_hours: statement.normal_hours_total,
    overtime_hours: statement.overtime_hours_total,
    normal_amount: statement.normal_amount ?? null,
    overtime_amount: statement.overtime_amount ?? null,
    labour_amount: statement.labour_total,
  };
}

export function LabourStatementsPage() {
  const t = useTranslations("jb295");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const current = useCurrentProject();
  // 项目现场费用总览's 查看明细 opens `?state=checked` (JB295 R11).
  const tab = labourTabOf(searchParams.get("tab") ?? searchParams.get("state"));
  const [viewing, setViewing] = useUrlSelection("statement");
  const [project, setProject] = useState(current.active ? current.projectId : "");
  const [company, setCompany] = useState(ALL);
  const [month, setMonth] = useState("");
  const shownProject = current.active ? current.projectId : project;
  const switchTab = (next: LabourStatementTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("state");
    if (next === "pending") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const { can, user } = useAuth();
  const seesAmounts = useSeesAmounts();
  const refused = !officeMay(user, can, LABOUR_MANAGE) ? "noManage" : !seesAmounts ? "noAmounts" : null;
  const query = {
    state: tab,
    ...(shownProject ? { project: shownProject } : {}),
    ...(company !== ALL ? { company } : {}),
    ...(isMonth(month) ? { month } : {}),
  };
  const rows = useQuery({
    queryKey: ["labour-statements", "list", query],
    queryFn: () => getLabourStatements(query),
    enabled: !refused,
  });
  // query-failure: without the companies the filter offers only 「全部所属公司」; the list still loads.
  const filters = useQuery({
    queryKey: ["labour-statements", "filters", shownProject],
    queryFn: () => getLabourStatementFilters(shownProject || undefined),
    enabled: !refused,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["labour-statements"] });
  const title = tRoot("nav.submodule.labourStatements");
  if (refused) {
    return (
      <div className="flex flex-col gap-4" data-slot="labour-statements">
        <ListHeader title={title} subtitle="" />
        <p role="status" className="rounded-lg border bg-muted/30 px-4 py-3 text-base" data-slot="labour-statements-refused">
          {t(`statement.${refused}`)}
        </p>
      </div>
    );
  }
  const list = rows.data?.rows ?? [];
  const counts = rows.data?.counts;
  return (
    <div className="flex flex-col gap-4" data-slot="labour-statements">
      <ListHeader
        title={title}
        subtitle={rows.isLoading ? "—" : t("statement.count", { count: list.length })}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="lg">
              <Link href="/labour-costs">
                <HandCoins />
                {tRoot("nav.submodule.labourCosts")}
              </Link>
            </Button>
            <GenerateButton
              onSaved={(id) => {
                refresh();
                switchTab("pending");
                setViewing(id);
              }}
            />
            <ReconcileSettleButton
              kind="LABOUR"
              step={tab === "checked" ? "settle" : "check"}
              permission={LABOUR_MANAGE}
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
          aria-label={t("statement.tabsLabel")}
          className="inline-flex flex-wrap self-start rounded-lg border bg-muted/40 p-1"
          data-testid="labour-statement-tabs"
        >
          {LABOUR_TABS.map((each) => (
            <Button
              key={each}
              role="tab"
              aria-selected={tab === each}
              variant={tab === each ? "default" : "ghost"}
              className="h-11 px-5 text-base"
              data-slot={`labour-tab-${each}`}
              onClick={() => switchTab(each)}
            >
              {t(`statement.tab.${each}`)}
              {counts ? <span className="tabular ml-1 opacity-80">({counts[each] ?? 0})</span> : null}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t("statement.resultOnly")}</p>
      </div>
      <FilterBar>
        {!current.active ? (
          <FilterField label={t("filter.project")} className="sm:w-56">
            <ProjectPicker
              value={project || "all"}
              onValueChange={(value) => setProject(value === "all" ? "" : value)}
              placeholder={t("filter.project")}
              allowAll
              allLabel={t("filter.allProjects")}
              className="w-full"
            />
          </FilterField>
        ) : null}
        <FilterField label={t("filter.company")} className="sm:w-56">
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger aria-label={t("filter.company")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allCompanies")}</SelectItem>
              {(filters.data?.companies ?? []).map((each) => (
                <SelectItem key={each.key} value={each.key}>
                  {companyText(t, each.key, each.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("filter.month")} className="sm:w-44">
          <Input type="month" value={month} aria-label={t("filter.month")} onChange={(event) => setMonth(event.target.value)} />
        </FilterField>
        {company !== ALL || month ? (
          <Button
            variant="ghost"
            onClick={() => {
              setCompany(ALL);
              setMonth("");
            }}
          >
            {t("filter.clear")}
          </Button>
        ) : null}
      </FilterBar>
      <QueryFailedNote query={rows} what={t("statement.what")} />
      {rows.isLoading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : null}
      {rows.isSuccess && list.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-base text-muted-foreground" data-slot="labour-statements-empty">
          {t(`statement.empty.${tab}`)}
        </p>
      ) : null}
      {list.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>{t("statement.col.number")}</TableHead>
                <TableHead>{t("statement.col.project")}</TableHead>
                <TableHead>{t("col.company")}</TableHead>
                <TableHead>{t("statement.col.month")}</TableHead>
                <TableHead className="text-right">{t("statement.col.people")}</TableHead>
                <TableHead className="text-right">{t("col.daysWorked")}</TableHead>
                <TableHead className="text-right">{t("statement.col.total")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
                <TableHead>{t("statement.col.checkNo")}</TableHead>
                <TableHead>{t("statement.col.settlementNo")}</TableHead>
                <TableHead>{t("statement.col.generated")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  data-slot="labour-statement-row"
                  onClick={(event) => {
                    if (clickOpensRow(event)) setViewing(row.id);
                  }}
                >
                  <TableCell className="font-semibold">{row.statement_no}</TableCell>
                  <TableCell>{row.project_name}</TableCell>
                  <TableCell>{companyText(t, row.company_key, row.company_name)}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{row.month}</TableCell>
                  <TableCell className="tabular text-right">{t("statement.peopleValue", { count: row.line_count })}</TableCell>
                  <TableCell className="tabular text-right">{row.days_total}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{labourMoney(row.labour_total)}</TableCell>
                  <TableCell>
                    <StatusBadge label={t(`state.${row.state}`)} tone={STATE_TONE[row.state]} />
                  </TableCell>
                  <TableCell>{row.check?.check_no || "—"}</TableCell>
                  <TableCell>{row.settlement?.settlement_no || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {row.generated_by_name} · {df.dateTime(row.generated_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewing(row.id);
                      }}
                    >
                      <Eye />
                      {t("statement.view")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {viewing ? <LabourStatementWindow id={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function GenerateButton({ onSaved }: { onSaved: (id: string) => void }) {
  const t = useTranslations("jb295");
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!officeMay(user, can, LABOUR_MANAGE)) return null;
  return (
    <>
      <Button size="lg" variant="outline" data-slot="labour-generate-button" onClick={() => setOpen(true)}>
        <FileSpreadsheet />
        {t("statement.generate")}
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

/** Why 【生成结算单】 cannot go yet, in plain words - or null. */
export function generateBlock(
  t: ReturnType<typeof useTranslations>,
  preview: LabourStatementPreview,
  month: string,
): string | null {
  if (!preview.month_over) return t("confirm.notOver", { date: monthEndShort(month) });
  if (preview.overlap) return t("statement.overlap", { number: preview.overlap.statement_no });
  if (preview.no_rate.length) return t("statement.noRateShort");
  if (!preview.lines.length) return t("statement.emptyPreview");
  return null;
}

export function GenerateStatementDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("jb295");
  const current = useCurrentProject();
  const [project, setProject] = useState(current.active ? current.projectId : "");
  const [companyKey, setCompanyKey] = useState("");
  const [month, setMonth] = useState(lastFinishedMonth());
  const options = useQuery({
    queryKey: ["labour", "options", project],
    queryFn: () => getLabourOptions(project),
    enabled: Boolean(project),
  });
  // 「未填所属公司」 cannot have a statement: the statement is per company.
  const companies = (options.data?.companies ?? []).filter((each) => each.kind !== "none");
  const choices: LabourStatementChoices = { project, company_key: companyKey, month };
  const preview = useMutation({ mutationFn: () => previewLabourStatement(choices) });
  const save = useMutation({
    mutationFn: () => createLabourStatement(choices),
    onSuccess: (statement) => onSaved(statement.id),
  });
  const [asked, setAsked] = useState<LabourStatementChoices | null>(null);
  const shown =
    preview.data && asked && asked.project === project && asked.company_key === companyKey && asked.month === month
      ? preview.data
      : undefined;
  const requirements = [
    [project, t("filter.project")],
    [companyKey, t("col.company")],
    [isMonth(month), t("filter.month")],
  ] as const;
  const block = shown ? generateBlock(t, shown, month) : null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="labour-generate-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t("statement.generate")}</DialogTitle>
          <DialogDescription>{t("statement.generateHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldWrapper label={t("filter.project")} required>
            <ProjectPicker
              value={project}
              placeholder={t("filter.chooseProject")}
              onValueChange={(next) => {
                setProject(next);
                setCompanyKey("");
              }}
            />
          </FieldWrapper>
          <FieldWrapper label={t("col.company")} required>
            <Select value={companyKey || undefined} onValueChange={setCompanyKey} disabled={!project}>
              <SelectTrigger aria-label={t("col.company")} className="h-11 text-base">
                <SelectValue placeholder={t("chooseCompany")} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((each) => (
                  <SelectItem key={each.key} value={each.key}>
                    {companyText(t, each.key, each.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {options.isError ? <QueryFailedNote query={options} what={t("col.company")} /> : null}
          </FieldWrapper>
          <FieldWrapper label={t("filter.month")} required>
            <Input type="month" className="h-11 text-base" value={month} onChange={(event) => setMonth(event.target.value)} />
          </FieldWrapper>
        </div>
        <div className="flex justify-end">
          <Button
            size="lg"
            variant="outline"
            data-slot="labour-preview-button"
            requires={requirements}
            disabled={preview.isPending}
            onClick={() => {
              setAsked(choices);
              preview.mutate();
            }}
          >
            {preview.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
            {t("statement.preview")}
          </Button>
        </div>
        {shown ? (
          <section className="space-y-3" data-slot="labour-statement-preview">
            {shown.lines.length ? (
              <LabourStatementLines lines={shown.lines} totals={statementTotals(shown.lines, shown.totals)} />
            ) : null}
            {shown.will_confirm.length ? (
              <PeopleNote tone="info" slot="labour-will-confirm" text={t("statement.willConfirm")} people={shown.will_confirm} />
            ) : null}
            {shown.no_rate.length ? (
              <PeopleNote tone="warning" slot="labour-no-rate-people" text={t("statement.noRate")} people={shown.no_rate} />
            ) : null}
            {shown.no_company.length ? (
              <PeopleNote
                tone="warning"
                slot="labour-no-company-people"
                text={t("statement.noCompany")}
                people={shown.no_company}
              />
            ) : null}
            {block ? (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-base" data-slot="labour-generate-block">
                {block}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">{t("statement.generatePin")}</p>
            <div className="flex justify-end">
              <Button
                size="lg"
                data-slot="labour-create-button"
                requires={requirements}
                disabled={save.isPending || Boolean(block)}
                disabledReason={block ?? undefined}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                {t("statement.generate")}
              </Button>
            </div>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PeopleNote({
  tone,
  slot,
  text,
  people,
}: {
  tone: "info" | "warning";
  slot: string;
  text: string;
  people: { key: string; name: string }[];
}) {
  return (
    <div
      className={
        tone === "info"
          ? "rounded-lg border border-info/30 bg-info/10 p-3 text-base"
          : "rounded-lg border border-warning/30 bg-warning/10 p-3 text-base"
      }
      data-slot={slot}
    >
      <p>{text}</p>
      <p className="mt-1 font-medium">{people.map((person) => person.name).join("、")}</p>
    </div>
  );
}

/**
 * The people of a statement: 姓名 | 工种 | 工作天数 | 正常工时 | 超时工时 |
 * 单价（方式）| 正常金额 | 超时金额 | 合计, the 合计 row, and 【看每天】 for the
 * days each line was priced from.
 */
export function LabourStatementLines({
  lines,
  totals,
}: {
  lines: readonly LabourStatementLine[];
  totals: LabourStatementTotals;
}) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div className="overflow-x-auto rounded-lg border" data-slot="labour-statement-lines">
      <Table className="text-base">
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.person")}</TableHead>
            <TableHead>{t("col.trade")}</TableHead>
            <TableHead className="text-right">{t("col.daysWorked")}</TableHead>
            <TableHead className="text-right">{t("col.normalHours")}</TableHead>
            <TableHead className="text-right">{t("col.overtimeHours")}</TableHead>
            <TableHead>{t("statement.col.rate")}</TableHead>
            <TableHead className="text-right">{t("col.normalAmount")}</TableHead>
            <TableHead className="text-right">{t("col.overtimeAmount")}</TableHead>
            <TableHead className="text-right">{t("col.labourAmount")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <Fragment key={line.person_key}>
              <TableRow data-slot="labour-statement-line">
                <TableCell className="font-medium">{line.person_name}</TableCell>
                <TableCell>{tradeText(t, line.trade_name)}</TableCell>
                <TableCell className="tabular text-right">{line.days_worked}</TableCell>
                <TableCell className="tabular text-right">{hoursText(line.normal_hours)}</TableCell>
                <TableCell className="tabular text-right">{hoursText(line.overtime_hours)}</TableCell>
                <TableCell>
                  {line.rates.length ? (
                    line.rates.map((rate) => (
                      <span key={rate.from} className="block" style={{ whiteSpace: "nowrap" }}>
                        {line.rates.length > 1
                          ? t("pieces.rangeRate", {
                              from: df.date(rate.from),
                              to: df.date(rate.to),
                              rate: ratePrice(t, rate.method, rate.unit_price),
                            })
                          : ratePrice(t, rate.method, rate.unit_price)}
                      </span>
                    ))
                  ) : (
                    <span className="text-warning">{t("rate.none")}</span>
                  )}
                </TableCell>
                <TableCell className="tabular text-right">{labourMoney(line.normal_amount)}</TableCell>
                <TableCell className="tabular text-right">{labourMoney(line.overtime_amount)}</TableCell>
                <TableCell className="tabular text-right font-semibold">{labourMoney(line.labour_amount)}</TableCell>
                <TableCell>
                  {line.days?.length ? (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={open.has(line.person_key)}
                      data-slot="labour-line-days-toggle"
                      onClick={() => toggle(line.person_key)}
                    >
                      {open.has(line.person_key) ? <ChevronDown /> : <ChevronRight />}
                      {t("statement.days")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
              {open.has(line.person_key) ? (
                <TableRow data-slot="labour-line-days">
                  <TableCell colSpan={10} className="bg-muted/20">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("col.date")}</TableHead>
                          <TableHead>{t("statement.worked")}</TableHead>
                          <TableHead className="text-right">{t("col.normalHours")}</TableHead>
                          <TableHead className="text-right">{t("col.overtimeHours")}</TableHead>
                          <TableHead className="text-right">{t("col.dayAmount")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {line.days.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="tabular">{df.date(day.date)}</TableCell>
                            <TableCell>{day.worked ? t("adjust.workedYes") : t("adjust.workedNo")}</TableCell>
                            <TableCell className="tabular text-right">{hoursText(day.normal_hours)}</TableCell>
                            <TableCell className="tabular text-right">{hoursText(day.overtime_hours)}</TableCell>
                            <TableCell className="tabular text-right">{labourMoney(day.day_amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow data-slot="labour-statement-total">
            <TableCell colSpan={2} className="font-semibold">
              {t("month.total")}
            </TableCell>
            <TableCell className="tabular text-right font-semibold">{totals.days_worked ?? ""}</TableCell>
            <TableCell className="tabular text-right font-semibold">{hoursText(totals.normal_hours)}</TableCell>
            <TableCell className="tabular text-right font-semibold">{hoursText(totals.overtime_hours)}</TableCell>
            <TableCell />
            <TableCell className="tabular text-right font-semibold">{labourMoney(totals.normal_amount)}</TableCell>
            <TableCell className="tabular text-right font-semibold">{labourMoney(totals.overtime_amount)}</TableCell>
            <TableCell className="tabular text-right font-semibold" data-slot="labour-statement-total-amount">
              {labourMoney(totals.labour_amount)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/** One 人工结算单: facts, people, 合计, 核对 / 结算, the A4 PDF, 【作废】. */
export function LabourStatementWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("jb295");
  const tCheck = useTranslations("jb278");
  const locale = useLocale();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const statement = useQuery({ queryKey: ["labour-statements", "detail", id], queryFn: () => getLabourStatement(id) });
  const data = statement.data;
  const [open, setOpen] = useState<"check" | "settlement" | "cancel" | null>(null);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="labour-statement-window" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{data ? t("statement.windowTitle", { number: data.statement_no }) : t("statement.what")}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.project_name} · ${companyText(t, data.company_key, data.company_name)} · ${data.month}`
              : t("statement.resultOnly")}
          </DialogDescription>
        </DialogHeader>
        {statement.isError ? <RecordWindowFailure query={statement} what={t("statement.what")} /> : null}
        {statement.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : null}
        {data ? (
          <div className="space-y-5">
            {/* 预览 is free; 打印 · 导出 · 发送 ask the six-digit PIN (like 月结单). */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <FileActionButtons
                label={t("statement.pdf")}
                source={{
                  load: () => labourStatementPdfFile(data.id, locale, data.statement_no),
                  title: t("statement.windowTitle", { number: data.statement_no }),
                  exportedOnServer: true,
                  recordKind: "LABOUR_STATEMENT",
                  recordId: data.id,
                  project: data.project,
                }}
              />
            </div>
            <dl className="grid gap-3 rounded-xl border p-4 text-base sm:grid-cols-3" data-slot="labour-statement-facts">
              <div>
                <dt className="text-sm text-muted-foreground">{t("statement.col.number")}</dt>
                <dd className="font-semibold">{data.statement_no}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("col.company")}</dt>
                <dd className="font-semibold">{companyText(t, data.company_key, data.company_name)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("statement.col.month")}</dt>
                <dd className="tabular font-semibold">{data.month}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("col.status")}</dt>
                <dd>
                  <StatusBadge label={t(`state.${data.state}`)} tone={STATE_TONE[data.state]} />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("statement.col.generated")}</dt>
                <dd>
                  {data.generated_by_name} · {df.dateTime(data.generated_at)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("statement.col.total")}</dt>
                <dd className="tabular text-lg font-semibold">{labourMoney(data.labour_total)}</dd>
              </div>
              <div data-slot="labour-statement-check">
                <dt className="text-sm text-muted-foreground">{t("statement.col.checkNo")}</dt>
                <dd>
                  {data.check ? (
                    <Button variant="link" className="h-auto p-0 text-base font-semibold" onClick={() => setOpen("check")}>
                      {data.check.check_no}
                    </Button>
                  ) : (
                    tCheck("statePending")
                  )}
                </dd>
              </div>
              <div data-slot="labour-statement-settlement">
                <dt className="text-sm text-muted-foreground">{t("statement.col.settlementNo")}</dt>
                <dd>
                  {data.settlement ? (
                    <Button variant="link" className="h-auto p-0 text-base font-semibold" onClick={() => setOpen("settlement")}>
                      {data.settlement.settlement_no}
                    </Button>
                  ) : (
                    tCheck("stateNotSettled")
                  )}
                </dd>
              </div>
              {data.cancelled_at ? (
                <div className="sm:col-span-3">
                  <dt className="text-sm text-muted-foreground">{t("state.CANCELLED")}</dt>
                  <dd>
                    {data.cancelled_by_name} · {df.dateTime(data.cancelled_at)} · {data.cancel_reason}
                  </dd>
                </div>
              ) : null}
            </dl>
            <section className="space-y-2">
              <div>
                <h3 className="text-lg font-semibold">{t("statement.linesTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("statement.linesHelp")}</p>
              </div>
              <LabourStatementLines lines={data.lines ?? []} totals={summaryTotals(data)} />
            </section>
            <p className="text-sm text-muted-foreground">{t("statement.resultOnly")}</p>
            {data.state === "PENDING" && officeMay(user, can, LABOUR_MANAGE) ? (
              <div className="flex justify-end border-t pt-3">
                <Button variant="outline" size="lg" data-slot="labour-cancel-button" onClick={() => setOpen("cancel")}>
                  <Ban />
                  {t("statement.cancel")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {open === "check" && data?.check ? (
          <ReturnCheckWindow id={data.check.id} kind="LABOUR" onClose={() => setOpen(null)} />
        ) : null}
        {open === "settlement" && data?.settlement ? (
          <SettlementWindow id={data.settlement.id} kind="LABOUR" onClose={() => setOpen(null)} />
        ) : null}
        {open === "cancel" && data ? (
          <CancelDialog id={data.id} number={data.statement_no} onClose={() => setOpen(null)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** 【作废】: only while 待核对; kept, never deleted; the month is free again. */
function CancelDialog({ id, number, onClose }: { id: string; number: string; onClose: () => void }) {
  const t = useTranslations("jb295");
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => cancelLabourStatement(id, reason.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["labour-statements"] });
      void qc.invalidateQueries({ queryKey: ["labour"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="labour-cancel-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("statement.cancelTitle", { number })}</DialogTitle>
          <DialogDescription>{t("statement.cancelHelp")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("statement.cancelReason")} required>
          <Textarea value={reason} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} />
        </FieldWrapper>
        <div className="flex justify-end">
          <Button
            size="lg"
            variant="destructive"
            requires={[[reason.trim(), t("statement.cancelReason")]]}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
            {t("statement.confirmCancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 人工结算单 in a 核对 or its pick list (kind LABOUR): 结算单编号｜项目｜
 * 所属公司｜月份｜人数｜合计. A row opens the statement.
 */
export function LabourStatementRowsTable({
  rows,
  selection,
}: {
  rows: readonly LabourStatementSummary[];
  selection?: RowSelection;
}) {
  const t = useTranslations("jb295");
  const [opened, setOpened] = useState<string | null>(null);
  const all = selection ? rows.every((row) => selection.chosen.has(row.id)) && rows.length > 0 : false;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="text-base">
        <TableHeader>
          <TableRow>
            {selection ? (
              <TableHead className="w-12">
                <Checkbox aria-label={t("statement.tickAll")} checked={all} onCheckedChange={() => selection.onToggleAll()} />
              </TableHead>
            ) : null}
            <TableHead>{t("statement.col.number")}</TableHead>
            <TableHead>{t("statement.col.project")}</TableHead>
            <TableHead>{t("col.company")}</TableHead>
            <TableHead>{t("statement.col.month")}</TableHead>
            <TableHead className="text-right">{t("statement.col.people")}</TableHead>
            <TableHead className="text-right">{t("statement.col.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-slot="labour-check-row"
              className="cursor-pointer"
              onClick={(event) => {
                if (clickOpensRow(event)) setOpened(row.id);
              }}
            >
              {selection ? (
                <TableCell>
                  <Checkbox
                    aria-label={row.statement_no}
                    checked={selection.chosen.has(row.id)}
                    onCheckedChange={() => selection.onToggle(row.id)}
                  />
                </TableCell>
              ) : null}
              <TableCell className="font-medium text-primary">{row.statement_no}</TableCell>
              <TableCell>{row.project_name}</TableCell>
              <TableCell>{companyText(t, row.company_key, row.company_name)}</TableCell>
              <TableCell className="tabular">{row.month}</TableCell>
              <TableCell className="tabular text-right">{t("statement.peopleValue", { count: row.line_count })}</TableCell>
              <TableCell className="tabular text-right font-semibold">{labourMoney(row.labour_total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {opened ? <LabourStatementWindow id={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
