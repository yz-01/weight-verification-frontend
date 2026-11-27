import type { ApprovalRow, DashboardOverview } from "@/interfaces/contractor-dashboard";
import type { MaterialTargetSummary } from "@/interfaces/material-target";

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
  /** 垃圾清运 only (JB248). */
  site_disposals: DisposalClearance;
  /** 废料处理 only - never added to 垃圾清运 (JB248: 「分别累计，不混合统计」). */
  site_scraps: DisposalClearance;
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
  /**
   * What the record is, from its own fields (J32): a material and its
   * quantity, a task's title... Null when the record says nothing more.
   */
  headline?: { title: string; quantity: string | null; unit: string | null } | null;
}

/** One fence of a project (J23-3): a circle or a polygon, never moved by a map. */
export interface HeadquartersFence {
  id: string;
  name: string;
  shape: "CIRCLE" | "POLYGON";
  latitude: string | null;
  longitude: string | null;
  radius_m: number | null;
  polygon: Array<[number, number]>;
  is_primary: boolean;
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
  /** Its active fences as stored (J23-3), the main one first. */
  fences?: HeadquartersFence[];
  /** 材料目标 (I18, ID42): this project's targets and where they stand. */
  material_targets?: MaterialTargetSummary;
}

export interface HeadquartersTotals extends HeadquartersCounts {
  projects: number;
  active_projects: number;
  /** 当前在场人数 = App 人员 + 人员名单 (JB296) + 门岗通行 (Phase 8). */
  app_on_site: number;
  roster_on_site?: number;
  gate_on_site: number;
  /** Passes on site by their subject: WORKER, VISITOR, VEHICLE (J32). */
  gate_by_type?: Partial<Record<string, number>>;
  /** 较昨日 (J32): only the figures yesterday is counted the same way for. */
  yesterday?: { today_records: number; material_receipts_today: number };
  today_records_by_kind: Record<TodayRecordKind, number>;
  material_targets?: MaterialTargetSummary;
}

/**
 * 签收人 of one delivery (JB234, 客户 11-20 事项 6). `name` is the receiver's
 * name on the record ("" = 未签收); `avatar`, `title`, `company` and `phone`
 * come only from the account that signed (`user_id`), never anyone else's.
 */
export interface ReceiptSigner {
  name: string;
  user_id: string | null;
  avatar: string | null;
  title: string;
  company: string;
  phone: string;
  signed_at: string | null;
}

/**
 * 项目仪表板 (J34-5): one project's figures, as the client's picture lays them out.
 *
 * JB226 (客户 11-19 事项 6, 「没有授权的模块、卡片及相关数据一律隐藏」): a
 * consultant reads the same payload with only the parts head office gave him -
 * a part he is not granted is absent, so every part is optional here and the
 * screen draws what it receives. The project manager's always carries the
 * eight parts it always had; `progress`, `schedule` and `safety` come only to
 * a consultant (the project manager reads them in 今日概览 below).
 */
