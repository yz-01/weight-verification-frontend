"use client";

/**
 * 人工费用 (JB295, 客户 11-27i): 「没有看到人工费用统计及结算入口」.
 *
 * 「请参考现有设备租赁费用的核对与结算流程……支持按人员、工种及所属公司设定人工
 * 单价。按实际核实的工作天数、正常工时及超时工时累计计算人工费用。……电子围栏的
 * 进场及离场记录作为出勤依据，实际计费工时及工作天数必须经过负责人核对确认。」
 *
 * Like 设备操作员工时: 按日 | 按月 for one project and month. Both groups -
 * 人员名单 workers and App 账号 (their automatic 进场 / 离开).
 * - 按日: each person's stays that day (times, 「系统结束」 / 「缺离场」), 正常 /
 *   超时, the 调整 mark (who and why), 【调整】 (reason + PIN) and 🔒 on a
 *   day that is confirmed or in a 结算单.
 * - 按月: 工作天数, 正常, 超时, 缺离场, the rate (or 「没有单价」 with
 *   【设定单价】), the amounts, and 未确认 / 已确认 with 【取消确认】 / its 结算单.
 * - Header: 【人工单价设定】, 【正常工时：每天 N 小时】, 【确认本月工时】,
 *   【人工结算单】, 【导出】.
 * Without 「金额查看」 the days and hours show and every amount is 「—」.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  HandCoins,
  ListTree,
  Loader2,
  Lock,
  PencilLine,
  Receipt,
  Save,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import { officeMay } from "@/components/contractor-ops/return-checks";
import { LabourRatesDialog, type LabourRatePrefill } from "@/components/labour/labour-rates";
import {
  companyText,
  GroupBadge,
  hoursText,
  inRentalText,
  isInRental,
  isMonth,
  LABOUR_MANAGE,
  LABOUR_VIEW,
  labourMoney,
  lastFinishedMonth,
  monthEndShort,
  overtimeText,
  ratePrice,
  todayIso,
  tradeText,
  validHours,
} from "@/components/labour/labour-shared";
import { useAuth } from "@/components/providers/auth-provider";
import { usePageProject } from "@/components/providers/current-project-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FieldWrapper, FilterBar, FilterField, ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSeesAmounts } from "@/hooks/use-sees-amounts";
import { useDateFormat } from "@/lib/dates";
import { labourStatementHref, labourTabHref } from "@/lib/labour-links";
import {
  adjustLabourDay,
  confirmLabourMonth,
  exportLabourDays,
  exportLabourMonth,
  exportLabourSummary,
  getLabourDays,
  getLabourMonth,
  getLabourNormalHours,
  getLabourOptions,
  getLabourSummary,
  setLabourNormalHours,
  unconfirmLabourMonth,
  type LabourDayRow,
  type LabourMonthRow,
  type LabourNormalHours,
  type LabourOptions,
  type LabourQuery,
  type LabourSummary,
  type LabourSummaryGroup,
  type LabourTotals,
} from "@/services/labour.service";

const ALL = "__all";
type View = "day" | "month";

/** The 人工结算单 a 按月 row is in, opened on its page. */
export function statementHref(id: string): string {
  return labourStatementHref(id);
}

/** 按日's rows: newest day first, then by name. */
export function sortDays(rows: readonly LabourDayRow[]): LabourDayRow[] {
  return [...rows].sort((a, b) => (a.date === b.date ? a.person_name.localeCompare(b.person_name) : a.date < b.date ? 1 : -1));
}

/** The people 【确认本月工时】 lists: worked this month, not confirmed yet. */
export function confirmable(rows: readonly LabourMonthRow[]): LabourMonthRow[] {
  return rows.filter((row) => !row.confirmed && row.days_worked > 0);
}

/**
 * Of those, the ones that can be ticked: the server refuses to confirm a
 * person with no 人工单价 (a confirmed month would keep 「没有单价」 for good),
 * so they are listed with the reason instead.
 */
export function tickable(rows: readonly LabourMonthRow[]): LabourMonthRow[] {
  return confirmable(rows).filter((row) => !row.no_rate && row.rates.length > 0);
}

/** 统计方式 (JB295b, 客户 11-28 第 3 点 「按所属公司、工种及月份统计」). */
export const SUMMARY_GROUPS: readonly LabourSummaryGroup[] = ["person", "company", "trade"];

/**
 * Whether 按月 reads the summary: 按所属公司 / 按工种 always; 按人员 over several
 * months. 按人员 for one month is the 按月 table with 确认 / 取消确认.
 */
export function usesSummary(group: LabourSummaryGroup, monthFrom: string, monthTo: string): boolean {
  return group !== "person" || monthFrom !== monthTo;
}

/** 「同一个号码有两个人员，请检查」 warnings, each with the names it is about. */
export function phoneWarnings(options: LabourOptions | undefined): string[][] {
  const names = new Map((options?.people ?? []).map((person) => [person.key, person.name]));
  return (options?.warnings ?? [])
    .filter((warning) => warning.kind === "same_phone_twice")
    .map((warning) => warning.keys.map((key) => names.get(key) ?? key));
}

/** A live (not 作废) 结算单 holding the month: 【取消确认】 waits for it. */
export function liveStatement(row: LabourMonthRow): LabourMonthRow["statement"] {
  return row.statement && row.statement.state !== "CANCELLED" ? row.statement : null;
}

