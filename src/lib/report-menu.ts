import type {
  ContractorReportType,
  ReportLevelRow,
} from "@/interfaces/contractor-report";

/**
 * 【选择报表】's levels (D6, Q16, Q17): what sits under each report, and what
 * a pick puts in the report's address.
 *
 * | report            | level 2            | level 3 |
 * | ----------------- | ------------------ | ------- |
 * | 材料数量 / 材料成本 | 材料分类           | 供应商   |
 * | 照片报表           | 照片来源           |         |
 * | 工程进度           | 施工分类           |         |
 * | 安全事件           | 隐患整改分类        |         |
 * | 顾问申请           | 申请类型 (Q2)      |         |
 * | 设备进退场         | 设备大类           | 小类     |
 * | 废料订单           | 环保材料出场分类    |         |
 * | 项目资料           | 文档大分类          | 子分类   |
 *
 * Everything else (人员进场记录, 施工计划, 目标与达成, 报表历史记录) opens
 * directly. Every level is clickable, and opens the report at that level.
 */

/** What a pick sets in the report's address. */
export interface ReportLevels {
  category?: string;
  subcategory?: string;
  supplier?: string;
}

export type ReportMenuKind =
  /** 材料分类 → 供应商, from the material columns and who delivered them. */
  | { kind: "material" }
  /** The report centre's own levels (`get_report_categories`). */
  | {
      kind: "categories";
      reportType: ContractorReportType;
      /** Message key naming the level. */
      label: string;
      /** Message key naming the level below, where there is one. */
      childLabel?: string;
    }
  | { kind: "none" };

const MATERIAL_REPORTS = ["/reports/material-quantity", "/reports/material-cost"];
const CONTRACTOR = "/reports/contractor/";

const CATEGORY_LEVELS: Partial<
  Record<ContractorReportType, { label: string; childLabel?: string }>
> = {
  photos: { label: "reportSelector.level.photos" },
  progress: { label: "reportSelector.level.progress" },
  safety: { label: "reportSelector.level.safety" },
  consultant: { label: "reportSelector.level.consultant" },
  equipment: {
    label: "reportSelector.level.equipment",
    childLabel: "reportSelector.level.equipmentClass",
  },
  recycling: { label: "reportSelector.level.recycling" },
  documents: {
    label: "reportSelector.level.documents",
    childLabel: "reportSelector.level.documentSubcategory",
  },
};

/** The report type a contractor report address opens, if it is one. */
export function contractorReportType(href: string): ContractorReportType | undefined {
  const path = href.split("?", 1)[0];
  if (!path.startsWith(CONTRACTOR)) return undefined;
  return path.slice(CONTRACTOR.length) as ContractorReportType;
}

export function reportMenuKind(href: string): ReportMenuKind {
  const path = href.split("?", 1)[0];
  if (MATERIAL_REPORTS.includes(path)) return { kind: "material" };
  const reportType = contractorReportType(path);
  const level = reportType ? CATEGORY_LEVELS[reportType] : undefined;
  if (reportType && level) return { kind: "categories", reportType, ...level };
  return { kind: "none" };
}

/**
 * The pages that carry 【选择报表】, where the toolbar's page switcher would
 * be a second copy of the same menu (X15, B12).
 */
export function isReportCenterPage(pathname: string): boolean {
  return (
    MATERIAL_REPORTS.includes(pathname) || pathname.startsWith(CONTRACTOR)
  );
}

/** Filters a report keeps when the reader picks a different one. */
export const KEPT_FILTERS = ["project", "date_from", "date_to"] as const;

/** Where a pick leads: the report, the reader's own filters, and the levels. */
export function reportHref(
  href: string,
  levels: ReportLevels,
  current: URLSearchParams,
): string {
  const path = href.split("?", 1)[0];
  const next = new URLSearchParams();
  for (const key of KEPT_FILTERS) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  if (levels.category) next.set("category", levels.category);
  if (levels.subcategory) next.set("subcategory", levels.subcategory);
  if (levels.supplier) next.set("supplier", levels.supplier);
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * The module each photograph source belongs to, by the module's own menu name
 * (spec rule 5: one module, one name). A module that keeps photographs in two
 * tables - progress: today's photo and the legacy update - is listed once.
 */
const PHOTO_SOURCE_MODULE: Record<string, string> = {
  "receiving.receiptphoto": "nav.submodule.materialReceipts",
  "receiving.deliverynoteevidence": "nav.submodule.materialReceipts",
  "site_operations.attendancerecord": "nav.submodule.attendanceRecords",
  "contractor_ops.siteprogressphoto": "nav.submodule.progressRecords",
  "site_operations.progressupdate": "nav.submodule.progressRecords",
  "site_operations.safetyincident": "nav.submodule.hazardRectifications",
  "site_operations.safetyrectificationevidence": "nav.submodule.hazardRectifications",
  "contractor_ops.siteequipmentphoto": "nav.submodule.siteEquipment",
  "contractor_ops.equipmentmovementphoto": "nav.submodule.siteEquipment",
  "contractor_ops.disposalevidence": "nav.submodule.wasteClearance",
  "contractor_ops.wasteoutgoingphoto": "nav.submodule.wasteOutgoing",
  "waste.dispatchphoto": "nav.submodule.wasteDispatches",
};

/**
 * Photo sources as the menu lists them: one row per module, its value every
 * source of that module joined by commas (the report reads it that way). A
 * source no module claims keeps the server's own name.
 */
export function groupPhotoSources(
  rows: readonly ReportLevelRow[],
  translate: (key: string) => string,
): ReportLevelRow[] {
  const grouped = new Map<string, ReportLevelRow>();
  for (const row of rows) {
    const key = PHOTO_SOURCE_MODULE[row.value];
    const label = key ? translate(key) : row.label;
    const existing = grouped.get(label);
    if (existing) {
      existing.value = `${existing.value},${row.value}`;
    } else {
      grouped.set(label, { ...row, label, has_children: false });
    }
  }
  return [...grouped.values()];
}

/**
 * The name to show for a row: with the project code beside it when no project
 * is chosen and another row has the same name (two sites both have 「打桩」).
 */
export function levelRowName(
  row: ReportLevelRow,
  rows: readonly ReportLevelRow[],
  projectChosen: boolean,
): string {
  if (projectChosen || !row.project_code) return row.label;
  const shared = rows.filter((other) => other.label === row.label).length > 1;
  return shared ? `${row.label} · ${row.project_code}` : row.label;
}

/** Q2's four application types, in the menu's order. */
export const CONSULTANT_TYPES = [
  "MATERIAL_APPROVAL",
  "MATERIAL_CERT_SUBMISSION",
  "RFI",
  "OTHER",
] as const;
