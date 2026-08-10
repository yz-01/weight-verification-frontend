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
  ScanSearch,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  WalletCards,
  Warehouse,
  Workflow,
  HardHat,
  ListTree,
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
  | "cloud_service_management"
  | "version_management";

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
      ["/contractor-partners", "/recycler-review"],
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
          "2.2.4",
          "nav.submodule.companyStatus",
          "/companies/admin/status",
        ),
        child(
          "2.2.5",
          "nav.submodule.companySubscriptions",
          "/companies/admin/subscriptions",
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
        child(
          "2.2.8",
          "nav.submodule.companySearch",
          "/companies/admin/search",
        ),
        child(
          "2.2.9",
          "nav.submodule.companyStatistics",
          "/companies/admin/statistics",
        ),
        child(
          "2.2.10",
          "nav.submodule.companyActivity",
          "/companies/admin/activity",
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
        child("3.2.2", "nav.submodule.userProfiles", "/users/admin/profiles"),
        child(
          "3.2.3",
          "nav.submodule.userCategories",
          "/users/admin/categories",
        ),
        child("3.2.4", "nav.submodule.userSearch", "/users/admin/search"),
        child(
          "3.2.5",
          "nav.submodule.userLoginManagement",
          "/users/admin/login",
        ),
        child(
          "3.2.6",
          "nav.submodule.userStatistics",
          "/users/admin/statistics",
        ),
        child("3.2.7", "nav.submodule.userActivity", "/users/admin/activity"),
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
          "4.2.3",
          "nav.submodule.subscriptionStatus",
          "/subscriptions/status",
        ),
        child(
          "4.2.4",
          "nav.submodule.packageChanges",
          "/subscriptions/package-changes",
        ),
        child(
          "4.2.5",
          "nav.submodule.accountLimits",
          "/subscriptions/account-limits",
        ),
        child(
          "4.2.6",
          "nav.submodule.expiryReminders",
          "/subscriptions/reminders",
        ),
        child(
          "4.2.7",
          "nav.submodule.subscriptionSearch",
          "/subscriptions/search",
        ),
        child(
          "4.2.8",
          "nav.submodule.subscriptionStatistics",
          "/subscriptions/statistics",
        ),
        child(
          "4.2.9",
          "nav.submodule.subscriptionActivity",
          "/subscriptions/activity",
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
        child("5.2.1", "nav.submodule.saasInvoices", "/billing/saas-invoices"),
        child(
          "5.2.2",
          "nav.submodule.platformCommission",
          "/billing/commission",
        ),
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
        child("5.2.7", "nav.submodule.invoiceSearch", "/billing/search"),
        child(
          "5.2.8",
          "nav.submodule.billingStatistics",
          "/billing/statistics",
        ),
        child("5.2.9", "nav.submodule.financialReports", "/billing/reports"),
        child("5.2.10", "nav.submodule.billingActivity", "/billing/activity"),
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
          "6.2.8",
          "nav.submodule.serviceSearch",
          "/monitoring/service-search",
        ),
        child(
          "6.2.9",
          "nav.submodule.runtimeStatistics",
          "/monitoring/runtime-statistics",
        ),
        child(
          "6.2.10",
          "nav.submodule.monitoringRecords",
          "/monitoring/records",
        ),
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
        child("7.2.2", "nav.submodule.qrRegister", "/qr-codes/register"),
        child("7.2.3", "nav.submodule.qrLifecycle", "/qr-codes/lifecycle"),
        child("7.2.4", "nav.submodule.qrSearch", "/qr-codes/search"),
        child("7.2.5", "nav.submodule.qrScans", "/qr-codes/scans"),
        child("7.2.6", "nav.submodule.qrAnomalies", "/qr-codes/anomalies"),
        child("7.2.7", "nav.submodule.qrStatistics", "/qr-codes/statistics"),
        child("7.2.8", "nav.submodule.qrActivity", "/qr-codes/activity"),
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
        child("8.2.8", "nav.submodule.cweActivity", "/weighing/admin/activity"),
      ],
    ),
    item("report_center", "/reports", FileText, "finance", undefined, false, [
      child("9.2.1", "nav.submodule.contractorReports", "/reports/contractors"),
      child("9.2.2", "nav.submodule.recyclerReports", "/reports/recyclers"),
      child(
        "9.2.3",
        "nav.submodule.platformBusinessReports",
        "/reports/business",
      ),
      child("9.2.4", "nav.submodule.saasReports", "/reports/saas"),
      child("9.2.5", "nav.submodule.commissionReports", "/reports/commission"),
      child("9.2.6", "nav.submodule.cweReports", "/reports/cwe"),
      child("9.2.7", "nav.submodule.operationsReports", "/reports/operations"),
      child("9.2.8", "nav.submodule.reportSearch", "/reports/search"),
      child("9.2.9", "nav.submodule.reportExports", "/reports/export"),
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
          "10.2.1",
          "nav.submodule.contractorNotifications",
          "/notifications/contractors",
        ),
        child(
          "10.2.2",
          "nav.submodule.recyclerNotifications",
          "/notifications/recyclers",
        ),
        child(
          "10.2.3",
          "nav.submodule.saasNotifications",
          "/notifications/saas",
        ),
        child(
          "10.2.4",
          "nav.submodule.commissionNotifications",
          "/notifications/commission",
        ),
        child("10.2.5", "nav.submodule.cweNotifications", "/notifications/cwe"),
        child(
          "10.2.6",
          "nav.submodule.systemNotifications",
          "/notifications/system",
        ),
        child(
          "10.2.7",
          "nav.submodule.notificationSearch",
          "/notifications/search",
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
          "nav.submodule.settingsActivity",
          "/system-settings/activity",
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
        child("12.2.1", "nav.submodule.userAudit", "/audit-logs/users"),
        child("12.2.2", "nav.submodule.companyAudit", "/audit-logs/companies"),
        child(
          "12.2.3",
          "nav.submodule.subscriptionAudit",
          "/audit-logs/subscriptions",
        ),
        child("12.2.4", "nav.submodule.billingAudit", "/audit-logs/billing"),
        child("12.2.5", "nav.submodule.cweAudit", "/audit-logs/cwe"),
        child("12.2.6", "nav.submodule.settingsAudit", "/audit-logs/settings"),
        child("12.2.7", "nav.submodule.loginAudit", "/audit-logs/login"),
        child("12.2.8", "nav.submodule.auditSearch", "/audit-logs/search"),
        child("12.2.9", "nav.submodule.auditExport", "/audit-logs/export"),
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
        child("13.2.2", "nav.submodule.salesDetails", "/sales/details"),
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
        child("13.2.13", "nav.submodule.salesActivity", "/sales/activity"),
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
        child(
          "14.2.8",
          "nav.submodule.crmActivity",
          "/customer-service/activity",
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
        child(
          "15.2.2",
          "nav.submodule.supportStates",
          "/support-tickets/states",
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
        child(
          "15.2.8",
          "nav.submodule.supportActivity",
          "/support-tickets/activity",
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
        child("16.2.2", "nav.submodule.partnerDetails", "/partners/details"),
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
        child("16.2.10", "nav.submodule.partnerActivity", "/partners/activity"),
      ],
    ),
    item("asset_management", "/assets", Box, "operations", undefined, false, [
      child("17.2.1", "nav.submodule.assetManagement", "/assets/management"),
      child("17.2.2", "nav.submodule.assetDetails", "/assets/details"),
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
      child("17.2.9", "nav.submodule.assetRepairs", "/assets/repairs"),
      child("17.2.10", "nav.submodule.assetMaintenance", "/assets/maintenance"),
      child("17.2.11", "nav.submodule.assetDisposals", "/assets/disposals"),
      child("17.2.12", "nav.submodule.assetSearch", "/assets/search"),
      child("17.2.13", "nav.submodule.assetReports", "/assets/reports"),
      child("17.2.14", "nav.submodule.assetActivity", "/assets/activity"),
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
        child(
          "A17.2.11",
          "nav.submodule.cloudActivity",
          "/cloud-services/activity",
        ),
      ],
    ),
  ],
  MSE_TRACE: [
    item("dashboard", "/dashboard", LayoutDashboard, "overview"),
    item("projects", "/modules/projects", Package, "operations", undefined, false, [
      child("2.2.1", "nav.submodule.projectRecords", "/projects", "projects"),
      child("2.2.2", "nav.submodule.fieldTasks", "/field-tasks", "field_tasks"),
    ]),
    item("suppliers", "/modules/suppliers", Truck, "operations", undefined, false, [
      child("3.2.1", "nav.submodule.supplierRecords", "/suppliers", "suppliers"),
    ]),
    item("project_categories", "/modules/categories", ListTree, "operations", undefined, false, [
      child("4.2.1", "nav.submodule.categoryRecords", "/project-categories", "project_categories"),
    ]),
    item("material_receipts", "/modules/materials", ClipboardList, "operations", undefined, false, [
      child("5.2.1", "nav.submodule.materialReceipts", "/receipts", "material_receipts"),
      child("5.2.2", "nav.submodule.materialOutgoing", "/material-outgoing", "material_outgoing"),
    ]),
    item("equipment", "/modules/equipment", HardHat, "operations", undefined, false, [
      child("6.2.1", "nav.submodule.siteEquipment", "/site-equipment", "equipment"),
    ]),
    item("progress", "/modules/progress", ChartNoAxesCombined, "operations", undefined, false, [
      child("7.2.1", "nav.submodule.progressRecords", "/progress", "progress"),
      child("7.2.14", "nav.submodule.schedulePlanning", "/schedule", "schedule"),
    ]),
    item("recyclers", "/modules/recycling", Handshake, "operations", undefined, false, [
      child("8.2.1", "nav.submodule.recyclerPartners", "/recyclers", "recyclers"),
      // Recording waste leaving site is the head of the chain: it is what
      // becomes a dispatch, so it sits ahead of one in the menu.
      child("8.2.2", "nav.submodule.wasteOutgoing", "/waste-outgoing", "waste_outgoing"),
      child("8.2.3", "nav.submodule.wasteDispatches", "/dispatches", "waste_dispatches"),
      child("8.2.4", "nav.submodule.siteDisposals", "/site-disposals", "site_disposals"),
      child("8.2.5", "nav.submodule.recyclingRecords", "/weighing", "recycling_records"),
      child("8.2.6", "nav.submodule.paymentProofs", "/payment-proofs", "payment_proofs"),
    ]),
    item("safety", "/modules/safety", ShieldAlert, "operations", undefined, false, [
      child("9.2.1", "nav.submodule.safetyIncidents", "/safety", "safety"),
    ]),
    item(
      "consultant_applications",
      "/modules/consultants",
      ClipboardCheck,
      "operations",
      undefined,
      false,
      [
        child("10.2.1", "nav.submodule.consultantApplications", "/consultant-applications", "consultant_applications"),
        child("10.2.2", "nav.submodule.consultantWorkflows", "/consultant-workflows", "consultant_applications"),
        child("10.2.3", "nav.submodule.approvalCredentials", "/approval-credential", "approvals"),
        child("10.2.4", "nav.submodule.consultantFieldInbox", "/consultant-field-inbox", "field_tasks"),
        child("10.2.5", "nav.submodule.consultantAccess", "/consultant-access", "users"),
        child("10.2.6", "nav.submodule.consultantTemplates", "/consultant-templates", "consultant_applications"),
      ],
    ),
    item("hazard_rectification", "/modules/hazards", ClipboardCheck, "operations", undefined, false, [
      child("11.2.1", "nav.submodule.hazardRectifications", "/hazard-rectifications", "hazard_rectification"),
    ]),
    item("documents", "/modules/documents", FolderArchive, "operations", undefined, false, [
      child("12.2.1", "nav.submodule.documentArchive", "/documents", "documents"),
      child("12.2.2", "nav.submodule.approvals", "/approvals", "approvals"),
      child("12.2.3", "nav.submodule.evidenceArchive", "/evidence", "evidence"),
    ]),
    item(
      "report_center",
      "/modules/reports",
      FileText,
      "finance",
      undefined,
      false,
      [
        child("13.2.1", "nav.submodule.materialQuantityReport", "/reports/material-quantity", "material_quantity_report"),
        child("13.2.2", "nav.submodule.materialCostReport", "/reports/material-cost", "material_cost_report"),
        child("13.2.3", "nav.submodule.transactionReports", "/reports", "report_center"),
        child("13.2.4", "nav.submodule.progressRecords", "/reports/contractor/progress", "report_center"),
        child("13.2.5", "nav.submodule.safetyIncidents", "/reports/contractor/safety", "report_center"),
        child("13.2.6", "nav.submodule.consultantApplications", "/reports/contractor/consultant", "report_center"),
        child("13.2.7", "nav.submodule.attendanceRecords", "/reports/contractor/attendance", "report_center"),
        child("13.2.8", "nav.submodule.siteEquipment", "/reports/contractor/equipment", "report_center"),
        child("13.2.9", "nav.submodule.wasteDispatches", "/reports/contractor/recycling", "report_center"),
        child("13.2.10", "nav.submodule.schedulePlanning", "/reports/contractor/schedule", "report_center"),
        child("13.2.11", "nav.submodule.projectRecords", "/reports/contractor/target", "report_center"),
        child("13.2.12", "nav.submodule.reportHistory", "/reports/contractor/history", "report_center"),
      ],
    ),
    item("notifications", "/modules/notifications", Bell, "system", undefined, false, [
      child("14.2.1", "nav.submodule.notifications", "/notifications", "notifications"),
    ]),
    item("geofences", "/modules/location", MapPinned, "operations", undefined, false, [
      child("15.2.1", "nav.submodule.attendanceRecords", "/attendance", "attendance"),
      child("15.2.2", "nav.submodule.geofenceSettings", "/geofences", "geofences"),
      child("15.2.3", "nav.submodule.workforceGps", "/site-gps", "site_gps"),
      child("15.2.4", "nav.submodule.emergencyList", "/emergency-list", "emergency_list"),
    ]),
    item("users", "/modules/users", Users, "system", undefined, false, [
      child("16.2.1", "nav.submodule.userManagement", "/users", "users"),
      child("16.2.2", "nav.submodule.roles", "/roles", "roles"),
      child("16.2.3", "nav.submodule.loginHistory", "/login-records", "user_logs"),
      child("16.2.4", "nav.submodule.userActivity", "/audit-logs", "activity_logs"),
    ]),
    item("site_access", "/modules/site-access", KeyRound, "operations", undefined, false, [
      child("17.2.1", "nav.submodule.siteAccessPasses", "/site-access", "site_access"),
      child("17.2.2", "nav.submodule.gateScanning", "/gate", "site_access"),
    ]),
    item("company_settings", "/modules/company-settings", Settings, "system", undefined, false, [
      child("18.2.1", "nav.submodule.companySettings", "/company-settings", "company_settings"),
      child("18.2.2", "nav.submodule.integrationSettings", "/integrations", "integrations"),
    ]),
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
    item("driver_tasks", "/tasks", ClipboardList, "operations", ["/driver"]),
    item("driver_gps", "/driver-gps", MapPinned, "operations"),
    item("weighing_records", "/weighing", Gauge, "operations", [
      "/gate",
      "/deductions",
    ]),
    item("payment_status", "/settlements", WalletCards, "finance"),
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

function child(
  key: string,
  labelKey: string,
  href: string,
  feature?: PortalFeatureKey,
): FeatureNavChild {
  return { key, labelKey, href, feature };
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
    const visibleChildren = navItem.children?.filter(
      (childItem) =>
        (!childItem.feature && visible.has(navItem.feature)) ||
        (childItem.feature !== undefined && visible.has(childItem.feature)),
    );
    if (!visible.has(navItem.feature) && !visibleChildren?.length) continue;
    const lastGroup = groups.at(-1);
    const visibleItem = {
      ...navItem,
      children: visibleChildren,
    };
    if (lastGroup?.key === navItem.group) {
      lastGroup.items.push(visibleItem);
    } else {
      groups.push({
        key: navItem.group,
        items: [visibleItem],
      });
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
    if ((navItem.routePrefixes ?? []).some((prefix) => matchesPrefix(pathname, prefix))) {
      return parentEnabled;
    }
    return (navItem.children ?? []).some(
      (childItem) =>
        ((!childItem.feature && parentEnabled) ||
          (childItem.feature !== undefined && enabled.has(childItem.feature))) &&
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
