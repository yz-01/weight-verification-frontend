import { redirect } from "next/navigation";

import { labourTabHref, plainQuery } from "@/lib/labour-links";

/**
 * 人工月结单 is a tab on the 人员名单 page now (JB295b, 客户 11-28 「在现有人员
 * 名单页面上方」): the old address opens that tab, on the same state and statement.
 */
export default async function LabourStatementsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = plainQuery(await searchParams);
  redirect(labourTabHref("statements", { state: query.state ?? query.tab, statement: query.statement }));
}
