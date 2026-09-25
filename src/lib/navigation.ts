import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Box,
  Building2,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  CreditCard,
  FileClock,
  FileText,
  FolderArchive,
  Gauge,
  Handshake,
  HeadphonesIcon,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  MessageSquare,
  Package,
  QrCode,
  Receipt,
  Scale,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Workflow,
  HardHat,
  ListTree,
} from "lucide-react";

import type { Portal } from "@/interfaces/auth";

export type PortalFeatureKey =
  | "dashboard"
  | "cloud_weighing"
  | "transaction_reports"
  | "projects"
  | "project_categories"
  | "field_tasks"
  | "suppliers"
  | "equipment"
  | "recyclers"
  | "material_receipts"
  | "material_outgoing"
  | "site_disposals"
  | "waste_outgoing"
  | "waste_dispatches"
  | "recycling_records"
  | "attendance"
  | "payment_proofs"
  | "progress"
  | "schedule"
  | "safety"
  | "hazard_rectification"
  | "material_quantity_report"
  | "material_cost_report"
  | "users"
  | "roles"
  | "user_logs"
  | "activity_logs"
  | "partnerships"
  | "customer_management"
  | "yards"
  | "weighbridges"
  | "vehicles"
  | "drivers"
  | "waste_orders"
  | "driver_tasks"
  | "weighing_records"
  | "inventory_management"
  | "outbound_management"
  | "payment_status"
  | "documents"
  | "approvals"
  | "consultant_applications"
  | "evidence"
  | "notifications"
  | "driver_gps"
  | "site_gps"
  | "geofences"
  | "site_access"
  | "emergency_list"
  | "company_settings"
  | "integrations"
  | "company_management"
  | "user_management"
  | "subscription_management"
  | "billing_commission"
  | "platform_monitoring"
  | "qr_code_management"
  | "report_center"
  | "notification_center"
  | "platform_settings"
  | "audit_log_center"
  | "sales_commission"
  | "customer_service"
  | "technical_support"
  | "partner_management"
  | "asset_management"
  | "cloud_service_management";

export interface FeatureNavItem {
  /** Exact key returned by `GET /api/auth/get_me/`. */
  feature: PortalFeatureKey;
  /** Message key under `nav`. */
  labelKey: string;
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
  /** Requirement-numbered pages shown beneath the main Admin module. */
  children?: readonly FeatureNavChild[];
}

