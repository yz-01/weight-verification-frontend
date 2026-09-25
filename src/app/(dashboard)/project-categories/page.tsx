import { redirect } from "next/navigation";

import { categoryManagementAddress } from "@/lib/category-modules";

/**
 * Retired (D-263): every module's columns are created, edited and deleted on
 * Category Management, in dialogs, so there is no second column screen. An old
 * `?kind=…&project=…&create=1` address keeps its module, project and create
 * request on the way there.
 */
export default async function ProjectCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(categoryManagementAddress(await searchParams));
}
