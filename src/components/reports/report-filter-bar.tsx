"use client";

/**
 * 报表中心's filter bar (Lucas 2026-10-10, 图11: 「报表中心那里全部可以加多一点
 * filter，就是可以筛选想要看/想要导出的报表，不然现在的filter太少了」).
 *
 * The pieces every report's bar is made of, so the material reports and the
 * contractor reports read the same way: a caption over each control, a list
 * you can type into for every choice, one keyword box, and 「清除筛选」 that
 * puts the whole bar back. Each value lives in the address, and the report
 * reads the address for its preview and for the file it exports - so what is
 * exported is what is on screen.
 */

import { useQuery } from "@tanstack/react-query";
import { FilterX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  OptionCombobox,
  type ComboOption,
} from "@/components/material-requests/option-combobox";
import { useReportLevel } from "@/components/reports/report-selector";
import { FilterField, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ContractorReportType,
  ReportFilterKey,
} from "@/interfaces/contractor-report";
import { levelRowName, reportMenuKind } from "@/lib/report-menu";
import {
  REPORT_FILTERS,
  filterLabelKey,
  filterOptionKey,
} from "@/lib/report-filters";
import { getReportFilters } from "@/services/contractor-report.service";

// "Everything" needs a value of its own in the list.
const ALL = "__all__";

/** One choice of the bar: a caption, and a list you can type into. */
export function ReportChoiceField({
  label,
  value,
  options,
  onChange,
  loading = false,
}: {
  label: string;
  value?: string;
  options: readonly ComboOption[];
  onChange: (value: string | undefined) => void;
  /** The choices are still on their way: the chosen one is "…", not its id. */
  loading?: boolean;
}) {
  const t = useTranslations();
  const chosen = value ?? ALL;
  return (
    <FilterField label={label} className="sm:w-48">
      <OptionCombobox
        value={chosen}
        onChange={(next) => onChange(next === ALL ? undefined : next)}
        options={[{ value: ALL, label: t("common.all") }, ...options]}
        placeholder={t("common.all")}
        searchPlaceholder={t("common.searchPlaceholder")}
        emptyLabel={t("contractorReports.filter.noMatch")}
        ariaLabel={label}
        // A value from a link that is not among the choices still shows.
        selectedLabel={
          value && !options.some((option) => option.value === value)
            ? loading
              ? "…"
              : value
            : undefined
        }
        triggerClassName="w-full"
      />
    </FilterField>
  );
}

/**
 * The keyword box. What is typed reaches the address - and the report - once
 * typing pauses, so a word is one request rather than one per letter. 「清除
 * 筛选」 or another report empties the address; the box follows it.
 */
export function ReportKeywordField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onChange: (value: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const [seen, setSeen] = useState(value ?? "");
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The address moved without the box (cleared, another report, back).
  if ((value ?? "") !== seen) {
    setSeen(value ?? "");
    if (!typing) setText(value ?? "");
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <FilterField label={label} className="sm:w-56">
      <Input
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setTyping(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            setTyping(false);
            onChange(next.trim() || undefined);
          }, 400);
        }}
      />
    </FilterField>
  );
}

/** 「清除筛选」: every filter of the bar back to its start. */
export function ReportClearButton({
  active,
  onClear,
}: {
  active: boolean;
  onClear: () => void;
}) {
  const t = useTranslations();
  return (
    <Button
      variant="outline"
      className="self-end"
      disabledReason={!active ? t("common.noFiltersSet") : undefined}
      disabled={!active}
      onClick={onClear}
    >
      <FilterX className="size-4" />
      {t("reports.filter.clear")}
    </Button>
  );
}

/**
 * A contractor report's own filters: its menu level (and the one below),
 * then its filters from `REPORT_FILTERS`, then the keyword. The choices are
 * `get_report_filters`'s - only what the reader can see on this project.
 */
export function ContractorReportFilterFields({
  reportType,
  project,
  values,
  onChange,
}: {
  reportType: ContractorReportType;
  project?: string;
  values: Partial<Record<string, string>>;
  onChange: (updates: Record<string, string | undefined>) => void;
}) {
  const t = useTranslations();
  const menu = reportMenuKind(`/reports/contractor/${reportType}`);
  const levels = menu.kind === "categories" ? menu : null;
  const top = useReportLevel(reportType, project, undefined, Boolean(levels));
  const below = useReportLevel(
    reportType,
    project,
    values.category,
    Boolean(levels?.childLabel && values.category),
  );
  const filters = REPORT_FILTERS[reportType];
  const choices = useQuery({
    queryKey: ["contractor-reports", "filters", reportType, project ?? ""],
    queryFn: () => getReportFilters({ report_type: reportType, project }),
    enabled: filters.length > 0,
    staleTime: 60_000,
  });

  function options(key: ReportFilterKey): ComboOption[] {
    return (choices.data?.options[key] ?? []).map((option) => {
      const message = filterOptionKey(reportType, key, option);
      return {
        value: option.value,
        label: message && t.has(message) ? t(message) : option.label,
      };
    });
  }

  return (
    <>
      {levels && (
        <ReportChoiceField
          label={t(levels.label)}
          value={values.category}
          options={top.rows.map((row) => ({
            value: row.value,
            label: levelRowName(row, top.rows, Boolean(project)),
          }))}
          // The level below belongs to the level above.
          onChange={(category) => onChange({ category, subcategory: undefined })}
          loading={top.query.isLoading}
        />
      )}
      {levels?.childLabel && values.category && (values.subcategory || below.rows.length > 0) && (
        <ReportChoiceField
          label={t(levels.childLabel)}
          value={values.subcategory}
          options={below.rows.map((row) => ({ value: row.value, label: row.label }))}
          onChange={(subcategory) => onChange({ subcategory })}
          loading={below.query.isLoading}
        />
      )}
      {filters.map((key) => (
        <ReportChoiceField
          key={key}
          label={t(filterLabelKey(reportType, key))}
          value={values[key]}
          options={options(key)}
          onChange={(value) => onChange({ [key]: value })}
          loading={choices.isLoading}
        />
      ))}
      <ReportKeywordField
        label={t("contractorReports.filter.keyword")}
        value={values.keyword}
        placeholder={t(`contractorReports.filter.keywordPlaceholder.${reportType}`)}
        onChange={(keyword) => onChange({ keyword })}
      />
      <QueryFailedNote
        query={choices}
        what={t("contractorReports.what.filterOptions")}
        className="w-full"
      />
      {levels && (
        <QueryFailedNote
          query={top.query.isError ? top.query : below.query}
          what={t(levels.label)}
          className="w-full"
        />
      )}
    </>
  );
}
