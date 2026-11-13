"use client";

/**
 * 工程进度 › 雨天记录 (JB192, 客户 11-13 晚上) - `/progress?tab=rain`.
 *
 * The client:
 *
 * > 13. 每份记录显示两张照片、开始时间、结束时间、下雨时长、拍摄人及所属项目。
 * > 16. 同一天多次下雨，自动累计当天总下雨时长。
 * > 17. 每个月自动累计下雨次数、下雨天数及总小时、分钟。
 * > 18. 同一时间段即使收到多份雨天记录，也不能重复累计下雨时长，避免统计错误。
 * > 19. 支持按照日期、月份及项目筛选，查看对应照片和统计结果。
 * > 20. 现有工程进度PDF报表支持按月份输出 Rainy Weather 记录……
 * > 23. 用户可以按日期或月份筛选 Rainy Weather 记录，再勾选需要的雨天记录进行打包。
 *
 * One tab, the house's pieces: the project (the top bar's, as on the other
 * tabs), a month or a date range; the statistics the server works out for
 * that project and period (merged, so overlapping records count once; voided
 * ones not at all) with a line per day; the month's PDF with the four file
 * buttons; the records themselves - the shared table, newest first, two
 * thumbnails a row, ticked into a package with Multi Engine's own tick boxes
 * (a voided one cannot be). A row opens the progress record's own window,
 * where the rain section and 【作废】 are. 【接收规则】 for head office.
 *
 * Windows open and close by state, never by an effect (JB187).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, CloudRain, Loader2, Settings2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ProgressRecordDialog } from "@/components/contractor-ops/office-module-lists";
import { tone } from "@/components/contractor-ops/operations-workspaces";
import { DayRange } from "@/components/progress/progress-photos";
import { useAuth } from "@/components/providers/auth-provider";
import { DataTable } from "@/components/shared/data-table";
import { FileActionButtons } from "@/components/shared/file-actions";
import { FilterSelect, PlainHeader, ProjectListFilter } from "@/components/shared/module-records-table";
import { FieldWrapper, FilterBar, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { photoColumn, rowPhotos } from "@/components/shared/photo-thumb";
import type { ShellFact } from "@/components/shared/record-detail-shell";
import { RecordNo } from "@/components/shared/record-no";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useRainDuration } from "@/hooks/use-rain-duration";
import type { SiteProgressRecord } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { isMonth, periodQuery, rainPeriod, type RainPeriod } from "@/lib/rain-record";
import {
  getRainRecords,
  getRainRules,
  getRainSummary,
  RAIN_RECORDS_KEY,
  rainReportPdfFile,
  setRainRules,
  voidRainRecord,
  type RainRules,
  type RainSummary,
} from "@/services/rain-records.service";

/** The rules' limits, as the server checks them (接口 5). */
export const RAIN_LIMIT_RANGE = { min: 1, max: 50 } as const;
export const RAIN_MINUTES_RANGE = { min: 5, max: 1440 } as const;

/** A void's reason: a sentence, not a document. */
const REASON_MAX = 500;

/** 「全部状态 / 有效 / 已作废」 - the server's `voided` filter. */
const VOIDED_OPTIONS = ["0", "1"] as const;

/**
 * A month chosen sets the range to that month; a date typed in the range
 * drops the month (one or the other, 做法 四.4).
 */
export function monthChange(month: string): Record<string, string | undefined> {
  return isMonth(month)
    ? { month, date_from: undefined, date_to: undefined }
    : { month: undefined, date_from: undefined, date_to: undefined };
}

export function rangeChange(next: { date_from?: string; date_to?: string }): Record<string, string | undefined> {
  return { month: undefined, date_from: next.date_from, date_to: next.date_to };
}

