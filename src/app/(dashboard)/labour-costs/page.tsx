import { redirect } from "next/navigation";

import { labourTabHref, plainQuery } from "@/lib/labour-links";

/**
 * 人工费用统计 is a tab on the 人员名单 page now (JB295b, 客户 11-28 「在现有人员
 * 名单页面上方」): the old address opens that tab, with its project and month.
 */
export default async function LabourCostsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = plainQuery(await searchParams);
  redirect(labourTabHref("labour", { project: query.project, month: query.month, view: query.view }));
}
