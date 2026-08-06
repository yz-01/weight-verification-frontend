export const ADMIN_DASHBOARD_SECTIONS = [
  "map",
  "platform",
  "business",
  "subscriptions",
  "commission",
  "pending",
  "cwe",
  "notifications",
  "quick-actions",
  "trends",
  "system-status",
] as const;

export type AdminDashboardSection = (typeof ADMIN_DASHBOARD_SECTIONS)[number];
