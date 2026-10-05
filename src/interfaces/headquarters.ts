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