export interface FeatureNavChild {
  key: string;
  /** Full message key, usually under `nav.submodule`. */
  labelKey: string;
  href: string;
  /** Optional feature required to see and open this child route. */
  feature?: PortalFeatureKey;
  /** Optional action permission required to expose this child entry. */
  requiredPermission?: string;
  /**
   * Still a route the user may open, but not listed in the sidebar or the
   * module search. For a page the customer asked to take out of the menu
   * without taking away (「证据归档」, 第 67 条: 只移除页面入口，不要删除任何
   * 底层证据资料).
   */
  menuHidden?: boolean;
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
    item(
      "dashboard",
      "/dashboard",
      LayoutDashboard,
      "overview",
      undefined,
      false,
      [
        child("1.2.1", "nav.submodule.dashboardMap", "/dashboard/map"),
        child(
          "1.2.2",
          "nav.submodule.dashboardPlatform",
          "/dashboard/platform",
        ),
        child(
          "1.2.3",
          "nav.submodule.dashboardBusiness",
          "/dashboard/business",
        ),
        child(
          "1.2.4",
          "nav.submodule.dashboardSubscriptions",
          "/dashboard/subscriptions",
        ),
        child(
          "1.2.5",
          "nav.submodule.dashboardCommission",
          "/dashboard/commission",
        ),
        child("1.2.6", "nav.submodule.dashboardPending", "/dashboard/pending"),
        child("1.2.7", "nav.submodule.dashboardCwe", "/dashboard/cwe"),
        child(
          "1.2.8",
          "nav.submodule.dashboardNotifications",
          "/dashboard/notifications",
        ),
        child(
          "1.2.9",
          "nav.submodule.dashboardQuickActions",
          "/dashboard/quick-actions",
        ),
        child("1.2.10", "nav.submodule.dashboardTrends", "/dashboard/trends"),
        child(
          "1.2.11",
          "nav.submodule.dashboardSystemStatus",
          "/dashboard/system-status",
        ),
      ],
    ),
    item(
      "company_management",
      "/companies",
      Building2,
      "operations",
      undefined,
      false,
      [
        child("2.2.1", "nav.submodule.companyCreate", "/companies/create"),
        child(
          "2.2.2",
          "nav.submodule.companyDirectory",
          "/companies/admin/directory",
        ),
        child(
          "2.2.3",
          "nav.submodule.companyReview",
          "/companies/admin/review",
        ),
        child(
          "2.2.6",
          "nav.submodule.companyProjects",
          "/companies/admin/projects",
        ),
        child(
          "2.2.7",
          "nav.submodule.companyRecyclerData",
          "/companies/admin/recyclers",
        ),
      ],
    ),
    item(
      "user_management",
      "/users",
      Users,
      "operations",
      ["/login-records"],
      false,
      [
        child(
          "3.2.1",
          "nav.submodule.userManagement",
          "/users/admin/management",
        ),
      ],
    ),
    item(
      "subscription_management",
      "/subscriptions",
      CreditCard,
      "finance",
      undefined,
      false,
      [
        child(
          "4.2.1",
          "nav.submodule.subscriptionPlans",
          "/subscriptions/plans",
        ),
        child(
          "4.2.2",
          "nav.submodule.companySubscriptions",
          "/subscriptions/companies",
        ),
        child(
          "4.2.6",
          "nav.submodule.expiryReminders",
          "/subscriptions/reminders",
        ),
      ],
    ),
    item(
      "billing_commission",
      "/billing",
      Receipt,
      "finance",
      undefined,
      false,
      [
        child("5.2.1", "nav.submodule.invoiceSearch", "/billing/search"),
        child(
          "5.2.3",
          "nav.submodule.automaticBilling",
          "/billing/automatic-billing",
        ),
        child("5.2.4", "nav.submodule.collections", "/billing/collections"),
        child(
          "5.2.5",
          "nav.submodule.paymentProofs",
          "/billing/payment-proofs",
        ),
        child(
          "5.2.6",
          "nav.submodule.commissionRules",
          "/billing/commission-rules",
        ),
        child("5.2.9", "nav.submodule.financialReports", "/billing/reports"),
      ],
    ),
    item(
      "platform_monitoring",
      "/monitoring",
      Gauge,
      "system",
      undefined,
      false,
      [
        child(
          "6.2.1",
          "nav.submodule.livePlatform",
          "/monitoring/live-platform",
        ),
        child("6.2.2", "nav.submodule.cweMonitoring", "/monitoring/cwe"),
        child("6.2.3", "nav.submodule.cctvMonitoring", "/monitoring/cctv"),
        child("6.2.4", "nav.submodule.anprMonitoring", "/monitoring/anpr"),
        child(
          "6.2.5",
          "nav.submodule.apiGatewayMonitoring",
          "/monitoring/api-gateway",
        ),
        child("6.2.6", "nav.submodule.syncMonitoring", "/monitoring/sync"),
        child(
          "6.2.7",
          "nav.submodule.exceptionMonitoring",
          "/monitoring/exceptions",
        ),
        child(
          "6.2.10",
          "nav.submodule.monitoringRecords",
          "/monitoring/records",
        ),
        // The background work behind the recovery and exception counters.
        child("A6.2.9", "nav.submodule.platformJobs", "/monitoring/jobs"),
      ],
    ),
    item(
      "qr_code_management",
      "/qr-codes",
      QrCode,
      "operations",
      undefined,
      false,
      [
        child("7.2.1", "nav.submodule.qrTypes", "/qr-codes/types"),
        child("7.2.5", "nav.submodule.qrScans", "/qr-codes/scans"),
        child("7.2.6", "nav.submodule.qrAnomalies", "/qr-codes/anomalies"),
      ],
    ),
    item(
      "cloud_weighing",
      "/weighing",
      Scale,
      "operations",
      ["/detection-settings", "/scales"],
      false,
      [
        child("8.2.1", "nav.submodule.cweScales", "/weighing/admin/scales"),
        child(
          "8.2.2",
          "nav.submodule.cweConnections",
          "/weighing/admin/connections",
        ),
        child(
          "8.2.3",
          "nav.submodule.cweLiveWeighing",
          "/weighing/admin/live-weighing",
        ),
        child(
          "8.2.4",
          "nav.submodule.cweAnomalies",
          "/weighing/admin/anomalies",
        ),
        child("8.2.5", "nav.submodule.cweSearch", "/weighing/admin/search"),
        child(
          "8.2.6",
          "nav.submodule.cweStatistics",
          "/weighing/admin/statistics",
        ),
        child(
          "8.2.7",
          "nav.submodule.cweServiceStatus",
          "/weighing/admin/service-status",
        ),
      ],
    ),
    item("report_center", "/reports", FileText, "finance", undefined, false, [
      child("9.2.8", "nav.submodule.reportSearch", "/reports/search"),
      child("9.2.10", "nav.submodule.reportHistory", "/reports/history"),
    ]),
    item(
      "notification_center",
      "/notifications",
      Bell,
      "system",
      undefined,
      false,
      [
        child(
          "10.2.7",
          "nav.submodule.myTasks",
          "/notifications/my-tasks",
        ),
        child(
          "10.2.8",
          "nav.submodule.notificationManagement",
          "/notifications/manage",
        ),
        child(
          "10.2.9",
          "nav.submodule.notificationChannels",
          "/notifications/channels",
        ),
        child(
          "10.2.10",
          "nav.submodule.notificationRecords",
          "/notifications/records",
        ),
      ],
    ),
    item(
      "platform_settings",
      "/system-settings",
      Settings,
      "system",
      ["/versions", "/integrations"],
      false,
      [
        child(
          "11.2.1",
          "nav.submodule.basicSettings",
          "/system-settings/basic",
        ),
        child("11.2.2", "nav.submodule.saasSettings", "/system-settings/saas"),
        child(
          "11.2.3",
          "nav.submodule.commissionSettings",
          "/system-settings/commission",
        ),
        child("11.2.4", "nav.submodule.cweSettings", "/system-settings/cwe"),
        child("11.2.5", "nav.submodule.cctvSettings", "/system-settings/cctv"),
        child("11.2.6", "nav.submodule.anprSettings", "/system-settings/anpr"),
        child("11.2.7", "nav.submodule.qrSettings", "/system-settings/qr"),
        child(
          "11.2.8",
          "nav.submodule.apiGatewaySettings",
          "/system-settings/api-gateway",
        ),
        child(
          "11.2.8A",
          "nav.submodule.integrationSettings",
          "/integrations",
          "integrations",
        ),
        child(
          "11.2.9",
          "nav.submodule.versionSettings",
          "/system-settings/versions",
        ),
        child(
          "11.2.10",
          "nav.submodule.notificationSettings",
          "/system-settings/notifications",
        ),
        child(
          "11.2.11",
          "nav.submodule.maintenanceSettings",
          "/system-settings/maintenance",
        ),
        child(
          "11.2.12",
          "nav.submodule.fieldSettings",
          "/system-settings/field",
        ),
      ],
    ),
    item(
      "audit_log_center",
      "/audit-logs",
      History,
      "system",
      undefined,
      false,
      [
        child("12.2.7", "nav.submodule.loginAudit", "/audit-logs/login"),
        child("12.2.8", "nav.submodule.auditSearch", "/audit-logs/search"),
        child(
          "12.2.10",
          "nav.submodule.immutableAudit",
          "/audit-logs/immutable",
        ),
      ],
    ),
    item(
      "sales_commission",
      "/sales",
      TrendingUp,
      "finance",
      undefined,
      false,
      [
        child("13.2.1", "nav.submodule.salesPeople", "/sales/people"),
        child("13.2.3", "nav.submodule.salesTerritories", "/sales/territories"),
        child("13.2.4", "nav.submodule.salesHierarchy", "/sales/hierarchy"),
        child(
          "13.2.5",
          "nav.submodule.customerAssignments",
          "/sales/assignments",
        ),
        child("13.2.6", "nav.submodule.commissionRuleTypes", "/sales/rules"),
        child("13.2.7", "nav.submodule.commissionSchemes", "/sales/schemes"),
        child("13.2.8", "nav.submodule.salesTerms", "/sales/terms"),
        child("13.2.9", "nav.submodule.salesPayouts", "/sales/payouts"),
        child("13.2.10", "nav.submodule.teamPerformance", "/sales/performance"),
        child(
          "13.2.11",
          "nav.submodule.salesSettlements",
          "/sales/settlements",
        ),
        child("13.2.12", "nav.submodule.salesReports", "/sales/reports"),
      ],
    ),
    item(
      "customer_service",
      "/customer-service",
      MessageSquare,
      "operations",
      undefined,
      false,
      [
        child(
          "14.2.1",
          "nav.submodule.crmCustomers",
          "/customer-service/customers",
        ),
        child(
          "14.2.2",
          "nav.submodule.crmEnquiries",
          "/customer-service/enquiries",
        ),
        child(
          "14.2.3",
          "nav.submodule.crmTraining",
          "/customer-service/training",
        ),
        child("14.2.4", "nav.submodule.crmVisits", "/customer-service/visits"),
        child(
          "14.2.5",
          "nav.submodule.crmFeedback",
          "/customer-service/feedback",
        ),
        child(
          "14.2.6",
          "nav.submodule.crmService",
          "/customer-service/service",
        ),
        child(
          "14.2.7",
          "nav.submodule.crmReports",
          "/customer-service/reports",
        ),
      ],
    ),
    item(
      "technical_support",
      "/support-tickets",
      HeadphonesIcon,
      "operations",
      undefined,
      false,
      [
        child(
          "15.2.1",
          "nav.submodule.supportTickets",
          "/support-tickets/tickets",
        ),
        child("15.2.3", "nav.submodule.supportBugs", "/support-tickets/bugs"),
        child("15.2.4", "nav.submodule.supportAPI", "/support-tickets/api"),
        child(
          "15.2.5",
          "nav.submodule.supportInstallations",
          "/support-tickets/installations",
        ),
        child(
          "15.2.6",
          "nav.submodule.supportMaintenance",
          "/support-tickets/maintenance",
        ),
        child(
          "15.2.7",
          "nav.submodule.supportReports",
          "/support-tickets/reports",
        ),
      ],
    ),
    item(
      "partner_management",
      "/partners",
      Handshake,
      "operations",
      undefined,
      false,
      [
        child(
          "16.2.1",
          "nav.submodule.partnerManagement",
          "/partners/management",
        ),
        child("16.2.3", "nav.submodule.partnerTypes", "/partners/types"),
        child(
          "16.2.4",
          "nav.submodule.partnerTerritories",
          "/partners/territories",
        ),
        child(
          "16.2.5",
          "nav.submodule.partnerCustomers",
          "/partners/customers",
        ),
        child(
          "16.2.6",
          "nav.submodule.partnerAgreements",
          "/partners/agreements",
        ),
        child("16.2.7", "nav.submodule.partnerSchemes", "/partners/schemes"),
        child(
          "16.2.8",
          "nav.submodule.partnerPerformance",
          "/partners/performance",
        ),
        child("16.2.9", "nav.submodule.partnerReports", "/partners/reports"),
      ],
    ),
    item("asset_management", "/assets", Box, "operations", undefined, false, [
      child("17.2.1", "nav.submodule.assetManagement", "/assets/management"),
      child("17.2.3", "nav.submodule.assetCategories", "/assets/categories"),
      child("17.2.4", "nav.submodule.assetPurchases", "/assets/purchases"),
      child("17.2.5", "nav.submodule.assetInventory", "/assets/inventory"),
      child("17.2.6", "nav.submodule.assetAssignments", "/assets/assignments"),
      child(
        "17.2.7",
        "nav.submodule.assetInstallations",
        "/assets/installations",
      ),
      child("17.2.8", "nav.submodule.assetTransfers", "/assets/transfers"),
      // Transfers can name a department, so the department list has to be
      // reachable from the same place.
      child("17.2.8", "nav.submodule.assetDepartments", "/assets/departments"),
      child("17.2.9", "nav.submodule.assetRepairs", "/assets/repairs"),
      child("17.2.10", "nav.submodule.assetMaintenance", "/assets/maintenance"),
      child("17.2.11", "nav.submodule.assetDisposals", "/assets/disposals"),
      child("17.2.13", "nav.submodule.assetReports", "/assets/reports"),
    ]),
    item(
      "cloud_service_management",
      "/cloud-services",
      Cloud,
      "system",
      undefined,
      false,
      [
        child(
          "A17.2.1",
          "nav.submodule.cloudServices",
          "/cloud-services/services",
        ),
        child(
          "A17.2.2",
          "nav.submodule.cloudCatalog",
          "/cloud-services/catalog",
        ),
        child(
          "A17.2.3",
          "nav.submodule.cloudVendors",
          "/cloud-services/vendors",
        ),
        child("A17.2.4", "nav.submodule.cloudPlans", "/cloud-services/plans"),
        child("A17.2.5", "nav.submodule.cloudUsage", "/cloud-services/usage"),
        child("A17.2.6", "nav.submodule.cloudCosts", "/cloud-services/costs"),
        child(
          "A17.2.7",
          "nav.submodule.cloudPricing",
          "/cloud-services/pricing",
        ),
        child("A17.2.8", "nav.submodule.cloudAlerts", "/cloud-services/alerts"),
        child(
          "A17.2.9",
          "nav.submodule.cloudAnalysis",
          "/cloud-services/analysis",
        ),
        child(
          "A17.2.10",
          "nav.submodule.cloudReports",
          "/cloud-services/reports",
        ),
      ],
    ),
  ],
  MSE_TRACE: [
    item("dashboard", "/dashboard", LayoutDashboard, "overview"),
    item(
      "projects",
      "/modules/projects",
      Package,
      "operations",
      undefined,
      false,
      [
        child("2.2.1", "nav.submodule.projectRecords", "/projects", "projects"),
      ],
    ),
    item("field_tasks", "/field-tasks", ClipboardList, "operations", ["/photo-approvals"]),
    // Photo approval is a separate operational workflow. It shares the
    // backend feature grant with field tasks, but is not a Project child.
    itemWithLabel(
      "field_tasks",
      "submodule.photoApprovals",
      "/photo-approvals",
      ClipboardCheck,
      "operations",
    ),
    item(
      "suppliers",
      "/modules/suppliers",
      Truck,
      "operations",
      undefined,
      false,
      [
        child(
          "3.2.1",
          "nav.submodule.supplierRecords",
          "/suppliers",
          "suppliers",
        ),
      ],
    ),
    item(
      "project_categories",
      "/modules/categories",
      ListTree,
      "operations",
      // Allowed, but no longer entries of their own. `isRouteAllowed` reads
      // this registry, so dropping a child does not just hide a route - it
      // refuses it, and both of these are where a module's categories are
      // actually edited. A navigation test caught that (T-219).
      ["/material-columns", "/project-categories"],
      false,
      [
        // One entry, not the ten the earlier plan had (D-125, F-335): the
        // customer's design is "pick the module, then see that module's
        // columns", and that is one screen with a list down its left side.
        // Ten routes would have been ten places to maintain the same thing.
        //
        // `/project-categories` and `/material-columns` still resolve - they
        // are where each module's categories are actually edited, and links
        // to them exist in the wild - they are simply no longer sidebar
        // entries of their own.
        child(
          "4.2.1",
          "nav.submodule.categoryManagement",
          "/category-management",
          "project_categories",
        ),
        // 总栏目 proper: the per-person unarchived queue (T-233, D-106). Its
        // sibling above lists category *definitions*; this lists *records*.
        // Two entries rather than two tabs of one screen, because their
        // status columns mean different things - active/inactive against
        // unarchived/archived - and one column with two meanings is what
        // D-125 refuses.
        child(
          "4.2.2",
          "nav.submodule.archiveQueue",
          "/archive-queue",
          "project_categories",
        ),
        // Multi Engine (T-235). A third sibling and not a tab of the queue:
        // 总栏目 answers "what has nobody looked at", and this answers "why was
        // this bundle put together". Both list records and they mean entirely
        // different things - one screen with two meanings is D-125 again.
        //
        // Gated on `package.view` rather than on the category feature: the
        // permission is what the endpoints check, and a sidebar entry that
        // leads to a 403 is worse than no entry.
        child(
          "4.2.3",
          "nav.submodule.multiEngine",
          "/evidence-packages",
          "project_categories",
          "package.view",
        ),
        // Claim Engine (T-236). A fourth sibling for the same reason the
        // third is one: 总栏目 asks what nobody has looked at, Multi Engine
        // asks why a bundle was put together, and this asks what is being
        // claimed for this month. Three questions, three screens.
        //
        // Gated on `claim.view` and not on `package.view`: reading the claims
        // and building their evidence are separate grants (D-136), and a
        // sidebar entry that leads to a 403 is worse than no entry.
        child(
          "4.2.4",
          "nav.submodule.claimEngine",
          "/claims",
          "project_categories",
          "claim.view",
        ),
        // 杂费报销 beside 进度 Claim: one claim table, two entries (D-252).
        child(
          "4.2.5",
          "nav.submodule.sundryClaims",
          "/sundry-claims",
          "project_categories",
          "sundry_claim.view",
        ),
      ],
    ),
    item(
      "material_receipts",
      "/modules/materials",
      ClipboardList,
      "operations",
      // The material columns screen stopped being a sidebar entry (T-219) but
      // did not stop being a material screen: whoever could open it before
      // still can. Listed on both modules on purpose - narrowing it to the
      // category feature would have taken the screen away from people who
      // only hold material access, silently.
      //
      // `/archive-queue` is here for the same reason (T-233): the queue lists
      // deliveries among eight other kinds, the backend already answers each
      // caller with only the kinds they may read, and refusing the route to
      // somebody who holds material access but not the category feature would
      // hide their own deliveries from them.
      ["/material-columns", "/archive-queue"],
      false,
      [
        child(
          "5.2.1",
          "nav.submodule.materialReceipts",
          "/receipts",
          "material_receipts",
        ),
        child(
          "5.2.2",
          "nav.submodule.materialOutgoing",
          "/material-outgoing",
          "material_outgoing",
        ),
      ],
    ),
    item(
      "equipment",
      "/modules/equipment",
      HardHat,
      "operations",
      undefined,
      false,
      [
        child(
          "6.2.1",
          "nav.submodule.siteEquipment",
          "/site-equipment",
          "equipment",
        ),
      ],
    ),
    item(
      "progress",
      "/modules/progress",
      ChartNoAxesCombined,
      "operations",
      undefined,
      false,
      [
        child(
          "7.2.1",
          "nav.submodule.progressRecords",
          "/progress",
          "progress",
        ),
        child(
          "7.2.14",
          "nav.submodule.schedulePlanning",
          "/schedule",
          "schedule",
        ),
      ],
    ),
    item(
      "recyclers",
      "/modules/recycling",
      Handshake,
      "operations",
      undefined,
      false,
      [
        child(
          "8.2.1",
          "nav.submodule.recyclerPartners",
          "/recyclers",
          "recyclers",
        ),
        // Recording waste leaving site is the head of the chain: it is what
        // becomes a dispatch, so it sits ahead of one in the menu.
        child(
          "8.2.2",
          "nav.submodule.wasteOutgoing",
          "/waste-outgoing",
          "waste_outgoing",
        ),
        child(
          "8.2.3",
          "nav.submodule.wasteDispatches",
          "/dispatches",
          "waste_dispatches",
        ),
        child(
          "8.2.4",
          "nav.submodule.siteDisposals",
          "/site-disposals",
          "site_disposals",
        ),
        child(
          "8.2.5",
          "nav.submodule.paymentProofs",
          "/payment-proofs",
          "payment_proofs",
        ),
        // The weighings of this contractor's own loads. The list is the same
        // page the recycler yard uses; what differs is who the rows belong to,
        // and the backend already decides that - a producer sees the weighing
        // of a load they can see, and nothing else.
        child(
          "8.2.6",
          "nav.recycling_records",
          "/weighing",
          "recycling_records",
        ),
      ],
    ),
    // 安全事故 (安全事件 + 事故上报) removed at the customer's request on
    // 2026-09-07: 这里的安全事故是不需要的，只是需要隐患整改而已.
    //
    // Removed only after the two capabilities that lived on it were moved:
    // the create button is no longer gated to `mode === "incidents"`, and the
    // server's rectification filter now admits OPEN. Deleting first would
    // have left the console unable to raise a hazard at all (F-240).
    //
    // `/incident-reports` was a separate component, not another mode of this
    // one, so this removes a distinct feature rather than a duplicate page -
    // which is what the customer asked for, but worth saying plainly.
    item(
      "consultant_applications",
      "/modules/consultants",
      ClipboardCheck,
      "operations",
      undefined,
      false,
      [
        child(
          "10.2.1",
          "nav.submodule.consultantDashboard",
          "/consultant-dashboard",
          "consultant_applications",
        ),
        child(
          "10.2.2",
          "nav.submodule.consultantApplications",
          "/consultant-applications",
          "consultant_applications",
        ),
        child(
          "10.2.2B",
          "nav.submodule.approvalCredentials",
          "/approval-credential",
          "approvals",
          "approval.review",
        ),
        // The packages a consultant has been sent (T-235, D-147). Under
        // `approvals` and `approval.view`, because reviewing a submission is
        // what this has always been called here - and because a consultant's
        // grant can only ever carry the seven codes in the platform's
        // consultant ceiling, so a `package.*` code could never have reached
        // them (F-358).
        child(
          "10.2.2C",
          "nav.submodule.packageReviews",
          "/package-reviews",
          "approvals",
          "approval.view",
        ),
        child(
          "10.2.4",
          "nav.submodule.consultantFieldInbox",
          "/consultant-field-inbox",
          "field_tasks",
          "consultant.submit",
        ),
        // One entry for the three settings pages (T-373, D-254). Workflows,
        // templates and consultant access each had their own line beside the
        // pages people work in, and the module read as unusable; the hub says
        // which of the three has to be done at all (only access, once).
        child(
          "10.2.9",
          "nav.submodule.consultantSettings",
          "/consultant-settings",
          "consultant_applications",
          "consultant.config",
        ),
      ],
    ),
    item(
      "hazard_rectification",
      "/modules/hazards",
      ClipboardCheck,
      "operations",
      undefined,
      false,
      [
        // Declared under `safety`, not `hazard_rectification`, and that is
        // deliberate. 隐患整改 is the safety module now that 安全事故 has been
        // removed, so the `safety` feature has to open something or a tenant
        // granted it has no way in - which is what the reachability guard in
        // navigation.test.ts caught when this group was deleted.
        //
        // Nobody can hold one feature without the other: portal_features.py
        // grants both from exactly (SAFETY_VIEW, PROJECT_VIEW). So the parent
        // keeps `hazard_rectification` and this child carries `safety`, and
        // both keys lead to the one screen that survived.
        child(
          "11.2.1",
          "nav.submodule.hazardRectifications",
          "/hazard-rectifications",
          "safety",
        ),
      ],
    ),
    item(
      "documents",
      "/modules/documents",
      FolderArchive,
      "operations",
      undefined,
      false,
      [
        child(
          "12.2.1",
          "nav.submodule.documentArchive",
          "/documents",
          "documents",
        ),
        child("12.2.2", "nav.submodule.approvals", "/approvals", "approvals"),
        // Out of the menu (T-345, 第 67 条), not out of the product: the
        // page and every piece of evidence under it stay, and the route still
        // opens for anyone who had it.
        {
          ...child("12.2.3", "nav.submodule.evidenceArchive", "/evidence", "evidence"),
          menuHidden: true,
        },
      ],
    ),
    item(
      "report_center",
      "/modules/reports",
      FileText,
      "finance",
      undefined,
      false,
      [
        child(
          "13.2.1",
          "nav.submodule.materialQuantityReport",
          "/reports/material-quantity",
          "material_quantity_report",
        ),
        child(
          "13.2.2",
          "nav.submodule.materialCostReport",
          "/reports/material-cost",
          "material_cost_report",
        ),
        child(
          "13.2.3",
          "nav.submodule.photoReport",
          "/reports/contractor/photos",
          "report_center",
        ),
        child(
          "13.2.3A",
          "nav.submodule.transactionReports",
          "/reports",
          "report_center",
        ),
        child(
          "13.2.4",
          "nav.submodule.progressRecords",
          "/reports/contractor/progress",
          "report_center",
        ),
        child(
          "13.2.5",
          "nav.submodule.safetyIncidents",
          "/reports/contractor/safety",
          "report_center",
        ),
        child(
          "13.2.6",
          "nav.submodule.consultantApplications",
          "/reports/contractor/consultant",
          "report_center",
        ),
        child(
          "13.2.7",
          "nav.submodule.attendanceRecords",
          "/reports/contractor/attendance",
          "report_center",
        ),
        child(
          "13.2.8",
          "nav.submodule.siteEquipment",
          "/reports/contractor/equipment",
          "report_center",
        ),
        child(
          "13.2.9",
          "nav.submodule.wasteDispatches",
          "/reports/contractor/recycling",
          "report_center",
        ),
        child(
          "13.2.10",
          "nav.submodule.schedulePlanning",
          "/reports/contractor/schedule",
          "report_center",
        ),
        child(
          "13.2.11",
          "nav.submodule.projectRecords",
          "/reports/contractor/target",
          "report_center",
        ),
        child(
          "13.2.12",
          "nav.submodule.reportHistory",
          "/reports/contractor/history",
          "report_center",
        ),
      ],
    ),
    item(
      "notifications",
      "/modules/notifications",
      Bell,
      "system",
      undefined,
      false,
      [
        child(
          "14.2.1",
          "nav.submodule.notifications",
          "/notifications",
          "notifications",
        ),
      ],
    ),
    item(
      "geofences",
      "/modules/location",
      MapPinned,
      "operations",
      undefined,
      false,
      [
        child(
          "15.2.1",
          "nav.submodule.attendanceRecords",
          "/attendance",
          "attendance",
        ),
        child(
          "15.2.2",
          "nav.submodule.geofenceSettings",
          "/geofences",
          "geofences",
        ),
        child("15.2.3", "nav.submodule.workforceGps", "/site-gps", "site_gps"),
        child(
          "15.2.4",
          "nav.submodule.emergencyList",
          "/emergency-list",
          "emergency_list",
        ),
      ],
    ),
    item("users", "/modules/users", Users, "system", undefined, false, [
      child("16.2.1", "nav.submodule.userManagement", "/users", "users"),
      child("16.2.2", "nav.submodule.roles", "/roles", "roles"),
      child(
        "16.2.3",
        "nav.submodule.loginHistory",
        "/login-records",
        "user_logs",
      ),
      child(
        "16.2.8",
        "nav.submodule.userHandovers",
        "/user-handovers",
        "users",
      ),
      child(
        "16.2.4",
        "nav.submodule.userActivity",
        "/audit-logs",
        "activity_logs",
      ),
    ]),
    item(
      "site_access",
      "/modules/site-access",
      KeyRound,
      "operations",
      undefined,
      false,
      [
        child(
          "17.2.1",
          "nav.submodule.siteAccessPasses",
          "/site-access",
          "site_access",
        ),
        child(
          "17.2.2",
          "nav.submodule.gateScanning",
          "/site-access?tab=gate",
          "site_access",
        ),
      ],
    ),
    item(
      "company_settings",
      "/modules/company-settings",
      Settings,
      "system",
      undefined,
      false,
      [
        child(
          "18.2.1",
          "nav.submodule.companySettings",
          "/company-settings",
          "company_settings",
        ),
        child(
          "18.2.2",
          "nav.submodule.integrationSettings",
          "/integrations",
          "integrations",
        ),
        // External Access Portal is one of the six application ends in the
        // architecture document (七、应用层架构). It has no numbered clause in
        // the role documents, hence the "A" prefix the repo uses elsewhere.
        child(
          "A7",
          "nav.submodule.externalAccess",
          "/external-access",
          "company_settings",
          "external_access.manage",
        ),
      ],
    ),
  ],
  MSE_SCRAP: [
    item("dashboard", "/dashboard", LayoutDashboard, "overview"),
    item("customer_management", "/recycler-modules/customer_management", Users, "operations", [
      "/partnerships",
    ], false, [
      child("recycler-customers", "nav.customer_management", "/recycler-customers", "customer_management"),
      child("recycler-partnerships", "nav.partnerships", "/partnerships", "partnerships"),
    ]),
    item("yards", "/recycler-modules/yards", Warehouse, "operations", [
      "/vehicles",
      "/drivers",
    ], false, [
      child("recycler-yards", "nav.yards", "/sites", "yards"),
      child("recycler-vehicles", "nav.vehicles", "/vehicles", "vehicles"),
      child("recycler-drivers", "nav.drivers", "/drivers", "drivers"),
    ]),
    item("waste_orders", "/recycler-modules/waste_orders", Inbox, "operations", [
      "/incoming",
      "/dispatches",
      "/tasks",
      "/driver-gps",
      "/driver",
    ], false, [
      child("recycler-orders", "nav.waste_orders", "/waste-orders", "waste_orders"),
      child("recycler-tasks", "nav.driver_tasks", "/tasks", "driver_tasks"),
      child("recycler-driver-gps", "nav.driver_gps", "/driver-gps", "driver_gps"),
    ]),
    item("weighing_records", "/recycler-modules/weighing_records", Gauge, "operations", [
      "/gate",
      "/deductions",
      "/settlements",
      "/scales",
    ], false, [
      child("recycler-weighing", "nav.weighing_records", "/weighing", "weighing_records"),
      child("recycler-scales", "nav.weighbridges", "/scales", "weighbridges"),
      child("recycler-deductions", "nav.deductions", "/deductions", "weighing_records"),
      child("recycler-settlements", "nav.payment_status", "/settlements", "payment_status"),
    ]),
    item("inventory_management", "/recycler-modules/inventory_management", Box, "operations", [
      "/recycler-outbound",
    ], false, [
      child("recycler-inventory", "nav.inventory_management", "/recycler-inventory", "inventory_management"),
      child("recycler-outbound", "nav.outbound_management", "/recycler-outbound", "outbound_management"),
    ]),
    item("billing_commission", "/billing", Receipt, "finance"),
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
    item("users", "/users", Users, "system"),
    item("roles", "/roles", KeyRound, "system"),
    item("integrations", "/integrations", SlidersHorizontal, "system"),
    item("company_settings", "/company-settings", Settings, "system"),
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
  children?: readonly FeatureNavChild[],
): FeatureNavItem {
  return {
    feature,
    labelKey: feature,
    href,
    icon,
    group,
    routePrefixes,
    exact,
    children,
  };
}

