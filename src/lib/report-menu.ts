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
 * | 材料出场 / 进度 Claim | 分类              | 子分类   |
 *
 * I11 (ID27): a module whose project made a 分类组 of its own shows the groups
 * first - 「分类组 → 分类 → 子分类」, a group's value ``group:<id>``.
 *
 * Everything else (人员进场记录, 施工计划, 目标与达成, 报表历史记录) opens
 * directly. Every level is clickable, and opens the report at that level.
 */

/** What a pick sets in the report's address. */
export interface ReportLevels {
  category?: string;
  subcategory?: string;
  supplier?: string;
  /** A material's specification (I19: its sub-category), under `category`. */
  spec_category?: string;
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
  // 分类组 → 分类 → 子分类 (I11, ID27).
  material_outgoing: {
    label: "reportSelector.level.materialOutgoing",
    childLabel: "reportSelector.level.subcategory",
  },
  claims: {
    label: "reportSelector.level.claims",
    childLabel: "reportSelector.level.subcategory",
  },
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
  if (levels.spec_category) next.set("spec_category", levels.spec_category);
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

/** The message key of the module a photograph source belongs to, if any. */
export function photoSourceModuleKey(source: string): string | undefined {
  return PHOTO_SOURCE_MODULE[source];
}

/** Every source one module owns, in the order of the table above. */
function moduleSources(module: string): string[] {
  return Object.entries(PHOTO_SOURCE_MODULE)
    .filter(([, owner]) => owner === module)
    .map(([source]) => source);
}

/**
 * Photo sources as the menu lists them: one row per module, its value every
 * source that module owns joined by commas (the report reads it that way). A
 * source no module claims keeps the server's own name.
 *
 * Every source the module owns, not only the ones that happen to hold a
 * photograph in this list (Fable B3 #6): the menu lists one project's sources
 * and the 照片来源 dropdown every project's, so a value built from what was
 * present differed between the two - the dropdown went blank, and the report
 * skipped a source the module had.
 */
export function groupPhotoSources(
  rows: readonly ReportLevelRow[],
  translate: (key: string) => string,
): ReportLevelRow[] {
  const grouped = new Map<string, ReportLevelRow>();
  for (const row of rows) {
    const owner = PHOTO_SOURCE_MODULE[row.value];
    const label = owner ? translate(owner) : row.label;
    const existing = grouped.get(label);
    if (existing) {
      if (!existing.value.split(",").includes(row.value)) {
        existing.value = `${existing.value},${row.value}`;
      }
    } else {
      const value = owner ? moduleSources(owner).join(",") : row.value;
      grouped.set(label, { ...row, value, label, has_children: false });
    }
  }
  return [...grouped.values()];
}

/**
 * A photo source as the report reads it: each source named widened to every
 * source its module owns - the value the menu and the dropdown both use. So
 * an address written before the menu named whole modules still shows its
 * module and still reads all of it. A source no module claims stays as it is.
 */
export function photoSourceValue(category: string): string {
  const sources: string[] = [];
  for (const source of category.split(",").filter(Boolean)) {
    const owner = PHOTO_SOURCE_MODULE[source];
    for (const owned of owner ? moduleSources(owner) : [source]) {
      if (!sources.includes(owned)) sources.push(owned);
    }
  }
  return sources.join(",");
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

/**
 * A material report's export subtitle (Fable B3 #15): the period, then the
 * level 【选择报表】 opened it at - 「期间：… · 混凝土 › 某供应商」 - the way the
 * other reports' exports say it. It was one fixed line, so a file of one
 * supplier's concrete for one week did not say so anywhere. No dates chosen
 * is the whole history, and the period is left out.
 */
export function materialExportSubtitle(
  translate: (key: string, values?: Record<string, string>) => string,
  {
    level,
    dateFrom,
    dateTo,
  }: { level: string; dateFrom?: string; dateTo?: string },
): string {
  const period =
    dateFrom || dateTo
      ? translate("contractorReports.period", {
          from: dateFrom ?? "…",
          to: dateTo ?? "…",
        })
      : "";
  return [period, level].filter(Boolean).join(" · ");
}

/**
 * 工程进度's own reports, listed under it in 【选择报表】 above its 施工分类
 * (I8, ID24). The client: 「工程进度下拉，->先看到日报告，->往日报告，->施工
 * 计划，->项目进度摘要，->然后才会见到施工分类」. 施工计划 moved here from the
 * first level; the page itself has not changed.
 */
export interface ProgressMenuEntry {
  key: "dailyReport" | "pastDailyReports" | "schedule" | "progressSummary";
  /** Message key of its name. */
  labelKey: string;
  href: string;
}

export const PROGRESS_MENU: readonly ProgressMenuEntry[] = [
  {
    key: "dailyReport",
    labelKey: "reportSelector.progressMenu.dailyReport",
    href: "/reports/contractor/daily_report",
  },
  {
    key: "pastDailyReports",
    labelKey: "reportSelector.progressMenu.pastDailyReports",
    href: "/reports/contractor/daily_report",
  },
  {
    key: "schedule",
    labelKey: "nav.submodule.schedulePlanning",
    href: "/reports/contractor/schedule",
  },
  {
    key: "progressSummary",
    labelKey: "nav.submodule.progressSummary",
    href: "/reports/contractor/progress_summary",
  },
];

/**
 * Where an entry of 工程进度's menu leads. 「日报告」 opens on the latest day a
 * report covers (`latest`, its dates worked out on arrival); 「往日报告」 is
 * the same report, asking for the days first (`range`, the reader's current
 * days offered). The rest keep the reader's project and days like any pick.
 */
export function progressMenuHref(
  entry: ProgressMenuEntry,
  current: URLSearchParams,
): string {
  const [path, query = ""] = reportHref(entry.href, {}, current).split("?", 2);
  const next = new URLSearchParams(query);
  if (entry.key === "dailyReport") {
    next.delete("date_from");
    next.delete("date_to");
    next.set("latest", "1");
  } else if (entry.key === "pastDailyReports") {
    next.set("range", "1");
  }
  const text = next.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * The material dropdown of the material reports (I19): materials only. A
 * material's specifications are its sub-categories, chosen at the spec level
 * of 【选择报表】, so a row with a parent is never a 「材料」 of its own.
 */
export function materialOptions(
  rows: readonly { id: string; name: string; parent?: string | null }[],
): { value: string; label: string }[] {
  return rows.filter((row) => !row.parent).map((row) => ({ value: row.id, label: row.name }));
}
