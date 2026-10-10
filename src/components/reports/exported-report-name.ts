import type { useTranslations } from "next-intl";

/** The root translator (`useTranslations()`, no namespace). */
type Translator = ReturnType<typeof useTranslations>;

/**
 * The name of an exported report in the MSE Admin report centre's history.
 *
 * That history lists every export on the platform (`reports.archive`), not
 * only the platform's own reports, so a row may be a contractor's report, its
 * 现场看板, or a recycler's report. Each is named from its own centre's
 * catalogue, with whose it is in front - 「建筑商 · 进度与照片报表」,
 * 「回收商 · 库存」. A type no catalogue knows reads 「其他报表」: a raw message
 * key is never shown.
 *
 * The platform's own names come first. `commission` is both a platform and a
 * recycler report; the history row does not say which centre made it, so it
 * reads as the platform's 「平台佣金报表」 - both are reports of the platform's
 * commission.
 */
export function exportedReportName(t: Translator, reportType: string): string {
  const type = String(reportType ?? "");
  if (type && t.has(`adminReports.reportType.${type}`)) {
    return t(`adminReports.reportType.${type}`);
  }
  if (type === "dashboard") {
    return `${t("companies.type.CONTRACTOR")} · ${t("contractorDashboard.export.title")}`;
  }
  if (type && t.has(`contractorReports.type.${type}`)) {
    return `${t("companies.type.CONTRACTOR")} · ${t(`contractorReports.type.${type}`)}`;
  }
  if (type && t.has(`recyclerReports.type.${type}`)) {
    return `${t("companies.type.RECYCLER")} · ${t(`recyclerReports.type.${type}`)}`;
  }
  return t("adminReports.otherReport");
}