export function LabourCostsPage() {
  const t = useTranslations("jb295");
  const address = useSearchParams();
  const { can, user } = useAuth();
  const seesAmounts = useSeesAmounts();
  const canView = officeMay(user, can, LABOUR_VIEW);
  const canManage = officeMay(user, can, LABOUR_MANAGE);
  const [view, setView] = useState<View>(address?.get("view") === "day" ? "day" : "month");
  const [project, setProject] = usePageProject(address?.get("project") ?? "");
  const [month, setMonth] = useState(() => {
    const asked = address?.get("month");
    return isMonth(asked) ? asked : lastFinishedMonth();
  });
  // JB295b: 月份 从 … 到 (one month by default) and 统计方式.
  const [monthTo, setMonthTo] = useState(month);
  const [group, setGroup] = useState<LabourSummaryGroup>("person");
  const [company, setCompany] = useState(ALL);
  const [trade, setTrade] = useState(ALL);
  const [person, setPerson] = useState(ALL);
  const [flagged, setFlagged] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "rates"; prefill?: LabourRatePrefill }
    | { kind: "confirm" }
    | { kind: "adjust"; row: LabourDayRow }
    | { kind: "unconfirm"; row: LabourMonthRow }
    | { kind: "pieces"; row: LabourMonthRow }
    | null
  >(null);

  const query: LabourQuery = {
    project,
    month,
    ...(company !== ALL ? { company } : {}),
    ...(trade !== ALL ? { trade } : {}),
    ...(person !== ALL ? { person } : {}),
    ...(flagged ? { flagged: "1" as const } : {}),
  };
  const ready = Boolean(project && isMonth(month) && canView);
  const options = useQuery({
    queryKey: ["labour", "options", project],
    queryFn: () => getLabourOptions(project),
    enabled: Boolean(project && canView),
    staleTime: 60_000,
  });
  const days = useQuery({
    queryKey: ["labour", "days", query],
    queryFn: () => getLabourDays(query),
    enabled: ready && view === "day",
  });
  const summaryView = view === "month" && usesSummary(group, month, monthTo);
  const summaryQuery = {
    project,
    month_from: month,
    month_to: monthTo,
    group,
    ...(company !== ALL ? { company } : {}),
    ...(trade !== ALL ? { trade } : {}),
  };
  const monthly = useQuery({
    queryKey: ["labour", "month", query],
    queryFn: () => getLabourMonth(query),
    enabled: ready && view === "month" && !summaryView,
  });
  const summary = useQuery({
    queryKey: ["labour", "summary", summaryQuery],
    queryFn: () => getLabourSummary(summaryQuery),
    enabled: ready && summaryView,
  });

  if (!canView) {
    return (
      <div className="flex flex-col gap-4" data-slot="labour-costs">
        <ListHeader title={t("tab.labour")} subtitle="" />
        <p role="status" className="rounded-lg border bg-muted/30 px-4 py-3 text-base" data-slot="labour-costs-refused">
          {t("noView")}
        </p>
      </div>
    );
  }

  const title = t("tab.labour");
  const companies = options.data?.companies ?? [];
  const trades = options.data?.trades ?? [];
  const people = options.data?.people ?? [];
  const dayRows = sortDays(days.data?.rows ?? []);
  const monthRows = monthly.data?.rows ?? [];
  const subtitleParts = [
    view === "month" && monthTo !== month ? `${month} – ${monthTo}` : month,
    company !== ALL ? companyText(t, company, companies.find((each) => each.key === company)?.name ?? "") : "",
    trade !== ALL ? trade : "",
    person !== ALL ? people.find((each) => each.key === person)?.name ?? "" : "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4" data-slot="labour-costs">
      <ListHeader
        title={title}
        subtitle={t("subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && seesAmounts ? (
              <Button variant="outline" size="lg" data-slot="labour-rates-button" onClick={() => setDialog({ kind: "rates" })}>
                <Receipt />
                {t("rates.title")}
              </Button>
            ) : null}
            {canManage ? <LabourNormalHoursButton project={project} /> : null}
            {canManage ? (
              <Button
                size="lg"
                data-slot="labour-confirm-button"
                disabled={!project}
                disabledReason={t("chooseProjectFirst")}
                onClick={() => setDialog({ kind: "confirm" })}
              >
                <CheckCheck />
                {t("confirm.button")}
              </Button>
            ) : null}
            {canManage && seesAmounts ? (
              <Button asChild variant="outline" size="lg" data-slot="labour-statements-link">
                <Link href={labourTabHref("statements", { project })}>
                  <HandCoins />
                  {t("tab.statements")}
                </Link>
              </Button>
            ) : null}
            {canView ? (
              summaryView ? (
                <ExportButton
                  disabled={!summary.data?.rows.length}
                  disabledReason={t("stats.empty")}
                  title={title}
                  onExport={(format) =>
                    exportLabourSummary(
                      {
                        format,
                        title: `${title} · ${t(`stats.${group}`)}`,
                        subtitle: subtitleParts.join(" · "),
                        emptyLabel: t("stats.empty"),
                        query: { ...summaryQuery },
                        columns: [
                          { key: "name", label: t(`stats.name.${group}`) },
                          { key: "people", label: t("stats.col.people") },
                          { key: "days_worked", label: t("col.daysWorked") },
                          { key: "normal_hours", label: t("col.normalHours") },
                          { key: "overtime_hours", label: t("col.overtimeHours") },
                          { key: "labour_amount", label: t("stats.col.labourAmount") },
                          { key: "confirmed_amount", label: t("stats.col.confirmed") },
                          { key: "unconfirmed_amount", label: t("stats.col.unconfirmed") },
                        ],
                      },
                      t("month.total"),
                    )
                  }
                />
              ) : view === "day" ? (
                <ExportButton
                  disabled={!dayRows.length}
                  disabledReason={t("day.empty")}
                  title={title}
                  onExport={(format) =>
                    exportLabourDays({
                      format,
                      title: `${title} · ${t("view.day")}`,
                      subtitle: subtitleParts.join(" · "),
                      emptyLabel: t("day.empty"),
                      query: { ...query },
                      // The server writes the group, company, marks and rate in the reader's words.
                      columns: [
                        { key: "date", label: t("col.date") },
                        { key: "person_name", label: t("col.person") },
                        { key: "group", label: t("col.group") },
                        { key: "company_name", label: t("col.company") },
                        { key: "trade_name", label: t("col.trade") },
                        { key: "sessions", label: t("col.sessions") },
                        { key: "normal_hours", label: t("col.normalHours") },
                        { key: "overtime_hours", label: t("col.overtimeHours") },
                        { key: "worked", label: t("statement.worked") },
                        { key: "flags", label: t("col.toCheck") },
                        { key: "adjusted", label: t("col.adjusted") },
                        { key: "method", label: t("col.method") },
                        { key: "unit_price", label: t("col.unitPrice") },
                        { key: "overtime_rate", label: t("col.overtimeRate") },
                        { key: "normal_amount", label: t("col.normalAmount") },
                        { key: "overtime_amount", label: t("col.overtimeAmount") },
                        { key: "day_amount", label: t("col.dayAmount") },
                      ],
                    })
                  }
                />
              ) : (
                <ExportButton
                  disabled={!monthRows.length}
                  disabledReason={t("month.empty")}
                  title={title}
                  onExport={(format) =>
                    exportLabourMonth(
                      {
                        format,
                        title: `${title} · ${month}`,
                        subtitle: subtitleParts.join(" · "),
                        emptyLabel: t("month.empty"),
                        query: { ...query },
                        columns: [
                          { key: "person_name", label: t("col.person") },
                          { key: "group", label: t("col.group") },
                          { key: "company_name", label: t("col.company") },
                          { key: "trade_name", label: t("col.trade") },
                          { key: "days_worked", label: t("col.daysWorked") },
                          { key: "normal_hours", label: t("col.normalHours") },
                          { key: "overtime_hours", label: t("col.overtimeHours") },
                          { key: "missing_exit_count", label: t("col.missingExit") },
                          { key: "system_exit_count", label: t("col.systemExit") },
                          { key: "adjusted_count", label: t("col.adjustedCount") },
                          { key: "method", label: t("col.method") },
                          { key: "unit_price", label: t("col.unitPrice") },
                          { key: "overtime_rate", label: t("col.overtimeRate") },
                          { key: "normal_amount", label: t("col.normalAmount") },
                          { key: "overtime_amount", label: t("col.overtimeAmount") },
                          { key: "labour_amount", label: t("col.labourAmount") },
                          { key: "status", label: t("col.status") },
                          { key: "statement_no", label: t("statement.col.number") },
                        ],
                      },
                      t("month.total"),
                    )
                  }
                />
              )
            ) : null}
          </div>
        }
      />

      <FilterBar>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList className="h-11">
            <TabsTrigger value="day" className="px-5 text-base" data-slot="labour-view-day">
              {t("view.day")}
            </TabsTrigger>
            <TabsTrigger value="month" className="px-5 text-base" data-slot="labour-view-month">
              {t("view.month")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <FilterField label={t("filter.project")} className="sm:w-56">
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              setProject(value === "all" ? "" : value);
              setCompany(ALL);
              setPerson(ALL);
            }}
            placeholder={t("filter.chooseProject")}
            className="w-full"
          />
        </FilterField>
        <FilterField label={view === "month" ? t("stats.monthFrom") : t("filter.month")} className="sm:w-44">
          <Input
            type="month"
            value={month}
            aria-label={view === "month" ? t("stats.monthFrom") : t("filter.month")}
            onChange={(event) => {
              const next = event.target.value;
              if (!isMonth(next)) return;
              // 到 follows when it would fall before 从.
              setMonthTo((to) => (to < next || to === month ? next : to));
              setMonth(next);
            }}
          />
        </FilterField>
        {view === "month" ? (
          <FilterField label={t("stats.monthTo")} className="sm:w-44">
            <Input
              type="month"
              value={monthTo}
              min={month}
              aria-label={t("stats.monthTo")}
              onChange={(event) =>
                isMonth(event.target.value) && event.target.value >= month ? setMonthTo(event.target.value) : undefined
              }
            />
          </FilterField>
        ) : null}
        <FilterField label={t("filter.company")} className="sm:w-52">
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger aria-label={t("filter.company")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allCompanies")}</SelectItem>
              {companies.map((each) => (
                <SelectItem key={each.key} value={each.key}>
                  {companyText(t, each.key, each.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("filter.trade")} className="sm:w-44">
          <Select value={trade} onValueChange={setTrade}>
            <SelectTrigger aria-label={t("filter.trade")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allTrades")}</SelectItem>
              {trades.map((each) => (
                <SelectItem key={each.key} value={each.name}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("filter.person")} className="sm:w-52">
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger aria-label={t("filter.person")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allPeople")}</SelectItem>
              {people.map((each) => (
                <SelectItem key={each.key} value={each.key}>
                  {`${each.name} · ${t(`group.${each.group}`)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-base" data-slot="labour-flagged">
          <Checkbox checked={flagged} onCheckedChange={(value) => setFlagged(value === true)} />
          {t("filter.flagged")}
        </label>
      </FilterBar>
      <QueryFailedNote query={options} what={t("what.options")} />
      {view === "month" ? (
        <div className="flex flex-wrap items-center gap-2" data-slot="labour-stats-switch">
          <span className="text-base font-medium">{t("stats.label")}</span>
          <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label={t("stats.label")}>
            {SUMMARY_GROUPS.map((each) => (
              <Button
                key={each}
                type="button"
                role="radio"
                aria-checked={group === each}
                variant={group === each ? "default" : "ghost"}
                className="h-11 px-5 text-base"
                data-slot={`labour-stats-${each}`}
                onClick={() => setGroup(each)}
              >
                {t(`stats.${each}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {/* JB295b: two roster rows (or two accounts) with one phone are not merged - said here. */}
      {phoneWarnings(options.data).map((names) => (
        <p
          key={names.join("|")}
          className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-base"
          data-slot="labour-same-phone"
        >
          {t("twin.samePhone", { names: names.join("、") })}
        </p>
      ))}

      {!project ? (
        <p className="rounded-xl border bg-muted/30 px-4 py-6 text-center text-base" data-slot="labour-choose-project">
          {t("chooseProjectFirst")}
        </p>
      ) : summaryView ? (
        <SummaryTable group={group} data={summary.data} loading={summary.isLoading} query={summary} seesAmounts={seesAmounts} />
      ) : view === "day" ? (
        <DaysTable
          rows={dayRows}
          linked={linkedNames(options.data)}
          loading={days.isLoading}
          query={days}
          canManage={canManage}
          onAdjust={(row) => setDialog({ kind: "adjust", row })}
        />
      ) : (
        <MonthTable
          rows={monthRows}
          linked={linkedNames(options.data)}
          totals={monthly.data?.totals}
          loading={monthly.isLoading}
          query={monthly}
          canManage={canManage}
          seesAmounts={seesAmounts}
          onSetRate={(row) =>
            setDialog({ kind: "rates", prefill: { scope: "PERSON", person_key: row.person_key } })
          }
          onUnconfirm={(row) => setDialog({ kind: "unconfirm", row })}
          onPieces={(row) => setDialog({ kind: "pieces", row })}
        />
      )}
      <p className="text-sm text-muted-foreground">{t("pageNote")}</p>

      {dialog?.kind === "rates" ? (
        <LabourRatesDialog project={project} prefill={dialog.prefill} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "confirm" ? (
        <ConfirmMonthDialog project={project} month={month} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "adjust" ? (
        <AdjustDayDialog project={project} row={dialog.row} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "unconfirm" ? (
        <UnconfirmMonthDialog project={project} month={month} row={dialog.row} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "pieces" ? (
        <RatePiecesDialog row={dialog.row} month={month} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

/** The name, its group, and (JB295b) the linked app account counted with it. */
function PersonCell({ name, group, linked }: { name: string; group: LabourDayRow["group"]; linked?: string }) {
  const t = useTranslations("jb295");
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="font-medium">{name}</span>
      <GroupBadge group={group} />
      {linked ? (
        <span className="text-xs text-muted-foreground" data-slot="labour-linked-user">
          {t("twin.appName", { name: linked })}
        </span>
      ) : null}
    </span>
  );
}

/** person key → the linked app account's name (JB295b). */
export function linkedNames(options: LabourOptions | undefined): Map<string, string> {
  return new Map(
    (options?.people ?? [])
      .filter((person) => person.linked_user)
      .map((person) => [person.key, person.linked_user?.name ?? ""]),
  );
}

function Loading() {
  return (
    <div className="grid min-h-32 place-items-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

/** 「系统结束」 / 「缺离场」 on a stay, and the 调整 / 🔒 marks of a day. */
export function SessionsCell({ row }: { row: LabourDayRow }) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  if (!row.sessions.length) return <span className="text-muted-foreground">{t("day.noSession")}</span>;
  return (
    <span className="flex flex-col gap-1">
      {row.sessions.map((session) => (
        <span key={session.start} className="flex flex-wrap items-center gap-1.5" data-slot="labour-session">
          <span className="tabular">
            {df.time(session.start)} – {session.end ? df.time(session.end) : "?"}
          </span>
          {/* JB295b: an app stay of a roster worker's linked account. */}
          {session.source === "app" && row.group === "roster" ? (
            <span className="text-sm text-muted-foreground" data-slot="labour-session-app">
              {t("visits.sourceApp")}
              {session.refs.length ? ` ${session.refs.join(" · ")}` : ""}
            </span>
          ) : null}
          {session.end_kind === "SYSTEM" ? (
            <span className="text-sm font-medium text-warning" data-slot="labour-system-exit">
              {t("day.systemExit")}
            </span>
          ) : null}
          {session.end_kind === "MISSING" ? (
            <span className="text-sm font-medium text-warning" data-slot="labour-missing-exit">
              {t("day.missingExit")}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** Who changed the day and why: a mark that opens on hover or tap. */
function AdjustedMark({ row }: { row: LabourDayRow }) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const adjusted = row.adjusted;
  if (!adjusted) return null;
  const words = t("day.adjustedBy", { name: adjusted.by, time: df.dateTime(adjusted.at), reason: adjusted.reason });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" title={words} data-slot="labour-adjusted-mark">
          <PencilLine />
          {t("day.adjusted")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm leading-6">{words}</PopoverContent>
    </Popover>
  );
}

function DaysTable({
  rows,
  linked,
  loading,
  query,
  canManage,
  onAdjust,
}: {
  rows: LabourDayRow[];
  linked: Map<string, string>;
  loading: boolean;
  query: { isError: boolean; refetch?: () => unknown };
  canManage: boolean;
  onAdjust: (row: LabourDayRow) => void;
}) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  return (
    <section className="space-y-2" data-slot="labour-days">
      <QueryFailedNote query={query} what={t("what.days")} />
      {loading ? <Loading /> : null}
      {!loading && !query.isError && rows.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-base text-muted-foreground">{t("day.empty")}</p>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.date")}</TableHead>
                <TableHead>{t("col.person")}</TableHead>
                <TableHead>{t("col.company")}</TableHead>
                <TableHead>{t("col.trade")}</TableHead>
                <TableHead>{t("col.sessions")}</TableHead>
                <TableHead className="text-right">{t("col.normalHours")}</TableHead>
                <TableHead className="text-right">{t("col.overtimeHours")}</TableHead>
                <TableHead className="text-right">{t("col.dayAmount")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.person_key}-${row.date}`}
                  data-slot="labour-day-row"
                  className={row.worked ? undefined : "text-muted-foreground"}
                >
                  <TableCell className="tabular whitespace-nowrap">{df.date(row.date)}</TableCell>
                  <TableCell>
                    <PersonCell name={row.person_name} group={row.group} linked={linked.get(row.person_key)} />
                  </TableCell>
                  <TableCell>{companyText(t, row.company_key, row.company_name)}</TableCell>
                  <TableCell>{tradeText(t, row.trade_name)}</TableCell>
                  <TableCell>
                    <SessionsCell row={row} />
                    {!row.worked ? (
                      <span className="mt-1 block text-sm" data-slot="labour-not-worked">
                        {t("day.notWorked")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular text-right">{hoursText(row.normal_hours)}</TableCell>
                  <TableCell className="tabular text-right">{hoursText(row.overtime_hours)}</TableCell>
                  <TableCell className="tabular text-right">
                    {isInRental(row) ? (
                      <span className="text-sm text-muted-foreground" data-slot="labour-day-in-rental">
                        {inRentalText(t, row.in_rental)}
                      </span>
                    ) : row.rate ? (
                      labourMoney(row.day_amount)
                    ) : (
                      <span className="text-warning">{t("rate.none")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <AdjustedMark row={row} />
                      {row.locked ? (
                        <span
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
                          title={t(`day.locked.${row.locked}`)}
                          data-slot="labour-day-locked"
                        >
                          <Lock className="size-4" aria-hidden />
                          {t(`day.locked.${row.locked}`)}
                        </span>
                      ) : canManage ? (
                        <Button size="sm" variant="outline" data-slot="labour-adjust-button" onClick={() => onAdjust(row)}>
                          <PencilLine />
                          {t("adjust.button")}
                        </Button>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}

/** The 单价 cell of a 按月 row: one rate, several (【看分段】) or 「没有单价」. */
function RateCell({
  row,
  canSet,
  onSetRate,
  onPieces,
}: {
  row: LabourMonthRow;
  canSet: boolean;
  onSetRate: () => void;
  onPieces: () => void;
}) {
  const t = useTranslations("jb295");
  if (isInRental(row)) {
    return (
      <span className="block max-w-56 whitespace-normal text-sm text-muted-foreground" data-slot="labour-in-rental">
        {inRentalText(t, row.in_rental)}
      </span>
    );
  }
  if (row.no_rate || !row.rates.length) {
    return (
      <span className="flex flex-col items-start gap-1.5" data-slot="labour-no-rate">
        <span className="font-medium text-warning">{t("rate.none")}</span>
        {canSet ? (
          <Button size="sm" variant="outline" data-slot="labour-set-rate" onClick={onSetRate}>
            {t("rate.set")}
          </Button>
        ) : null}
      </span>
    );
  }
  if (row.rates.length > 1) {
    return (
      <span className="flex flex-col items-start gap-1.5" data-slot="labour-rate-pieces" style={{ whiteSpace: "nowrap" }}>
        <span>{t("pieces.count", { count: row.rates.length })}</span>
        <Button size="sm" variant="outline" data-slot="labour-pieces-open" onClick={onPieces}>
          <ListTree />
          {t("pieces.open")}
        </Button>
      </span>
    );
  }
  const rate = row.rates[0];
  return (
    <span className="flex flex-col" style={{ whiteSpace: "nowrap" }} data-slot="labour-rate">
      <span>{ratePrice(t, rate.method, rate.unit_price)}</span>
      <span className="text-sm text-muted-foreground">{overtimeText(t, rate.overtime_rate)}</span>
    </span>
  );
}

/** 未确认 / 已确认 who · when + 【取消确认】 / the 结算单 it is in. */
function MonthStatusCell({
  row,
  canManage,
  onUnconfirm,
}: {
  row: LabourMonthRow;
  canManage: boolean;
  onUnconfirm: () => void;
}) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const statement = liveStatement(row);
  if (!row.confirmed) return <StatusBadge label={t("month.notConfirmed")} tone="warning" />;
  return (
    <span className="flex flex-col items-start gap-1.5" data-slot="labour-confirmed">
      <StatusBadge label={t("month.confirmed")} tone="positive" />
      <span className="text-sm text-muted-foreground" style={{ whiteSpace: "nowrap" }}>
        {t("month.confirmedBy", { name: row.confirmed.by, time: df.dateTime(row.confirmed.at) })}
      </span>
      {statement ? (
        <Link
          href={statementHref(statement.id)}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          data-slot="labour-month-statement"
        >
          {t("month.inStatement", { number: statement.statement_no, state: t(`state.${statement.state}`) })}
        </Link>
      ) : null}
      {canManage ? (
        <Button
          size="sm"
          variant="outline"
          data-slot="labour-unconfirm-open"
          disabled={Boolean(statement)}
          disabledReason={statement ? t("unconfirm.inStatement", { number: statement.statement_no }) : undefined}
          onClick={onUnconfirm}
        >
          <Undo2 />
          {t("unconfirm.button")}
        </Button>
      ) : null}
    </span>
  );
}

function MonthTable({
  rows,
  linked,
  totals,
  loading,
  query,
  canManage,
  seesAmounts,
  onSetRate,
  onUnconfirm,
  onPieces,
}: {
  rows: LabourMonthRow[];
  linked: Map<string, string>;
  totals: LabourTotals | undefined;
  loading: boolean;
  query: { isError: boolean; refetch?: () => unknown };
  canManage: boolean;
  seesAmounts: boolean;
  onSetRate: (row: LabourMonthRow) => void;
  onUnconfirm: (row: LabourMonthRow) => void;
  onPieces: (row: LabourMonthRow) => void;
}) {
  const t = useTranslations("jb295");
  return (
    <section className="space-y-2" data-slot="labour-month">
      <QueryFailedNote query={query} what={t("what.month")} />
      {loading ? <Loading /> : null}
      {!loading && !query.isError && rows.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-base text-muted-foreground">{t("month.empty")}</p>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.person")}</TableHead>
                <TableHead>{t("col.company")}</TableHead>
                <TableHead>{t("col.trade")}</TableHead>
                <TableHead className="text-right">{t("col.daysWorked")}</TableHead>
                <TableHead className="text-right">{t("col.normalHours")}</TableHead>
                <TableHead className="text-right">{t("col.overtimeHours")}</TableHead>
                <TableHead className="text-right">{t("col.toCheck")}</TableHead>
                <TableHead>{t("col.rate")}</TableHead>
                <TableHead className="text-right">{t("col.normalAmount")}</TableHead>
                <TableHead className="text-right">{t("col.overtimeAmount")}</TableHead>
                <TableHead className="text-right">{t("col.labourAmount")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.person_key} data-slot="labour-month-row">
                  <TableCell>
                    <PersonCell name={row.person_name} group={row.group} linked={linked.get(row.person_key)} />
                  </TableCell>
                  <TableCell>{companyText(t, row.company_key, row.company_name)}</TableCell>
                  <TableCell>{tradeText(t, row.trade_name)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{row.days_worked}</TableCell>
                  <TableCell className="tabular text-right">{hoursText(row.normal_hours)}</TableCell>
                  <TableCell className="tabular text-right">{hoursText(row.overtime_hours)}</TableCell>
                  <TableCell className="tabular text-right">
                    {row.missing_exit_count + row.system_exit_count > 0 ? (
                      <span className="font-medium text-warning" title={t("month.flagsHelp")}>
                        {row.missing_exit_count + row.system_exit_count}
                      </span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell>
                    <RateCell
                      row={row}
                      canSet={canManage && seesAmounts}
                      onSetRate={() => onSetRate(row)}
                      onPieces={() => onPieces(row)}
                    />
                  </TableCell>
                  <TableCell className="tabular text-right">{labourMoney(row.normal_amount)}</TableCell>
                  <TableCell className="tabular text-right">{labourMoney(row.overtime_amount)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{labourMoney(row.labour_amount)}</TableCell>
                  <TableCell>
                    <MonthStatusCell row={row} canManage={canManage} onUnconfirm={() => onUnconfirm(row)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totals ? (
              <TableFooter>
                <TableRow data-slot="labour-month-total">
                  <TableCell colSpan={3} className="font-semibold">
                    {t("month.total")}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">{totals.days_worked}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{hoursText(totals.normal_hours)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{hoursText(totals.overtime_hours)}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="tabular text-right font-semibold">{labourMoney(totals.normal_amount)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{labourMoney(totals.overtime_amount)}</TableCell>
                  <TableCell className="tabular text-right font-semibold" data-slot="labour-month-total-amount">
                    {labourMoney(totals.labour_amount)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      ) : null}
      {!seesAmounts ? <p className="text-sm text-muted-foreground">{t("amountsHidden")}</p> : null}
    </section>
  );
}

/**
 * 按所属公司 / 按工种 / 按人员 over the months chosen (JB295b): 人数, 工作天数,
 * 正常工时, 超时工时, 人工费用 (已确认 / 未确认), a 每月 line under each row when
 * there are several months, and the 合计.
 */
export function SummaryTable({
  group,
  data,
  loading,
  query,
  seesAmounts,
}: {
  group: LabourSummaryGroup;
  data: LabourSummary | undefined;
  loading: boolean;
  query: { isError: boolean; refetch?: () => unknown };
  seesAmounts: boolean;
}) {
  const t = useTranslations("jb295");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const rows = data?.rows ?? [];
  const nameOf = (key: string, name: string) =>
    group === "company" ? companyText(t, key, name) : group === "trade" ? tradeText(t, key === "none" ? "" : name) : name;
  return (
    <section className="space-y-2" data-slot="labour-summary">
      <QueryFailedNote query={query} what={t("what.summary")} />
      {loading ? <Loading /> : null}
      {!loading && !query.isError && data && rows.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-base text-muted-foreground">{t("stats.empty")}</p>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>{t(`stats.name.${group}`)}</TableHead>
                <TableHead className="text-right">{t("stats.col.people")}</TableHead>
                <TableHead className="text-right">{t("col.daysWorked")}</TableHead>
                <TableHead className="text-right">{t("col.normalHours")}</TableHead>
                <TableHead className="text-right">{t("col.overtimeHours")}</TableHead>
                <TableHead className="text-right">{t("stats.col.labourAmount")}</TableHead>
                <TableHead className="text-right">{t("stats.col.confirmed")}</TableHead>
                <TableHead className="text-right">{t("stats.col.unconfirmed")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <Fragment key={row.key}>
                  <TableRow data-slot="labour-summary-row">
                    <TableCell className="font-medium">{nameOf(row.key, row.name)}</TableCell>
                    <TableCell className="tabular text-right">{row.people}</TableCell>
                    <TableCell className="tabular text-right">{row.days_worked}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(row.normal_hours)}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(row.overtime_hours)}</TableCell>
                    <TableCell className="tabular text-right font-semibold">{labourMoney(row.labour_amount)}</TableCell>
                    <TableCell className="tabular text-right">{labourMoney(row.confirmed_amount)}</TableCell>
                    <TableCell className="tabular text-right">{labourMoney(row.unconfirmed_amount)}</TableCell>
                    <TableCell>
                      {row.months.length > 1 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-expanded={open.has(row.key)}
                          data-slot="labour-summary-months-toggle"
                          onClick={() => toggle(row.key)}
                        >
                          {open.has(row.key) ? <ChevronDown /> : <ChevronRight />}
                          {t("stats.months")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {open.has(row.key)
                    ? row.months.map((piece) => (
                        <TableRow key={`${row.key}-${piece.month}`} className="bg-muted/20 text-muted-foreground" data-slot="labour-summary-month">
                          <TableCell className="tabular pl-8">{piece.month}</TableCell>
                    <TableCell className="tabular text-right">{piece.people}</TableCell>
                    <TableCell className="tabular text-right">{piece.days_worked}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(piece.normal_hours)}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(piece.overtime_hours)}</TableCell>
                    <TableCell className="tabular text-right font-semibold">{labourMoney(piece.labour_amount)}</TableCell>
                    <TableCell className="tabular text-right">{labourMoney(piece.confirmed_amount)}</TableCell>
                    <TableCell className="tabular text-right">{labourMoney(piece.unconfirmed_amount)}</TableCell>
                          <TableCell />
                        </TableRow>
                      ))
                    : null}
                </Fragment>
              ))}
            </TableBody>
            {data ? (
              <TableFooter>
                <TableRow data-slot="labour-summary-total">
                  <TableCell className="font-semibold">{t("month.total")}</TableCell>
                    <TableCell className="tabular text-right">{data.totals.people}</TableCell>
                    <TableCell className="tabular text-right">{data.totals.days_worked}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(data.totals.normal_hours)}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(data.totals.overtime_hours)}</TableCell>
                    <TableCell className="tabular text-right font-semibold">{labourMoney(data.totals.labour_amount)}</TableCell>
                    <TableCell className="tabular text-right">{labourMoney(data.totals.confirmed_amount)}</TableCell>
                    <TableCell className="tabular text-right">{labourMoney(data.totals.unconfirmed_amount)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("stats.help")}</p>
      {!seesAmounts ? <p className="text-sm text-muted-foreground">{t("amountsHidden")}</p> : null}
    </section>
  );
}

/** 【看分段】: the rates in force for parts of the month, one line each. */
function RatePiecesDialog({ row, month, onClose }: { row: LabourMonthRow; month: string; onClose: () => void }) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl" data-slot="labour-pieces">
        <DialogHeader>
          <DialogTitle>{t("pieces.title", { name: row.person_name, month })}</DialogTitle>
          <DialogDescription>{t("pieces.help")}</DialogDescription>
        </DialogHeader>
        <Table className="text-base">
          <TableHeader>
            <TableRow>
              <TableHead>{t("pieces.period")}</TableHead>
              <TableHead>{t("pieces.scope")}</TableHead>
              <TableHead>{t("col.rate")}</TableHead>
              <TableHead>{t("pieces.overtime")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.rates.map((piece) => (
              <TableRow key={piece.from} data-slot="labour-piece-row">
                <TableCell className="whitespace-nowrap">
                  {t("pieces.range", { from: df.date(piece.from), to: df.date(piece.to) })}
                </TableCell>
                <TableCell>{t(`scope.${piece.scope}`)}</TableCell>
                <TableCell className="whitespace-nowrap">{ratePrice(t, piece.method, piece.unit_price)}</TableCell>
                <TableCell className="whitespace-nowrap">{overtimeText(t, piece.overtime_rate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 【正常工时：每天 N 小时】 (R5): the project's own setting for labour, from a
 * date (a past one too). No PIN; the server keeps who and when.
 */
export function LabourNormalHoursButton({ project }: { project: string }) {
  const t = useTranslations("jb295");
  const [open, setOpen] = useState(false);
  const current = useQuery({
    queryKey: ["labour", "normal-hours", project],
    queryFn: () => getLabourNormalHours(project),
    enabled: Boolean(project),
  });
  if (!project) {
    return (
      <Button variant="outline" size="lg" disabled disabledReason={t("chooseProjectFirst")}>
        <Clock />
        {t("normal.title")}
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" size="lg" data-slot="labour-normal-button" onClick={() => setOpen(true)}>
        <Clock />
        {t("normal.button", { hours: hoursText(current.data?.daily_hours ?? "8") })}
      </Button>
      <QueryFailedNote query={current} what={t("normal.title")} />
      {open ? (
        <NormalHoursDialog project={project} current={current.data} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function NormalHoursDialog({
  project,
  current,
  onClose,
}: {
  project: string;
  current: LabourNormalHours | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [hours, setHours] = useState(hoursText(current?.daily_hours ?? "8"));
  const [from, setFrom] = useState(todayIso());
  const valid = validHours(hours) && Number(hours) > 0;
  const save = useMutation({
    mutationFn: () => setLabourNormalHours({ project, daily_hours: hours.trim(), effective_from: from }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["labour"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg" data-slot="labour-normal-dialog">
        <DialogHeader>
          <DialogTitle>{t("normal.title")}</DialogTitle>
          <DialogDescription>{t("normal.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("normal.hours")} required error={hours && !valid ? t("normal.invalid") : undefined}>
            <Input
              inputMode="decimal"
              className="h-11 text-base"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.effectiveFrom")} required hint={t("normal.fromHint")}>
            <Input type="date" className="h-11 text-base" value={from} onChange={(event) => setFrom(event.target.value)} />
          </FieldWrapper>
        </div>
        {current?.history?.length ? (
          <div className="space-y-1" data-slot="labour-normal-history">
            <p className="text-sm font-medium">{t("normal.history")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {current.history.map((row) => (
                <li key={`${row.effective_from}-${row.at}`}>
                  {t("normal.historyRow", {
                    hours: hoursText(row.daily_hours),
                    from: df.date(row.effective_from),
                    name: row.by,
                    time: df.dateTime(row.at),
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("normal.default")}</p>
        )}
        <DialogFooter>
          <Button
            size="lg"
            requires={[
              [valid, t("normal.hours")],
              [from, t("field.effectiveFrom")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("normal.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 【调整】 one day (R7, 客户 10-13 「人工调整工时…验证」): 有上班 yes / no, 正常
 * 工时, 超时工时, 原因, then the six-digit PIN. The newest adjustment counts;
 * the earlier ones are kept.
 */
export function AdjustDayDialog({ project, row, onClose }: { project: string; row: LabourDayRow; onClose: () => void }) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [worked, setWorked] = useState(row.worked || row.sessions.length === 0);
  const [normal, setNormal] = useState(hoursText(row.normal_hours));
  const [overtime, setOvertime] = useState(hoursText(row.overtime_hours));
  const [reason, setReason] = useState("");
  const normalOk = validHours(normal);
  const overtimeOk = validHours(overtime);
  const sumOk = !worked || (normalOk && overtimeOk && Number(normal) + Number(overtime) <= 24);
  const save = useMutation({
    mutationFn: () =>
      adjustLabourDay({
        project,
        person_key: row.person_key,
        date: row.date,
        worked,
        normal_hours: worked ? normal.trim() : "0",
        overtime_hours: worked ? overtime.trim() : "0",
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["labour"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl" data-slot="labour-adjust-dialog">
        <DialogHeader>
          <DialogTitle>{t("adjust.title", { name: row.person_name, date: df.date(row.date) })}</DialogTitle>
          <DialogDescription>{t("adjust.help")}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/20 p-3 text-base">
          <p className="text-sm text-muted-foreground">{t("adjust.records")}</p>
          <SessionsCell row={row} />
          {row.flags.includes("system_exit") ? (
            <p className="mt-1 text-sm text-warning">{t("day.systemExitHelp")}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("adjust.worked")}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("adjust.worked")}>
            {[true, false].map((value) => (
              <Button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={worked === value}
                variant={worked === value ? "default" : "outline"}
                className="h-12 min-w-32 text-base"
                data-slot={`labour-worked-${value ? "yes" : "no"}`}
                onClick={() => setWorked(value)}
              >
                {value ? t("adjust.workedYes") : t("adjust.workedNo")}
              </Button>
            ))}
          </div>
        </div>
        {worked ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldWrapper label={t("col.normalHours")} required error={normal && !normalOk ? t("adjust.hoursInvalid") : undefined}>
              <Input inputMode="decimal" className="h-11 text-base" value={normal} onChange={(event) => setNormal(event.target.value)} />
            </FieldWrapper>
            <FieldWrapper
              label={t("col.overtimeHours")}
              required
              error={overtime && !overtimeOk ? t("adjust.hoursInvalid") : undefined}
            >
              <Input
                inputMode="decimal"
                className="h-11 text-base"
                value={overtime}
                onChange={(event) => setOvertime(event.target.value)}
              />
            </FieldWrapper>
            {normalOk && overtimeOk && !sumOk ? (
              <p className="text-sm text-destructive sm:col-span-2">{t("adjust.over24")}</p>
            ) : null}
          </div>
        ) : null}
        <FieldWrapper label={t("adjust.reason")} required>
          <Textarea
            value={reason}
            rows={3}
            maxLength={500}
            placeholder={t("adjust.reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </FieldWrapper>
        <p className="text-sm text-muted-foreground">{t("adjust.pinNote")}</p>
        <DialogFooter>
          <Button
            size="lg"
            data-slot="labour-adjust-save"
            requires={[
              [!worked || normalOk, t("col.normalHours")],
              [!worked || overtimeOk, t("col.overtimeHours")],
              [reason.trim(), t("adjust.reason")],
            ]}
            disabled={save.isPending || !sumOk}
            disabledReason={!sumOk ? t("adjust.over24") : undefined}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("adjust.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 【确认本月工时】 (R9): the 负责人 ticks the people whose 工作天数 and 工时 he
 * has checked; a month not over yet says till when. PIN `labour.confirm`.
 * After it, the month reads as kept, whatever changes later.
 */
export function ConfirmMonthDialog({ project, month, onClose }: { project: string; month: string; onClose: () => void }) {
  const t = useTranslations("jb295");
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: ["labour", "month", { project, month }],
    queryFn: () => getLabourMonth({ project, month }),
  });
  const offered = confirmable(data.data?.rows ?? []);
  const canTick = tickable(data.data?.rows ?? []);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const ticked = canTick.filter((row) => !unticked.has(row.person_key)).map((row) => row.person_key);
  const tickableKeys = new Set(canTick.map((row) => row.person_key));
  const over = data.data?.month_over ?? false;
  const save = useMutation({
    mutationFn: () => confirmLabourMonth({ project, month, people: ticked }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["labour"] });
      onClose();
    },
  });
  const toggle = (key: string) =>
    setUnticked((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const notOver = t("confirm.notOver", { date: monthEndShort(month) });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl" data-slot="labour-confirm-dialog">
        <DialogHeader>
          <DialogTitle>{t("confirm.title", { month })}</DialogTitle>
          <DialogDescription>{t("confirm.help")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={data} what={t("what.month")} />
        {data.isLoading ? <Loading /> : null}
        {data.data && !over ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-base" data-slot="labour-not-over">
            {notOver}
          </p>
        ) : null}
        {data.data && over && offered.length === 0 ? (
          <p className="rounded-lg border px-4 py-3 text-base text-muted-foreground" data-slot="labour-nothing-to-confirm">
            {t("confirm.nothing")}
          </p>
        ) : null}
        {offered.length > canTick.length ? (
          // The server refuses to confirm a person with no 人工单价: named here first.
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-base" data-slot="labour-confirm-no-rate-names">
            {t("confirm.noRateNames", {
              names: offered
                .filter((row) => !tickableKeys.has(row.person_key))
                .map((row) => row.person_name)
                .join("、"),
            })}
          </p>
        ) : null}
        {offered.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table className="text-base">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      aria-label={t("confirm.all")}
                      checked={canTick.length > 0 && ticked.length === canTick.length}
                      disabled={canTick.length === 0}
                      onCheckedChange={(value) =>
                        setUnticked(value === true ? new Set() : new Set(canTick.map((row) => row.person_key)))
                      }
                    />
                  </TableHead>
                  <TableHead>{t("col.person")}</TableHead>
                  <TableHead>{t("col.company")}</TableHead>
                  <TableHead className="text-right">{t("col.daysWorked")}</TableHead>
                  <TableHead className="text-right">{t("col.normalHours")}</TableHead>
                  <TableHead className="text-right">{t("col.overtimeHours")}</TableHead>
                  <TableHead>{t("confirm.check")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offered.map((row) => (
                  <TableRow key={row.person_key} data-slot="labour-confirm-row">
                    <TableCell>
                      <Checkbox
                        aria-label={row.person_name}
                        checked={tickableKeys.has(row.person_key) && !unticked.has(row.person_key)}
                        disabled={!tickableKeys.has(row.person_key)}
                        onCheckedChange={() => toggle(row.person_key)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-1">
                        <span className="font-medium">{row.person_name}</span>
                        <GroupBadge group={row.group} />
                      </span>
                    </TableCell>
                    <TableCell>{companyText(t, row.company_key, row.company_name)}</TableCell>
                    <TableCell className="tabular text-right">{row.days_worked}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(row.normal_hours)}</TableCell>
                    <TableCell className="tabular text-right">{hoursText(row.overtime_hours)}</TableCell>
                    <TableCell className="text-sm">
                      {!tickableKeys.has(row.person_key) ? (
                        <span className="font-medium text-warning" data-slot="labour-confirm-no-rate">
                          {t("confirm.noRate")}
                        </span>
                      ) : row.missing_exit_count + row.system_exit_count > 0 ? (
                        <span className="text-warning">
                          {t("confirm.flags", { count: row.missing_exit_count + row.system_exit_count })}
                        </span>
                      ) : (
                        t("confirm.ok")
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">{t("confirm.pinNote")}</p>
        <DialogFooter>
          <Button
            size="lg"
            data-slot="labour-confirm-save"
            disabled={save.isPending || !over || ticked.length === 0}
            disabledReason={!over ? notOver : ticked.length === 0 ? t("confirm.tickSomeone") : undefined}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            {t("confirm.save", { count: ticked.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 【取消确认】 (the JB294 pattern): a reason, then the PIN. */
export function UnconfirmMonthDialog({
  project,
  month,
  row,
  onClose,
}: {
  project: string;
  month: string;
  row: LabourMonthRow;
  onClose: () => void;
}) {
  const t = useTranslations("jb295");
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => unconfirmLabourMonth({ project, month, person_key: row.person_key, reason: reason.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["labour"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg" data-slot="labour-unconfirm-dialog">
        <DialogHeader>
          <DialogTitle>{t("unconfirm.title", { name: row.person_name, month })}</DialogTitle>
          <DialogDescription>{t("unconfirm.help")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("unconfirm.reason")} required>
          <Textarea value={reason} rows={3} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button
            size="lg"
            variant="destructive"
            requires={[[reason.trim(), t("unconfirm.reason")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
            {t("unconfirm.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
