import type { ApprovalRow } from "@/interfaces/contractor-dashboard";

/** 公司总部 Dashboard (C11, C13–C15, C19). */

/** What 今日现场记录 is made of - the same list the server counts. */
export type TodayRecordKind =
  | "MATERIAL_RECEIPT"
  | "MATERIAL_OUTGOING"
  | "EQUIPMENT_MOVEMENT"
  | "SITE_PROGRESS"
  | "SAFETY_INCIDENT"
  | "FIELD_TASK"
  | "DISPOSAL"
  | "WASTE_DISPATCH"
  | "WASTE_OUTGOING"
  | "GATE_INCIDENT";

/** The record a site photo belongs to. */
export type PhotoRecordKind =
  | "MATERIAL_RECEIPT"
  | "DELIVERY_NOTE"
  | "MATERIAL_OUTGOING"
  | "EQUIPMENT_MOVEMENT"
  | "EQUIPMENT"
  | "SITE_PROGRESS"
  | "FIELD_TASK"
  | "DISPOSAL"
  | "WASTE_OUTGOING"
  | "WASTE_DISPATCH"
  | "SAFETY_INCIDENT"
  | "GATE_INCIDENT";

/** 原废料订单 (D06): the recycler orders' own 数量 / 车次 / 重量. */
export interface DispatchClearance {
  records: number;
  trips: number;
  weighed_kg: string;
  weighed_records: number;
}

/** 原工地清运 (D06): the site disposals' own 数量 / 车次 / 重量. */
export interface DisposalClearance {
  records: number;
  completed: number;
  trips: number;
  weight_kg: string;
  with_weight: number;
}

/** The figures every project row, the 其他 row and the totals carry. */
export interface HeadquartersCounts {
  today_records: number;
  on_site_now: number;
  pending_approvals: number;
  open_tasks: number;
  overdue_tasks: number;
  overdue_rectifications: number;
  material_receipts_today: number;
  today_records_by_kind: Partial<Record<TodayRecordKind, number>>;
  waste_dispatches: DispatchClearance;
  site_disposals: DisposalClearance;
}

export type HeadquartersCountField =
  | "today_records"
  | "on_site_now"
  | "pending_approvals"
  | "open_tasks"
  | "overdue_tasks"
  | "overdue_rectifications"
  | "material_receipts_today";

export interface HeadquartersPhoto {
  id: string;
  image: string | null;
  captured_at: string;
  project_id: string;
  project: string;
  /** Empty when nobody is on the photo's record (an outside link). */
  photographer: string;
  record_kind: PhotoRecordKind;
  record_id: string | null;
}

export interface HeadquartersProject extends HeadquartersCounts {
  id: string;
  code: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";
  address: string;
  city: string;
  state: string;
  /** Null when the project has no coordinates: listed, never placed. */
  latitude: string | null;
  longitude: string | null;
  has_location: boolean;
  latest_photo: HeadquartersPhoto | null;
}

export interface HeadquartersTotals extends HeadquartersCounts {
  projects: number;
  active_projects: number;
  /** 当前在场人数 = App 人员 + 门岗通行 (Phase 8). */
  app_on_site: number;
  gate_on_site: number;
  today_records_by_kind: Record<TodayRecordKind, number>;
}

export interface HeadquartersOverview {
  date: string;
  generated_at: string;
  /** Whether this reader sees every project (`project.view_all`). */
  all_projects: boolean;
  totals: HeadquartersTotals;
  projects: HeadquartersProject[];
  /** Counted but tied to no listed project - a company-wide approval. */
  other: HeadquartersCounts;
  has_other: boolean;
  without_location: Array<{ id: string; code: string; name: string }>;
}

/** The waiting decisions' queues (C16), each opened by its own module. */
export type ApprovalSource =
  | "APPROVAL"
  | "DISPOSAL_REQUEST"
  | "WASTE_OUTGOING"
  | "FIELD_TASK"
  | "CONSULTANT_APPLICATION"
  | "MATERIAL_REQUEST"
  | "EQUIPMENT_MOVEMENT"
  | "MATERIAL_OUTGOING"
  | "SUNDRY_CLAIM";


/**
 * 总部大屏's extra panels (Lucas 2026-10-10, 「加多一点真实数据」), each
 * counted by the module that owns it, over the reader's own projects.
 */
export interface HeadquartersWallExtras {
  date: string;
  generated_at: string;
  /** The last seven days, oldest first: Material In and rejected deliveries. */
  week: Array<{ date: string; delivered: number; rejected: number }>;
  /** That week's deliveries by acceptance status. */
  acceptance: { pending: number; accepted: number; rejected: number };
  /** Who delivered most of that week's Material In. */
  top_suppliers: Array<{ id: string; name: string; deliveries: number }>;
  /** Hazards not yet verified or resolved. */
  hazards: { open: number; overdue: number };
  /** The approvals card's queues, only those with something waiting. */
  approvals_by_source: Partial<Record<ApprovalSource, number>>;
  equipment: { on_site: number; maintenance: number };
  /** This month's two kinds of waste, never added together (D06). */
  clearance_month: {
    since: string;
    waste_dispatches: DispatchClearance;
    site_disposals: DisposalClearance;
  };
}

/** One page of 总部集中审批, with every queue's count for the filter. */
export interface ApprovalQueuePage {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: ApprovalRow[];
  by_source: Partial<Record<ApprovalSource, number>>;
}

/** 公司公告 (C18): who it is for. */
export type AnnouncementScope = "COMPANY" | "ALL_PROJECTS" | "PROJECTS";

export interface CompanyAnnouncement {
  id: string;
  title: string;
  body: string;
  scope: AnnouncementScope;
  project_names: string[];
  published_at: string;
  published_by: string;
  published_by_name: string;
  /** Set when withdrawn; the words stay as published. */
  withdrawn_at: string | null;
  withdrawn_by_name: string | null;
  attachments: Array<{ id: string; original_name: string; size_bytes: number; url: string }>;
  /** Fixed at publishing: 共 y. */
  recipient_count: number | null;
  read_count: number | null;
  is_recipient: boolean;
  /** This reader's first opening, or null. */
  my_read_at: string | null;
}

export interface AnnouncementReader {
  id: string;
  user: string;
  full_name: string;
  role_name: string;
  read_at: string | null;
}
