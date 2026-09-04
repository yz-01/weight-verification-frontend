export interface RecyclerDashboardPermissions {
  orders: boolean;
  inventory: boolean;
  outbound: boolean;
  billing: boolean;
  notifications: boolean;
}

export interface RecyclerBusinessToday {
  platform_orders: number;
  waiting_acceptance: number;
  pending_dispatch: number;
  active_collections: number;
  completed: number;
  cancelled: number;
}

export interface RecyclerRecoveryToday {
  platform_weight_kg: string;
  private_weight_kg: string;
  total_weight_kg: string;
  completed_weighings: number;
}

export interface RecyclerInventorySummary {
  platform_weight_kg: string;
  private_weight_kg: string;
  total_weight_kg: string;
}

export interface RecyclerOutboundToday {
  count: number;
  weight_kg: string;
}

export interface OptionalDashboardMetric {
  available: boolean;
  count: number | null;
}

export interface RecyclerDashboardPending {
  waiting_acceptance?: number;
  pending_dispatch?: number;
  pending_deduction_confirmation?: number;
  weighing_confirmation: OptionalDashboardMetric;
  weighing_anomalies: OptionalDashboardMetric;
  open_saas_invoices: number | null;
  open_commission_invoices: number | null;
}

export interface RecyclerDashboardInvoice {
  id: string;
  invoice_no: string;
  kind: string;
  state: string;
  currency: string;
  period_start: string;
  period_end: string;
  issued_on: string | null;
  due_on: string | null;
  total_amount: string;
  amount_paid: string;
  outstanding: string;
}

export interface RecyclerDashboardFees {
  subscription: {
    plan_name: string | null;
    plan_tier: string | null;
    expires_on: string | null;
    subscription_state: string;
    payment_state: string | null;
    outstanding: string;
    latest_invoice: RecyclerDashboardInvoice | null;
  };
  commission: {
    period_start: string | null;
    period_end: string | null;
    business_weight_kg: string;
    settlement_amount: string;
    amount_due: string;
    payment_state: string | null;
    outstanding: string;
    latest_invoice: RecyclerDashboardInvoice | null;
  };
  open_saas_count: number;
  open_commission_count: number;
}

export interface RecyclerDashboardNotification {
  id: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  is_read: boolean;
  created_at: string;
}

export interface RecyclerRecoveryChartPoint {
  label?: string;
  date?: string;
  platform_weight_kg: string;
  private_weight_kg: string;
  total_weight_kg: string;
}

export interface RecyclerOutboundChartPoint {
  date: string;
  count: number;
  weight_kg: string;
}

export interface RecyclerDashboardCharts {
  recovery_today: RecyclerRecoveryChartPoint[];
  recovery_month: RecyclerRecoveryChartPoint[];
  outbound_month: RecyclerOutboundChartPoint[];
}

export interface RecyclerRecentOrder {
  id: string;
  reference: string;
  state: string;
  contractor_name: string;
  project_name: string;
  vehicle_plate: string;
  occurred_at: string;
  href: string;
}

export interface RecyclerRecentRecovery {
  id: string;
  reference: string;
  business_source: string;
  material_type: string;
  weight_kg: string;
  occurred_at: string;
  href: string;
}

export interface RecyclerRecentOutbound {
  id: string;
  reference: string;
  state: string;
  buyer_name: string;
  material_type: string;
  weight_kg: string;
  occurred_at: string;
  href: string;
}

/** Which yard the figures cover, and which sections the filter reached. */
export interface RecyclerDashboardSiteScope {
  id: string | null;
  name: string | null;
  /** Sections the yard filter actually narrowed. */
  scoped: string[];
  /** Sections with no yard column; these stay company-wide either way. */
  company_wide: string[];
}

export interface RecyclerDashboardData {
  generated_at: string;
  date: string;
  site: RecyclerDashboardSiteScope;
  permissions: RecyclerDashboardPermissions;
  business_today: RecyclerBusinessToday | null;
  recovery_today: RecyclerRecoveryToday | null;
  inventory: RecyclerInventorySummary | null;
  outbound_today: RecyclerOutboundToday | null;
  pending: RecyclerDashboardPending;
  fees: RecyclerDashboardFees | null;
  notifications: RecyclerDashboardNotification[];
  charts: RecyclerDashboardCharts | null;
  recent: {
    orders: RecyclerRecentOrder[];
    recoveries: RecyclerRecentRecovery[];
    outbound: RecyclerRecentOutbound[];
    invoices: RecyclerDashboardInvoice[];
    notifications: RecyclerDashboardNotification[];
  };
}
