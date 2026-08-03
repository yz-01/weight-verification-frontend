/**
 * The sidebar, derived rather than hardcoded.
 *
 * One app serves three very different consoles. Rather than three route trees,
 * every entry declares which audiences it belongs to and which permission it
 * needs; the sidebar then renders whatever the signed-in user can actually
 * reach. A contractor never sees a weighbridge entry, and a site clerk never
 * sees billing, without either case needing its own branch.
 */

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  Inbox,
  ScanLine,
  Scale as ScaleIcon,
  FileClock,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  Megaphone,
  Package,
  Receipt,
  Scale,
  Settings,
  SlidersHorizontal,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

import type { Audience } from "@/interfaces/auth";

export interface NavItem {
  /** Message key under `nav`. */
  key: string;
  href: string;
  icon: LucideIcon;
  /** Audiences this entry belongs to. */
  audiences: Audience[];
  /** Permission required to see it. Omitted means every audience member. */
  permission?: string;
}

export interface NavGroup {
  /** Message key under `nav.group`. */
  key: string;
  items: NavItem[];
}

const PLATFORM: Audience = "PLATFORM";
const CONTRACTOR: Audience = "CONTRACTOR";
const RECYCLER: Audience = "RECYCLER";
const EVERYONE: Audience[] = [PLATFORM, CONTRACTOR, RECYCLER];

export const NAVIGATION: NavGroup[] = [
  {
    key: "overview",
    items: [
      {
        key: "dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        audiences: EVERYONE,
      },
    ],
  },
  {
    key: "operations",
    items: [
      {
        key: "projects",
        href: "/projects",
        icon: Package,
        audiences: [CONTRACTOR],
        permission: "project.view",
      },
      {
        key: "suppliers",
        href: "/suppliers",
        icon: Truck,
        audiences: [CONTRACTOR],
        permission: "supplier.view",
      },
      {
        key: "receipts",
        href: "/receipts",
        icon: ClipboardList,
        audiences: [CONTRACTOR],
        permission: "receipt.view",
      },
      {
        key: "dispatches",
        href: "/dispatches",
        icon: Truck,
        audiences: [CONTRACTOR, RECYCLER],
        permission: "dispatch.view",
      },
      {
        // The yard's inbox: loads on their way here. Kept apart from the
        // dispatch list because that one also holds everything already
        // weighed and settled, and this is the screen a gate leaves open.
        key: "incoming",
        href: "/incoming",
        icon: Inbox,
        audiences: [RECYCLER],
        permission: "dispatch.view",
      },
      {
        key: "tasks",
        href: "/tasks",
        icon: ClipboardList,
        audiences: [RECYCLER],
        permission: "task.view",
      },
    ],
  },
  {
    key: "fleet",
    items: [
      {
        key: "vehicles",
        href: "/vehicles",
        icon: Truck,
        audiences: [RECYCLER],
        permission: "fleet.view",
      },
      {
        key: "drivers",
        href: "/drivers",
        icon: UserRound,
        audiences: [RECYCLER],
        permission: "fleet.view",
      },
    ],
  },
  {
    key: "weighing",
    items: [
      {
        // Only the operator sees this: it is the barrier, not a report.
        key: "gate",
        href: "/gate",
        icon: ScanLine,
        audiences: [RECYCLER],
        permission: "weighing.operate",
      },
      {
        key: "weighing",
        href: "/weighing",
        icon: Gauge,
        audiences: [RECYCLER, PLATFORM],
        // Contractors see the weighing of their own loads — being able to
        // check the curve is what makes a settlement verifiable rather than
        // something to be taken on trust.
        permission: "weighing.view",
      },
      {
        key: "sites",
        href: "/sites",
        icon: Warehouse,
        audiences: [RECYCLER, PLATFORM],
        permission: "scale.view",
      },
      {
        key: "scales",
        href: "/scales",
        icon: Scale,
        audiences: [RECYCLER, PLATFORM],
        permission: "scale.view",
      },
      {
        key: "detectionSettings",
        href: "/detection-settings",
        icon: SlidersHorizontal,
        audiences: [RECYCLER, PLATFORM],
        permission: "weighing.rule_view",
      },
    ],
  },
  {
    key: "finance",
    items: [
      {
        key: "deductions",
        href: "/deductions",
        icon: ScaleIcon,
        audiences: [CONTRACTOR, RECYCLER],
        permission: "deduction.view",
      },
      {
        key: "settlements",
        href: "/settlements",
        icon: Receipt,
        audiences: [CONTRACTOR, RECYCLER],
        permission: "settlement.view",
      },
      {
        key: "payments",
        href: "/payments",
        icon: Wallet,
        audiences: [CONTRACTOR, RECYCLER],
        permission: "payment.view",
      },
      {
        key: "billing",
        href: "/billing",
        icon: Wallet,
        audiences: [PLATFORM],
        permission: "billing.view",
      },
      {
        key: "commission",
        href: "/commission",
        icon: Receipt,
        audiences: [PLATFORM],
        permission: "commission.view",
      },
      {
        key: "reports",
        href: "/reports",
        icon: FileText,
        audiences: EVERYONE,
        permission: "report.view",
      },
    ],
  },
  {
    key: "customers",
    items: [
      {
        key: "companies",
        href: "/companies",
        icon: Building2,
        audiences: [PLATFORM],
        permission: "company.view",
      },
      {
        key: "tickets",
        href: "/tickets",
        icon: LifeBuoy,
        audiences: EVERYONE,
        permission: "ticket.view",
      },
      {
        key: "announcements",
        href: "/announcements",
        icon: Megaphone,
        audiences: EVERYONE,
        permission: "announcement.view",
      },
    ],
  },
  {
    key: "system",
    items: [
      {
        key: "users",
        href: "/users",
        icon: Users,
        audiences: EVERYONE,
        permission: "user.view",
      },
      {
        key: "roles",
        href: "/roles",
        icon: KeyRound,
        audiences: EVERYONE,
        permission: "role.view",
      },
      {
        key: "auditLogs",
        href: "/audit-logs",
        icon: FileClock,
        audiences: EVERYONE,
        permission: "audit.view",
      },
      {
        key: "loginRecords",
        href: "/login-records",
        icon: LogIn,
        audiences: EVERYONE,
        permission: "audit.view",
      },
      {
        key: "settings",
        href: "/settings",
        icon: Settings,
        audiences: [PLATFORM],
        permission: "platform.maintenance",
      },
    ],
  },
];

/** Groups with at least one entry the given user can reach. */
export function visibleNavigation(
  audience: Audience | undefined,
  can: (code: string) => boolean,
): NavGroup[] {
  if (!audience) return [];
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.audiences.includes(audience) &&
        (item.permission === undefined || can(item.permission)),
    ),
  })).filter((group) => group.items.length > 0);
}

/**
 * Whether a nav entry matches the current path.
 *
 * Prefix matching so `/companies/abc/edit` keeps `/companies` highlighted,
 * with `/dashboard` matched exactly because every path would otherwise be a
 * prefix match against the root of the tree.
 */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}


/**
 * Where a signed-in user belongs.
 *
 * A driver's account carries `task.submit` and nothing that would fill a
 * sidebar — sending them to the console would show a shell with one entry in
 * it, on a phone, which is not a console so much as an obstacle. They get the
 * driver page instead.
 *
 * Anyone who can also assign trips runs the yard, so the console is right for
 * them even though they hold the same submit permission.
 */
export function landingPathFor(can: (code: string) => boolean): string {
  if (can("task.submit") && !can("task.assign") && !can("task.view_all")) {
    return "/driver";
  }
  return "/dashboard";
}