export interface ProjectOverview {
  date: string;
  project: { id: string; code: string; name: string; latitude: string | null; longitude: string | null };
  cards: {
    receipts_today_t?: string;
    receipts_yesterday_t?: string;
    waste_today_t?: string;
    waste_yesterday_t?: string;
    receipts_month_t?: string;
    receipts_total_t?: string;
    waste_month_t?: string;
    waste_total_t?: string;
    equipment_total?: number;
    equipment_on_site?: number;
    equipment_off_site?: number;
    pending_total?: number;
  };
  /** 工程进度 (JB226): 施工进度 / 雨天记录 counts; 整体进度 with 施工进度 only. */
  progress?: { today: number; month: number; total: number; weighted_progress?: string | null };
  /** 施工计划进度 (JB226): the project manager's 今日概览 figures for this project. */
  schedule?: DashboardOverview["schedule"];
  /** 整改／EHS (JB226): the project manager's 安全巡检与整改 figures for this project. */
  safety?: Pick<DashboardOverview["safety"], "pending_rectification" | "in_progress" | "overdue" | "completed">;
  latest_receipts?: Array<{
    id: string;
    receipt_no: string;
    business_at: string | null;
    supplier: string;
    material: string;
    category: string;
    quantity: string;
    unit: string;
    /** A unit the company added itself (e.g. 桶): its own label; null for a built-in code. */
    unit_label?: string | null;
    acceptance_status: string;
    /** 签收人 (JB234): the receiver who signed; picture etc. only from the signing account. */
    signer?: ReceiptSigner;
    /** The receiver's signature image, or null. */
    signature_url?: string | null;
    accepted_by_name?: string;
    accepted_at?: string | null;
  }>;
  material_mix?: Array<{ name: string; tonnes: string; other?: boolean }>;
  waste_mix?: Array<{ name: string; tonnes: string; other?: boolean }>;
  pending?: Array<{ feature: string; count: number }>;
  photos?: Array<{
    kind: string;
    record_id: string;
    reference: string;
    captured_at: string | null;
    thumbnail_url: string | null;
    url: string | null;
    photo_count: number;
  }>;
}

export interface HeadquartersOverview {
  date: string;
  /**
   * JB250: the modules the company does not have; their cards say 「没有开通」
   * and count nothing. Missing from an older backend.
   */
  modules_off?: string[];
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
    site_scraps: DisposalClearance;
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

/** One point of the project dashboard's map (JB222): a record, a delivery or a machine. */
export interface ProjectMapRow {
  kind: string;
  id: string;
  reference: string;
  label: string;
  at: string | null;
  latitude: string;
  longitude: string;
  /** 设备进退场: ENTRY / EXIT. */
  direction?: string;
  /**
   * Machines: where its place came from, and the movement record its card
   * opens - the one the place came from, or for a clock-in the stay's entry.
   */
  source?: "MOVEMENT" | "OPERATING_LOG";
  movement_id?: string | null;
  /** Which way `movement_id` went: ENTRY 进场记录, EXIT 退场申请 (audit 11-20 F3). */
  movement_direction?: "ENTRY" | "EXIT" | null;
  registration_no?: string;
  site_no?: string;
  supplier?: string;
}

/** A person on site now (JB222-3): an app account or a roster worker. */
export interface ProjectMapPerson {
  kind: "APP" | "ROSTER";
  id: string;
  name: string;
  trade: string;
  department: string;
  latitude: string;
  longitude: string;
  /** 最新定位时间. */
  at: string | null;
  since: string | null;
  stale: boolean;
}

export interface ProjectMapFence {
  id: string;
  name: string;
  shape: "CIRCLE" | "POLYGON";
  latitude: string | null;
  longitude: string | null;
  radius_m: number | null;
  polygon: Array<[number, number]>;
  is_primary: boolean;
}

export type ProjectMapWindow = "today" | "week";

/**
 * 项目仪表板的地图 (JB222, 客户 11-19 事项 2). Every layer is the reader's own:
 * the server leaves out what his permissions do not give and says so in
 * `allowed`, so the map only offers what can be opened.
 */
export interface ProjectMap {
  project: { id: string; code: string; name: string };
  window: ProjectMapWindow;
  from: string;
  to: string;
  cap: number;
  site: {
    fences: ProjectMapFence[];
    radius_circle: { latitude: string; longitude: string; radius_m: number } | null;
    location: { latitude: string; longitude: string } | null;
  };
  layers: {
    people: { allowed: boolean; app_allowed: boolean; roster_allowed: boolean; rows: ProjectMapPerson[] };
    receipts: { allowed: boolean; rows: ProjectMapRow[]; capped: boolean };
    machines: { allowed: boolean; rows: ProjectMapRow[]; without_position: number };
    records: { allowed: boolean; kinds: string[]; rows: ProjectMapRow[]; capped: boolean };
  };
  generated_at: string;
}
