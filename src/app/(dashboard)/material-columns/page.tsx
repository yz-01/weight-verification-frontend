import { redirect } from "next/navigation";

import { categoryManagementAddress } from "@/lib/category-modules";

/**
 * Retired (D-263). Lucas 2026-09-25: 「我觉得这页不需要了 /material-columns，
 * 全部information写在栏目管理那里就好了」. The material columns - their filed
 * deliveries, spend against budget, tonnes and warning lines - are the
 * 「材料分类」 module of Category Management now, so an old link lands there.
 */
export default async function MaterialColumnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(categoryManagementAddress({ ...params, module: "material" }));
}
