/**
 * A company's switched-off modules on screen (JB250, 客户 11-24 事项 1:
 * 「关闭的模块在该公司的后台及手机端均不可使用，也不能通过直接链接或 API 绕过权限
 * 访问」).
 *
 * The server decides (`accounts.portal_features`, `modules_off` on the
 * signed-in user); these say so in plain words instead of a number, a list
 * or a silent bounce.
 */

/** The modules the signed-in user's company does not have (package or MSE switch). */
export function companyModulesOff(user: { modules_off?: string[] } | null | undefined): ReadonlySet<string> {
  return new Set(user?.modules_off ?? []);
}

/**
 * The module(s) each 报表中心 report reads - the server's
 * `contractor_ops.reporting.REPORT_TYPE_MODULES`. With all of them off the
 * report says 「<模块> 没有开通，这个报表没有资料」.
 */
export const REPORT_SOURCE_MODULES: Readonly<Record<string, readonly string[]>> = {
  progress: ["progress"],
  daily_report: ["progress"],
  progress_summary: ["progress"],
  schedule: ["schedule"],
  safety: ["hazard_rectification"],
  consultant: ["consultant_applications"],
  attendance: ["attendance"],
  equipment: ["equipment"],
  recycling: ["site_disposals", "waste_dispatches"],
  documents: ["documents"],
  field_tasks: ["field_tasks"],
  material_outgoing: ["material_outgoing"],
  material_returns: ["material_outgoing"],
  material_rejections: ["material_receipts"],
  // 材料数量报表 / 材料成本报表 read 材料进场's deliveries.
  material_quantity: ["material_receipts"],
  material_cost: ["material_receipts"],
};

/** The report's source modules when every one of them is off, else `null`. */
export function reportSourcesOff(reportType: string, off: ReadonlySet<string>): readonly string[] | null {
  const sources = REPORT_SOURCE_MODULES[reportType];
  if (!sources?.length || !sources.every((key) => off.has(key))) return null;
  return sources;
}

/**
 * The one-line note under a module in MSE's 业务模块 panel, by module: what
 * switching it does that the tick alone does not say.
 */
export const MODULE_NOTES: Readonly<Record<string, string>> = {
  hazard_rectification: "noteSafety",
  gate_records: "noteGate",
  site_access: "noteGate",
  material_quantity_report: "noteReports",
  material_cost_report: "noteReports",
};

/**
 * The head-office count cards that are one module's figure - the server's
 * `contractor_ops.headquarters.COUNT_FIELD_MODULES`: 「没有开通」 there.
 */
export const HEADQUARTERS_CARD_MODULES: Readonly<Record<string, string>> = {
  open_tasks: "field_tasks",
  overdue_tasks: "field_tasks",
  overdue_rectifications: "hazard_rectification",
  material_receipts_today: "material_receipts",
};

/** Whether a head-office card's module is off, by the dashboard's own list. */
export function cardModuleOff(card: string, modulesOff: readonly string[] | undefined): boolean {
  const key = HEADQUARTERS_CARD_MODULES[card];
  return Boolean(key && modulesOff?.includes(key));
}
