/** Portal navigation and route access derived from the backend feature list. */

import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FileText,
  FolderArchive,
  Gauge,
  History,
  Handshake,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  Package,
  Receipt,
  Scale,
  ScanSearch,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  UserRound,
  Users,
  WalletCards,
  Warehouse,
  Workflow,
} from "lucide-react";

import type { Portal } from "@/interfaces/auth";

export type PortalFeatureKey =
  | "dashboard"
  | "cloud_weighing"
  | "weighing_parameters"
  | "contractor_partners"
  | "recycler_review"
  | "transaction_reports"
  | "projects"
  | "suppliers"
  | "recyclers"
  | "material_receipts"
  | "waste_dispatches"
  | "recycling_records"
  | "attendance"
  | "payment_proofs"
  | "progress"
  | "safety"
  | "material_quantity_report"
  | "material_cost_report"
  | "users"
  | "roles"
  | "user_logs"
  | "activity_logs"
  | "partnerships"
  | "yards"
  | "weighbridges"
  | "vehicles"
  | "drivers"
  | "waste_orders"
  | "driver_tasks"
  | "weighing_records"
  | "payment_status"
  | "documents"
  | "approvals"
  | "evidence"
  | "notifications"
  | "driver_gps"
  | "site_gps"
  | "integrations";

export interface FeatureNavItem {
  /** Exact key returned by `GET /api/auth/me/`. */
  feature: PortalFeatureKey;
  /** Message key under `nav`. */
  labelKey: PortalFeatureKey;
  href: string;
  icon: LucideIcon;
  /** Message key under `nav.group`. */
  group: "overview" | "operations" | "finance" | "system";
  /** Match only the canonical page instead of every descendant route. */
  exact?: boolean;
  /**
   * Route families owned by the feature in addition to its canonical page.
   *
   * Some workflows still use established detail routes (for example
   * `/companies/:id` and `/settlements/:id`). Keeping those aliases here makes
   * the guard and the sidebar share one source of truth.
   */
  routePrefixes?: readonly string[];
}

export interface NavGroup {
  key: FeatureNavItem["group"];
  items: FeatureNavItem[];
}

/**
 * Requirement-ordered feature registry.
 *
 * The arrays deliberately mirror `accounts.portal_features.FEATURES_BY_PORTAL`
 * in the backend. Permissions and audiences do not belong here: the backend
 * has already applied them before returning `CurrentUser.features`.
 */