export function RainRecordsTab() {
  const t = useTranslations("rainRecords");
  const locale = useLocale();
  const df = useDateFormat();
  const duration = useRainDuration();
  const list = useListQuery(["project", "month", "date_from", "date_to", "voided"]);
  const project = list.filters.project ?? "";
  // This month when nothing is chosen, counted once when the tab opens.
  const [today] = useState(() => new Date());
  const period = rainPeriod(list.filters, today);
  const periodParams = periodQuery(period);

  const records = useQuery({
    queryKey: [...RAIN_RECORDS_KEY, "list", list.query, periodParams],
    queryFn: () =>
      getRainRecords({
        ...list.query,
        month: undefined,
        date_from: undefined,
        date_to: undefined,
        ...periodParams,
      }),
  });
  const summary = useQuery({
    queryKey: [...RAIN_RECORDS_KEY, "summary", project, periodParams],
    queryFn: () => getRainSummary({ project, ...periodParams }),
    enabled: Boolean(project),
  });
  const rules = useQuery({ queryKey: [...RAIN_RECORDS_KEY, "rules"], queryFn: getRainRules });
  const rows = records.data?.results ?? [];
  const total = records.data?.count ?? 0;
  const [viewing, setViewing] = useState<SiteProgressRecord | null>(null);
  // The open record follows the list, so a void shows at once.
  const shown = viewing ? (rows.find((row) => row.id === viewing.id) ?? viewing) : null;
  const [editingRules, setEditingRules] = useState(false);

  const columns = useMemo<ColumnDef<SiteProgressRecord, unknown>[]>(
    () => [
      {
        accessorKey: "record_no",
        meta: { label: t("column.number") },
        header: () => <PlainHeader label={t("column.number")} />,
        cell: ({ row }) => <RecordNo value={row.original.record_no} />,
      },
      photoColumn<SiteProgressRecord>({
        label: t("column.photos"),
        icon: CloudRain,
        reference: (row) => row.record_no ?? "",
        photos: (row) => rowPhotos(row.photos, row.record_no ?? "", row),
        squares: 2,
      }),
      {
        id: "rain_started_at",
        meta: { label: t("column.start") },
        header: () => <PlainHeader label={t("column.start")} />,
        cell: ({ row }) => (
          <span className="tabular">{df.dateTime(row.original.rain_started_at ?? row.original.captured_at)}</span>
        ),
      },
      {
        id: "rain_ended_at",
        meta: { label: t("column.end") },
        header: () => <PlainHeader label={t("column.end")} />,
        cell: ({ row }) => <span className="tabular">{df.dateTime(row.original.rain_ended_at)}</span>,
      },
      {
        id: "rain_minutes",
        meta: { label: t("column.duration") },
        header: () => <PlainHeader label={t("column.duration")} />,
        cell: ({ row }) => <span className="tabular font-semibold">{duration(row.original.rain_minutes)}</span>,
      },
      {
        accessorKey: "submitted_by_name",
        meta: { label: t("column.who") },
        header: () => <PlainHeader label={t("column.who")} />,
        cell: ({ row }) => row.original.submitted_by_name || "—",
      },
      {
        accessorKey: "project_name",
        meta: { label: t("column.project") },
        header: () => <PlainHeader label={t("column.project")} />,
        cell: ({ row }) => <p className="max-w-45 truncate">{row.original.project_name}</p>,
      },
      {
        id: "status",
        meta: { label: t("column.status") },
        header: () => <PlainHeader label={t("column.status")} />,
        cell: ({ row }) => <RainStatus record={row.original} />,
      },
    ],
    [t, df, duration],
  );

  return (
    <div className="space-y-4" data-slot="rain-records">
      <FilterBar>
        <ProjectListFilter list={list} />
        <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          {t("filter.month")}
          <Input
            type="month"
            className="w-full bg-card sm:w-44"
            value={period.month}
            aria-label={t("filter.month")}
            data-slot="rain-month"
            onChange={(event) => list.setFilters(monthChange(event.target.value))}
          />
        </label>
        {/* A month shows as its range; typing a date makes it a range. */}
        <DayRange from={period.from} to={period.to} onChange={(next) => list.setFilters(rangeChange(next))} />
        <FilterSelect
          list={list}
          param="voided"
          allLabel={t("filter.allStates")}
          options={VOIDED_OPTIONS.map((value) => ({
            value,
            label: value === "1" ? t("filter.voided") : t("filter.active"),
          }))}
        />
      </FilterBar>

      <RainRulesLine query={rules} onEdit={() => setEditingRules(true)} />

      {project ? (
        <RainSummaryPanel query={summary} period={period} />
      ) : (
        <p
          className="rounded-xl border border-dashed border-panel-border p-4 text-sm text-muted-foreground"
          data-slot="rain-choose-project"
        >
          {t("summary.chooseProject")}
        </p>
      )}

      {/* 月报: 预览 · 打印 · 导出 · 发送 - the house's four file buttons. */}
      {project && period.month ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-slot="rain-pdf">
          <FileActionButtons
            label={t("pdf.label")}
            source={{
              load: () => rainReportPdfFile(project, period.month, locale),
              title: t("pdf.title", { month: period.month }),
              subject: t("pdf.title", { month: period.month }),
              project,
              // 打印 · 导出 · 发送 fetch it again with the PIN's grant, as
              // every other report the server makes.
              exportedOnServer: true,
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-slot="rain-pdf-need">
          {t("pdf.needMonth")}
        </p>
      )}

      <section className="space-y-2" data-slot="rain-list">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">{t("list.title")}</h3>
          <span className="text-sm text-muted-foreground">
            {records.isLoading ? "—" : t("list.count", { count: total })}
          </span>
        </div>
        {records.isError ? <QueryFailedNote query={records} what={t("what")} /> : null}
        <DataTable
          columns={columns}
          rows={rows}
          totalCount={total}
          page={list.page}
          pageSize={list.pageSize}
          isLoading={records.isLoading}
          isError={records.isError}
          hasFilters={list.hasFilters}
          search={list.search}
          sortBy={list.sortBy}
          sortOrder={list.sortOrder}
          storageKey="rain-records.v1"
          // Multi Engine's own tick boxes (五.1); a voided record cannot be packed.
          pack={{ kind: "PROGRESS", blocked: (row) => (row.is_voided ? "voided" : null) }}
          phoneCard={{
            title: ["record_no", "status"],
            detail: ["rain_started_at", "rain_minutes", "submitted_by_name"],
            photo: "cover_photo",
          }}
          onRowClick={setViewing}
          onSearchChange={list.setSearch}
          onSortChange={list.setSort}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          onClearFilters={list.clearFilters}
        />
      </section>

      {shown ? (
        <ProgressRecordDialog
          key={shown.id}
          record={shown}
          onClose={() => setViewing(null)}
          onShow={setViewing}
        />
      ) : null}
      {editingRules && rules.data ? (
        <RainRulesDialog rules={rules.data} onClose={() => setEditingRules(false)} />
      ) : null}
    </div>
  );
}

/** 「已作废」, or the progress record's own status. */
export function RainStatus({ record }: { record: SiteProgressRecord }) {
  const t = useTranslations("rainRecords");
  const tOps = useTranslations("contractorOps");
  return record.is_voided ? (
    <StatusBadge label={t("record.voided")} tone="danger" />
  ) : (
    <StatusBadge label={tOps(`progressStatus.${record.status}`)} tone={tone(record.status)} />
  );
}

/** The rule everyone sees, and 【接收规则】 for whoever may change it (二.5). */
function RainRulesLine({
  query: rules,
  onEdit,
}: {
  query: { data?: RainRules; isError: boolean; refetch?: () => unknown };
  onEdit: () => void;
}) {
  const t = useTranslations("rainRecords");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm" data-slot="rain-rules">
      <span className="min-w-0 flex-1">
        {rules.data ? t("rules.line", { limit: rules.data.limit, minutes: rules.data.minutes }) : "—"}
      </span>
      <QueryFailedNote query={rules} what={t("rules.what")} />
      {rules.data?.can_change ? (
        <Button size="sm" variant="outline" data-slot="rain-rules-button" onClick={onEdit}>
          <Settings2 />
          {t("rules.button")}
        </Button>
      ) : null}
    </div>
  );
}

