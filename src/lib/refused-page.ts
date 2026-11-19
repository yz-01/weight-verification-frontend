/**
 * The pages of 材料管理 and 工程进度, by the item keys of their module (JB225,
 * 客户 11-19 事项 5): a consultant who holds another item of that module is told
 * it is this item head office has not opened, not the whole module.
 */
const ITEM_PAGES: ReadonlyArray<readonly [string, string]> = [
  ["/receipts", "item_materials_"],
  ["/material-outgoing", "item_materials_"],
  ["/material-targets", "item_materials_"],
  ["/progress", "item_progress_"],
  ["/schedule", "item_progress_"],
  ["/reports/contractor/progress", "item_progress_"],
  ["/reports/contractor/daily_report", "item_progress_"],
  ["/reports/contractor/progress_summary", "item_progress_"],
  ["/reports/contractor/schedule", "item_progress_"],
  ["/reports/contractor/material_outgoing", "item_materials_"],
  ["/reports/contractor/material_returns", "item_materials_"],
  ["/reports/contractor/material_rejections", "item_materials_"],
  ["/reports/material-quantity", "item_materials_"],
];

/**
 * What a refused page says before the dashboard shell moves on, or `null`.
 *
 * A page this account may not open bounced to the first page it may, with no
 * word, and the reader thought the button was broken (JB206-8, Lucas 11-16
 * audit). The home address is everyone's way in, so leaving it says nothing.
 */
export function refusedPageNotice(pathname: string, features: readonly string[] = []): string | null {
  if (pathname === "/" || pathname === "/dashboard") return null;
  // A consultant's page is a module head office ticks per project (JB210,
  // walk 11-17 F-A3): he is told so, in the server's own words.
  if (features.includes("consultant_menu")) {
    // JB225: 「总部没有为您在这个项目开通这一项。如需查看，请联系总部。」 when
    // another item of the page's module is open to him.
    const page = ITEM_PAGES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (page && features.some((key) => key.startsWith(page[1]))) {
      return "errors.api.consultant_sub_module_not_granted";
    }
    return "errors.api.consultant_module_not_granted";
  }
  return "common.pageNotOpen";
}