export const PORTAL_NAVIGATION = {
  MSE_ADMIN: [
    item("dashboard", "/dashboard", LayoutDashboard, "overview"),
    item("cloud_weighing", "/weighing", Gauge, "operations"),
    item(
      "weighing_parameters",
      "/detection-settings",
      SlidersHorizontal,
      "operations",
    ),
    item(
      "contractor_partners",
      "/contractor-partners",
      Building2,
      "operations",
      ["/companies", "/users/create"],
    ),
    item(
      "recycler_review",
      "/recycler-review",
      BadgeCheck,
      "operations",
      ["/companies", "/users/create"],
    ),
    item("integrations", "/integrations", SlidersHorizontal, "system"),
    item("activity_logs", "/audit-logs", History, "system"),
    item(
      "transaction_reports",
      "/reports",
      FileText,
      "finance",
      undefined,
      true,
    ),
  ],
  MSE_TRACE: [
    item("dashboard", "/dashboard", LayoutDashboard, "overview"),
    item("projects", "/projects", Package, "operations"),
    item("suppliers", "/suppliers", Truck, "operations"),
    item("recyclers", "/recyclers", Handshake, "operations"),
    item("material_receipts", "/receipts", ClipboardList, "operations"),
    item("waste_dispatches", "/dispatches", Inbox, "operations", [
      "/deductions",
    ]),
    item("recycling_records", "/weighing", Scale, "operations"),
    item("attendance", "/attendance", CalendarCheck, "operations"),
    item(
      "payment_proofs",
      "/payment-proofs",
      WalletCards,
      "operations",
      ["/settlements"],
    ),
    item("progress", "/progress", ChartNoAxesCombined, "operations"),
    item("safety", "/safety", ShieldAlert, "operations"),
    item("site_gps", "/site-gps", MapPinned, "operations"),
    item("documents", "/documents", FolderArchive, "operations"),
    item("approvals", "/approvals", Workflow, "operations"),
    item("evidence", "/evidence", ScanSearch, "operations"),
    item(
      "material_quantity_report",
      "/reports/material-quantity",
      ClipboardCheck,
      "finance",
    ),
    item(
      "material_cost_report",
      "/reports/material-cost",
      Receipt,
      "finance",
    ),
    item("users", "/users", Users, "system"),
    item("roles", "/roles", KeyRound, "system"),
    item("integrations", "/integrations", SlidersHorizontal, "system"),
    item("user_logs", "/login-records", FileClock, "system"),
    item("activity_logs", "/audit-logs", History, "system"),
    item("notifications", "/notifications", Bell, "system"),
  ],
  MSE_SCRAP: [
    item("dashboard", "/dashboard", LayoutDashboard, "overview"),
    item("partnerships", "/partnerships", Handshake, "operations"),
    item("yards", "/sites", Warehouse, "operations"),
    item("weighbridges", "/scales", Scale, "operations"),
    item("vehicles", "/vehicles", Truck, "operations"),
    item("drivers", "/drivers", UserRound, "operations"),
    item("waste_orders", "/waste-orders", Inbox, "operations", [
      "/incoming",
      "/dispatches",
    ]),
    item("driver_tasks", "/tasks", ClipboardList, "operations", [
      "/driver",
    ]),
    item("driver_gps", "/driver-gps", MapPinned, "operations"),
    item("weighing_records", "/weighing", Gauge, "operations", [
      "/gate",
      "/deductions",
    ]),
    item(
      "payment_status",
      "/settlements",
      WalletCards,
      "finance",
    ),
    item(
      "transaction_reports",
      "/reports",
      FileText,
      "finance",
      undefined,
      true,
    ),
    item("documents", "/documents", FolderArchive, "system"),
    item("approvals", "/approvals", Workflow, "system"),
    item("evidence", "/evidence", ScanSearch, "system"),
    item("users", "/users", Users, "system"),
    item("roles", "/roles", KeyRound, "system"),
    item("integrations", "/integrations", SlidersHorizontal, "system"),
    item("user_logs", "/login-records", FileClock, "system"),
    item("activity_logs", "/audit-logs", History, "system"),
    item("notifications", "/notifications", Bell, "system"),
  ],
} as const satisfies Record<Portal, readonly FeatureNavItem[]>;

function item(
  feature: PortalFeatureKey,
  href: string,
  icon: LucideIcon,
  group: FeatureNavItem["group"],
  routePrefixes?: readonly string[],
  exact = false,
): FeatureNavItem {
  return {
    feature,
    labelKey: feature,
    href,
    icon,
    group,
    routePrefixes,
    exact,
  };
}

/** Groups containing only features returned for this signed-in user. */
export function visibleNavigation(
  portal: Portal | undefined,
  features: readonly string[] | undefined,
): NavGroup[] {
  if (!portal || !features) return [];

  const visible = new Set(features);
  const groups: NavGroup[] = [];

  for (const navItem of PORTAL_NAVIGATION[portal]) {
    if (!visible.has(navItem.feature)) continue;
    const lastGroup = groups.at(-1);
    if (lastGroup?.key === navItem.group) {
      lastGroup.items.push(navItem);
    } else {
      groups.push({ key: navItem.group, items: [navItem] });
    }
  }

  return groups;
}

