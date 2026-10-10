import type {
  ContractorReportType,
  ReportFilterKey,
  ReportFilterOption,
} from "@/interfaces/contractor-report";
import { reportValueKey } from "@/lib/report-preview";

/**
 * 报表中心's filter bar (Lucas 2026-10-10, 图11: 「报表中心那里全部可以加多一点
 * filter，就是可以筛选想要看/想要导出的报表，不然现在的filter太少了」).
 *
 * Every report has the project, the period and a keyword; the reports with
 * menu levels (D6) their category, and below that the filters listed here -
 * the same list as the server's `REPORT_FILTERS` (`contractor_ops/reporting.py`),
 * which reads them for the preview and both export formats alike. Their
 * choices come from `get_report_filters`: only values on records the reader
 * can see.
 */
export const REPORT_FILTERS: Record<ContractorReportType, readonly ReportFilterKey[]> = {
  progress: ["status", "actor"],
  // No 严重程度: gone from the system (Lucas, 2026-10-10).
  safety: ["status", "actor"],
  consultant: ["status", "actor"],
  attendance: ["actor", "event", "geofence"],
  equipment: ["equipment", "supplier", "direction"],
  recycling: ["record_type", "status", "counterparty"],
  schedule: ["plan", "status"],
  target: ["target_type", "status"],
  photos: ["actor"],
  documents: ["status", "actor"],
};

/** Every filter any report has, for the address (`useListQuery`). */
export const ALL_REPORT_FILTERS: readonly ReportFilterKey[] = [
  ...new Set(Object.values(REPORT_FILTERS).flat()),
];

/**
 * The filters that name one project's rows: a machine, a plan, a category.
 * Choosing another project clears them; a person or a status carries over.
 */
export const PROJECT_BOUND_FILTERS = ["category", "subcategory", "equipment", "plan"] as const;

/**
 * The table column a filter matches, so the field is named as the column
 * over it is. `actor` is the report's person column, whichever it is.
 */
const FILTER_COLUMN: Record<ReportFilterKey, string> = {
  status: "status",
  event: "event",
  geofence: "geofence_result",
  equipment: "equipment",
  supplier: "supplier",
  direction: "direction",
  record_type: "record_type",
  counterparty: "counterparty",
  plan: "plan",
  target_type: "target_type",
  actor: "actor",
};

const ACTOR_LABEL: Partial<Record<ContractorReportType, string>> = {
  progress: "contractorReports.filter.submittedBy",
  safety: "contractorReports.column.responsible_person",
  consultant: "contractorReports.column.consultant",
  attendance: "contractorReports.column.worker",
  photos: "contractorReports.filter.uploader",
  documents: "contractorReports.column.uploaded_by",
};

/** The message key naming a filter field on one report. */
export function filterLabelKey(
  reportType: ContractorReportType,
  key: ReportFilterKey,
): string {
  if (key === "actor") {
    return ACTOR_LABEL[reportType] ?? "contractorReports.filter.submittedBy";
  }
  if (key === "supplier") return "contractorReports.filter.supplier";
  return `contractorReports.column.${FILTER_COLUMN[key]}`;
}

/** Filters whose values are names already (people, machines, companies). */
const NAMED: ReadonlySet<ReportFilterKey> = new Set([
  "actor",
  "equipment",
  "supplier",
  "counterparty",
  "plan",
]);

/**
 * The message key that words a code-valued choice (`HIGH`, `CLOCK_IN`,
 * `DISPOSAL`) as its column does in the table, or `null` for a choice that is
 * a name already. A recycling status is worded by its own record type.
 */
export function filterOptionKey(
  reportType: ContractorReportType,
  key: ReportFilterKey,
  option: ReportFilterOption,
): string | null {
  if (NAMED.has(key)) return null;
  return reportValueKey(reportType, FILTER_COLUMN[key], option.value, {
    record_type: option.record_type ?? "",
  });
}