/** 【接收规则】: how many records in how many minutes, per project (二.5). */
export function RainRulesDialog({ rules, onClose }: { rules: RainRules; onClose: () => void }) {
  const t = useTranslations("rainRecords");
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(String(rules.limit));
  const [minutes, setMinutes] = useState(String(rules.minutes));
  const limitValue = Number(limit);
  const minutesValue = Number(minutes);
  const limitOk =
    Number.isInteger(limitValue) && limitValue >= RAIN_LIMIT_RANGE.min && limitValue <= RAIN_LIMIT_RANGE.max;
  const minutesOk =
    Number.isInteger(minutesValue) &&
    minutesValue >= RAIN_MINUTES_RANGE.min &&
    minutesValue <= RAIN_MINUTES_RANGE.max;
  const save = useMutation({
    mutationFn: () => setRainRules({ limit: limitValue, minutes: minutesValue }),
    onSuccess: (saved) => {
      queryClient.setQueryData([...RAIN_RECORDS_KEY, "rules"], saved);
      onClose();
    },
    // A refusal (rain_rules_out_of_range) is said by the API client.
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="rain-rules-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rules.title")}</DialogTitle>
          <DialogDescription>{t("rules.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("rules.limit")} required hint={t("rules.limitHint")}>
            <Input
              type="number"
              inputMode="numeric"
              min={RAIN_LIMIT_RANGE.min}
              max={RAIN_LIMIT_RANGE.max}
              step={1}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("rules.minutes")} required hint={t("rules.minutesHint")}>
            <Input
              type="number"
              inputMode="numeric"
              min={RAIN_MINUTES_RANGE.min}
              max={RAIN_MINUTES_RANGE.max}
              step={1}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tRoot("common.cancel")}
          </Button>
          <Button
            data-slot="rain-rules-save"
            requires={[
              [limitOk ? limit : "", t("rules.limit")],
              [minutesOk ? minutes : "", t("rules.minutes")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {t("rules.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The period's statistics for one project, and a line per day with rain. */
export function RainSummaryPanel({
  query: summary,
  period,
}: {
  query: { data?: RainSummary; isLoading: boolean; isError: boolean; refetch?: () => unknown };
  period: RainPeriod;
}) {
  const t = useTranslations("rainRecords");
  const df = useDateFormat();
  const duration = useRainDuration();
  const data = summary.data;
  const from = data?.from ?? period.from;
  const to = data?.to ?? period.to;
  const tiles: Array<{ key: string; label: string; value: string }> = data
    ? [
        { key: "times", label: t("summary.times"), value: t("summary.timesValue", { count: data.times }) },
        { key: "days", label: t("summary.days"), value: t("summary.daysValue", { count: data.days }) },
        { key: "minutes", label: t("summary.minutes"), value: duration(data.minutes) },
        { key: "records", label: t("summary.records"), value: t("summary.recordsValue", { count: data.records }) },
        { key: "voided", label: t("summary.voided"), value: t("summary.recordsValue", { count: data.voided }) },
      ]
    : [];
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" data-slot="rain-summary">
      <h3 className="text-base font-semibold">
        {t("summary.title", { from: from ? df.date(from) : "…", to: to ? df.date(to) : "…" })}
      </h3>
      <QueryFailedNote query={summary} what={t("summary.what")} />
      {summary.isLoading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}
      {data ? (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {tiles.map((tile) => (
              <div key={tile.key} className="rounded-lg border bg-muted/20 p-3" data-stat={tile.key}>
                <dt className="text-xs text-muted-foreground">{tile.label}</dt>
                <dd className="tabular text-xl font-bold">{tile.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">{t("summary.hint")}</p>
          {data.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-slot="rain-no-rain">
              {t("summary.noRain")}
            </p>
          ) : (
            <div className="space-y-1" data-slot="rain-daily">
              <h4 className="text-sm font-semibold">{t("daily.title")}</h4>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("daily.date")}</TableHead>
                      <TableHead>{t("daily.times")}</TableHead>
                      <TableHead>{t("daily.minutes")}</TableHead>
                      <TableHead>{t("daily.records")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.daily.map((day) => (
                      <TableRow key={day.date} data-day={day.date}>
                        <TableCell className="tabular">{df.date(day.date)}</TableCell>
                        <TableCell className="tabular">{t("summary.timesValue", { count: day.times })}</TableCell>
                        <TableCell className="tabular font-semibold">{duration(day.minutes)}</TableCell>
                        <TableCell className="tabular">{t("summary.recordsValue", { count: day.records })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * In the progress record's own window (`ProgressRecordDialog`)
 * ---------------------------------------------------------------------- */

/** The rain record's two photos: the earlier is the start, the later the stop. */
export function rainPhotoRoles(record: Pick<SiteProgressRecord, "photos">): { start?: string; end?: string } {
  const sorted = [...record.photos].sort((a, b) => (a.captured_at ?? "").localeCompare(b.captured_at ?? ""));
  return { start: sorted[0]?.id, end: sorted.length > 1 ? sorted[sorted.length - 1].id : undefined };
}

/**
 * The rain section of a progress record's window (做法 四.4): start, stop -
 * each with its own photo's GPS - the duration, and once voided who, when
 * and why. Nothing for a record that is not a rain record.
 */
export function useRainFacts(record: SiteProgressRecord): ShellFact[] {
  const t = useTranslations("rainRecords");
  const df = useDateFormat();
  const duration = useRainDuration();
  if (!record.is_rain && !record.rain_started_at) return [];
  const roles = rainPhotoRoles(record);
  const photoOf = (id?: string) => record.photos.find((photo) => photo.id === id);
  const where = (photo?: { latitude?: string | null; longitude?: string | null }) =>
    photo?.latitude && photo?.longitude
      ? t("record.position", { latitude: photo.latitude, longitude: photo.longitude })
      : t("record.noGps");
  const moment = (at: string | null | undefined, photo?: { latitude?: string | null; longitude?: string | null }) => (
    <span className="flex flex-col">
      <span className="tabular font-semibold">{df.dateTime(at)}</span>
      <span className="text-xs text-muted-foreground">{where(photo)}</span>
    </span>
  );
  const startPhoto = photoOf(roles.start) ?? { latitude: record.latitude, longitude: record.longitude };
  const facts: ShellFact[] = [
    { label: t("record.start"), value: moment(record.rain_started_at ?? record.captured_at, startPhoto) },
    { label: t("record.end"), value: moment(record.rain_ended_at, photoOf(roles.end)) },
    {
      label: t("record.duration"),
      value: <span className="tabular text-base font-bold">{duration(record.rain_minutes)}</span>,
    },
  ];
  if (record.is_voided) {
    facts.push(
      { label: t("record.voidedBy"), value: record.voided_by_name || "—" },
      { label: t("record.voidedAt"), value: df.dateTime(record.voided_at) },
      { label: t("record.voidReason"), value: record.void_reason || "—", wide: true },
    );
  }
  return facts;
}

/** A rain record's photo labels: 「开始下雨」 and 「雨停」. */
export function useRainPhotoLabel(record: SiteProgressRecord) {
  const t = useTranslations("rainRecords");
  const roles = rainPhotoRoles(record);
  const rain = Boolean(record.is_rain || record.rain_started_at);
  return (photoId: string): string | null => {
    if (!rain) return null;
    if (photoId === roles.start) return t("record.start");
    if (photoId === roles.end) return t("record.end");
    return null;
  };
}

/**
 * 【作废】 (做法 二.6): for whoever confirms progress, on a rain record not yet
 * voided. A reason is required; the server asks for the PIN (「作废雨天记录」).
 * Never undone - there is no button for that.
 */
export function RainVoidButton({
  record,
  onVoided,
}: {
  record: SiteProgressRecord;
  onVoided: (fresh: SiteProgressRecord) => void;
}) {
  const t = useTranslations("rainRecords");
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!(record.is_rain || record.rain_started_at) || record.is_voided || !can("progress.confirm")) return null;
  return (
    <>
      <Button size="sm" variant="outline-destructive" data-slot="rain-void-button" onClick={() => setOpen(true)}>
        <Ban />
        {t("void.button")}
      </Button>
      {open ? (
        <RainVoidDialog
          record={record}
          onClose={() => setOpen(false)}
          onVoided={(fresh) => {
            setOpen(false);
            onVoided(fresh);
          }}
        />
      ) : null}
    </>
  );
}

export function RainVoidDialog({
  record,
  onClose,
  onVoided,
}: {
  record: SiteProgressRecord;
  onClose: () => void;
  onVoided: (fresh: SiteProgressRecord) => void;
}) {
  const t = useTranslations("rainRecords");
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => voidRainRecord(record.id, reason),
    onSuccess: (fresh) => {
      // Every count and list of rain records, and the progress lists.
      void queryClient.invalidateQueries({ queryKey: [...RAIN_RECORDS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["site-progress"] });
      void queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
      onVoided(fresh);
    },
    // A refusal is said by the API client; a closed PIN box does nothing.
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="rain-void-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("void.title")}</DialogTitle>
          <DialogDescription>
            {record.record_no ? `${record.record_no} · ` : ""}
            {t("void.help")}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("void.reason")} required>
          <Textarea
            value={reason}
            maxLength={REASON_MAX}
            rows={3}
            placeholder={t("void.reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </FieldWrapper>
        <p className="text-xs text-muted-foreground">{t("void.pin")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tRoot("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            data-slot="rain-void-confirm"
            requires={[[reason.trim(), t("void.reason")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
            {t("void.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