/** Whether a navigation entry matches the current route. */
export function isActivePath(
  href: string,
  pathname: string,
  exact = false,
): boolean {
  const route = href.split("?", 1)[0];
  if (exact || route === "/dashboard") return pathname === route;
  return pathname === route || pathname.startsWith(`${route}/`);
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

interface PermissionRouteRule {
  pattern: string;
  permission: string;
}

/**
 * Pages that expose a write workflow need the corresponding action permission,
 * not only the feature's read permission. The API remains authoritative; this
 * prevents a read-only user from opening a form that can never be submitted.
 */
const PERMISSION_ROUTE_RULES: readonly PermissionRouteRule[] = [
  { pattern: "/companies/create", permission: "company.create" },
  { pattern: "/companies/:id/edit", permission: "company.update" },
  { pattern: "/projects/create", permission: "project.create" },
  { pattern: "/projects/:id/edit", permission: "project.update" },
  { pattern: "/suppliers/create", permission: "supplier.create" },
  { pattern: "/suppliers/:id/edit", permission: "supplier.update" },
  { pattern: "/receipts/create", permission: "receipt.create" },
  { pattern: "/receipts/:id/edit", permission: "receipt.update" },
  { pattern: "/dispatches/create", permission: "dispatch.create" },
  { pattern: "/dispatches/:id/edit", permission: "dispatch.update" },
  { pattern: "/deductions/create", permission: "deduction.create" },
  { pattern: "/sites/create", permission: "scale.manage" },
  { pattern: "/sites/:id/edit", permission: "scale.manage" },
  { pattern: "/scales/create", permission: "scale.manage" },
  { pattern: "/scales/:id/edit", permission: "scale.manage" },
  { pattern: "/vehicles/create", permission: "fleet.manage" },
  { pattern: "/vehicles/:id/edit", permission: "fleet.manage" },
  { pattern: "/drivers/create", permission: "fleet.manage" },
  { pattern: "/drivers/:id/edit", permission: "fleet.manage" },
  { pattern: "/tasks/create", permission: "task.assign" },
  { pattern: "/users/create", permission: "user.create" },
  { pattern: "/users/:id/edit", permission: "user.update" },
  { pattern: "/roles/create", permission: "role.create" },
  { pattern: "/roles/:id/edit", permission: "role.update" },
  { pattern: "/gate", permission: "weighing.operate" },
];

function matchesPattern(pathname: string, pattern: string): boolean {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  return (
    pathParts.length === patternParts.length &&
    patternParts.every(
      (part, index) => part.startsWith(":") || part === pathParts[index],
    )
  );
}

function hasPermission(
  permissions: readonly string[],
  permission: string,
  isSuperuser: boolean,
): boolean {
  return isSuperuser || permissions.includes(permission);
}

/**
 * Whether the current portal feature list owns a dashboard route.
 *
 * Unknown routes are denied instead of becoming an accidental bypass when a
 * new page is added. Profile is account-level rather than a sidebar feature.
 */
export function isRouteAllowed(
  portal: Portal,
  features: readonly string[],
  pathname: string,
  permissions: readonly string[] = [],
  isSuperuser = false,
): boolean {
  if (matchesPrefix(pathname, "/profile")) return true;

  // Monitoring is an internal support page, intentionally absent from the
  // customer's six-item Admin sidebar.
  if (matchesPrefix(pathname, "/monitoring")) {
    return (
      portal === "MSE_ADMIN" &&
      hasPermission(permissions, "platform.monitor", isSuperuser)
    );
  }

  const enabled = new Set(features);
  const owned = PORTAL_NAVIGATION[portal].some((navItem) => {
    if (!enabled.has(navItem.feature)) return false;
    const canonical = navItem.href.split("?", 1)[0];
    if (
      navItem.exact
        ? pathname === canonical
        : matchesPrefix(pathname, canonical)
    ) {
      return true;
    }
    return (navItem.routePrefixes ?? []).some((prefix) =>
      matchesPrefix(pathname, prefix),
    );
  });

  if (!owned) return false;

  const actionRule = PERMISSION_ROUTE_RULES.find((rule) =>
    matchesPattern(pathname, rule.pattern),
  );
  return (
    actionRule === undefined ||
    hasPermission(permissions, actionRule.permission, isSuperuser)
  );
}

/** A driver gets the phone workflow; dispatchers and admins get the console. */
export function isDriverOnlyAccount(
  portal: Portal,
  permissions: readonly string[],
  isSuperuser = false,
): boolean {
  if (portal !== "MSE_SCRAP" || isSuperuser) return false;
  const held = new Set(permissions);
  return (
    held.has("task.view") &&
    held.has("task.submit") &&
    !held.has("task.assign") &&
    !held.has("task.view_all")
  );
}

/** First valid console page, preserving the backend's feature order. */
export function firstAllowedDashboardPath(
  portal: Portal,
  features: readonly string[],
): string {
  const enabled = new Set(features);
  return (
    PORTAL_NAVIGATION[portal].find((navItem) => enabled.has(navItem.feature))
      ?.href ?? "/profile"
  );
}

/**
 * Drivers use the phone-first task surface rather than the desktop console.
 * Permission checks remain appropriate here because both administrators and
 * drivers receive the same `driver_tasks` feature.
 */
export function landingPathFor(can: (code: string) => boolean): string {
  if (can("field_position.submit") && !can("project.view_all")) {
    return "/field-staff";
  }
  if (
    can("task.view") &&
    can("task.submit") &&
    !can("task.assign") &&
    !can("task.view_all")
  ) {
    return "/driver";
  }
  return "/dashboard";
}