function itemWithLabel(
  feature: PortalFeatureKey,
  labelKey: string,
  href: string,
  icon: LucideIcon,
  group: FeatureNavItem["group"],
  routePrefixes?: readonly string[],
  exact = false,
  children?: readonly FeatureNavChild[],
): FeatureNavItem {
  return {
    ...item(feature, href, icon, group, routePrefixes, exact, children),
    labelKey,
  };
}

function child(
  key: string,
  labelKey: string,
  href: string,
  feature?: PortalFeatureKey,
  requiredPermission?: string,
): FeatureNavChild {
  return { key, labelKey, href, feature, requiredPermission };
}

/** Groups containing only features returned for this signed-in user. */
export function visibleNavigation(
  portal: Portal | undefined,
  features: readonly string[] | undefined,
  permissions: readonly string[] = [],
  isSuperuser = false,
): NavGroup[] {
  if (!portal || !features) return [];

  const visible = new Set(features);
  const groupOrder: FeatureNavItem["group"][] = [
    "overview",
    "operations",
    "finance",
    "system",
  ];
  const grouped = new Map<FeatureNavItem["group"], FeatureNavItem[]>(
    groupOrder.map((key) => [key, []]),
  );

  for (const navItem of PORTAL_NAVIGATION[portal]) {
    const visibleChildren = navItem.children?.filter((childItem) => {
      const featureVisible =
        (!childItem.feature && visible.has(navItem.feature)) ||
        (childItem.feature !== undefined && visible.has(childItem.feature));
      const permissionVisible =
        !childItem.requiredPermission ||
        hasPermission(permissions, childItem.requiredPermission, isSuperuser);
      return featureVisible && permissionVisible && !childItem.menuHidden;
    });
    if (!visible.has(navItem.feature) && !visibleChildren?.length) continue;
    const visibleItem = {
      ...navItem,
      href:
        visible.has(navItem.feature) || !visibleChildren?.length
          ? navItem.href
          : visibleChildren[0].href,
      children: visibleChildren,
    };
    grouped.get(navItem.group)?.push(visibleItem);
  }

  return groupOrder
    .map((key) => ({ key, items: grouped.get(key) ?? [] }))
    .filter((group) => group.items.length > 0);
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
  { pattern: "/sites/create", permission: "yard.manage" },
  { pattern: "/sites/:id/edit", permission: "yard.manage" },
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
  // Multi Engine (T-235). `requiredPermission` on the sidebar child only
  // *hides* the entry; this is what makes the address itself refuse. Without
  // both, somebody who cannot build packages could still type the path and
  // land on a screen whose every call comes back 403 - a page that looks
  // broken rather than a page that says no.
  { pattern: "/evidence-packages", permission: "package.view" },
  { pattern: "/claims", permission: "claim.view" },
  { pattern: "/sundry-claims", permission: "sundry_claim.view" },
  { pattern: "/package-reviews", permission: "approval.view" },
  { pattern: "/consultant-settings", permission: "consultant.config" },
  { pattern: "/consultant-workflows", permission: "consultant.config" },
  { pattern: "/consultant-templates", permission: "consultant.config" },
  { pattern: "/consultant-access", permission: "consultant.config" },
  { pattern: "/approval-credential", permission: "approval.review" },
  { pattern: "/consultant-applications/create", permission: "consultant.submit" },
  { pattern: "/consultant-applications/:id/edit", permission: "consultant.submit" },
  { pattern: "/consultant-field-inbox", permission: "consultant.submit" },
  { pattern: "/external-access", permission: "external_access.manage" },
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
    const parentEnabled = enabled.has(navItem.feature);
    const hasEnabledChild = (navItem.children ?? []).some(
      (childItem) => childItem.feature && enabled.has(childItem.feature),
    );
    if (!parentEnabled && !hasEnabledChild) return false;
    const canonical = navItem.href.split("?", 1)[0];
    if (
      navItem.exact
        ? pathname === canonical
        : matchesPrefix(pathname, canonical)
    ) {
      return true;
    }
    if (
      (navItem.routePrefixes ?? []).some((prefix) =>
        matchesPrefix(pathname, prefix),
      )
    ) {
      return parentEnabled;
    }
    return (navItem.children ?? []).some(
      (childItem) =>
        ((!childItem.feature && parentEnabled) ||
          (childItem.feature !== undefined &&
            enabled.has(childItem.feature))) &&
        matchesPrefix(pathname, childItem.href),
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
