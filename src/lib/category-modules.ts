/**
 * The Category Management modules, and how an old address finds one.
 *
 * Plain data with no React in it, so the server-side redirects of the retired
 * `/material-columns` and `/project-categories` screens can read it too
 * (D-263): a constant exported from a "use client" file is not a value on the
 * server.
 */

// No "field" (现场资料分类, D-285) and no "claim" (D-286): the first was never
// a business module the customer defined, the second duplicated 杂费报销分类.
export const CATEGORY_MODULE_KEYS = [
  "material",
  "document",
  "equipment",
  "progress",
  "phase",
  "ehs",
  "recycle",
  "debris",
  // D-274, D-275: consultant submissions and sundry claims each file under
  // categories of their own.
  "consultant",
  "sundry",
] as const;

export type CategoryModuleKey = (typeof CATEGORY_MODULE_KEYS)[number];

/** The module each `ProjectCategory.kind` is listed under. */
export const KIND_MODULE: Record<string, CategoryModuleKey> = {
  MATERIAL: "material",
  EQUIPMENT: "equipment",
  PROGRESS: "progress",
  EHS: "ehs",
  CONSTRUCTION_WASTE: "debris",
  CONSULTANT: "consultant",
  SUNDRY: "sundry",
};

export const isCategoryModuleKey = (value: string): value is CategoryModuleKey =>
  (CATEGORY_MODULE_KEYS as readonly string[]).includes(value);

type Param = string | string[] | undefined;
const first = (value: Param) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/**
 * Where an old link lands on Category Management.
 *
 * `/project-categories?kind=EQUIPMENT&project=…&create=1` keeps its project,
 * its module and its "open the create form" request, so a bookmark or a
 * dashboard shortcut still arrives where it meant to. An unknown or missing
 * kind - including the retired site-record and period-claim kinds - lands on
 * the material categories, the first module on the screen.
 */
export function categoryManagementAddress(
  params: Record<string, Param>,
  fallbackModule: CategoryModuleKey = "material",
): string {
  const query = new URLSearchParams();
  const project = first(params.project);
  if (project) query.set("project", project);
  const requested = first(params.module);
  const kind = first(params.kind).toUpperCase();
  const moduleKey = isCategoryModuleKey(requested)
    ? requested
    : (KIND_MODULE[kind] ?? fallbackModule);
  query.set("module", moduleKey);
  if (first(params.create) === "1") query.set("create", "1");
  return `/category-management?${query.toString()}`;
}

/**
 * The budget warning lines as typed, or null when they cannot be read.
 *
 * Null rather than an empty list, because an empty list is a legitimate
 * answer meaning "do not warn me". Sending it for a typo like "80, ninety"
 * would turn a slip into switching the warnings off, with the form showing
 * nothing wrong. The server checks the same 1-500 range (F-466).
 */
export function parseAlertPercentages(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(",").map((part) => part.trim());
  const numbers = parts.map(Number);
  if (
    numbers.some(
      (value, index) =>
        parts[index] === "" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 500,
    )
  ) {
    return null;
  }
  return [...new Set(numbers)].sort((a, b) => a - b);
}
