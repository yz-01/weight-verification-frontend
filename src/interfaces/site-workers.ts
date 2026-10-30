/** 人员名单 (I20): workers with no account, located by a personal link. */

import type { Paginated } from "@/interfaces/api";

export type WorkerStatus = "ON_SITE" | "OFF_SITE" | "STALE" | "NOT_STARTED";
export type WorkerLinkStatus = "NONE" | "REVOKED" | "NOT_OPENED" | "BOUND" | "ACTIVE";
export type VisitExitState = "EXITED" | "ON_SITE" | "SIGNAL_LOST";

export interface SiteWorkerDocument {
  id?: string;
  name: string;
  number: string;
}

export interface SiteWorkerLink {
  status: WorkerLinkStatus;
  last6: string;
  issued_at: string | null;
  bound_at: string | null;
  consented_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface SiteWorker {
  id: string;
  project: string;
  project_name: string;
  name: string;
  /** Empty when the office has no number (JB61-3): no location link then. */
  phone: string;
  passport_no: string;
  nationality: string;
  date_of_birth: string | null;
  passport_expiry: string | null;
  /** Only ever sent to readers of the roster (PDPA). */
  passport_photo_url: string | null;
  passport_photo_is_pdf: boolean;
  cidb_no: string;
  supplier: string | null;
  supplier_name: string;
  company_note: string;
  company_name: string;
  /** 「施工工种」 (JB91); null is 「未填工种」. */
  trade: string | null;
  /** A built-in trade's code, translated on screen; empty for one the company added. */
  trade_code: string;
  trade_name: string;
  documents: SiteWorkerDocument[];
  documents_text: string;
  is_active: boolean;
  status: WorkerStatus;
  last_position_at: string | null;
  link: SiteWorkerLink;
  created_at: string;
  updated_at: string;
}

export interface SiteWorkerList extends Paginated<SiteWorker> {
  status_counts?: Record<WorkerStatus, number>;
  fence_set?: boolean | null;
}

export interface SiteWorkerVisit {
  id: string;
  worker: string;
  worker_name: string;
  phone: string;
  cidb_no: string;
  company_name: string;
  project: string;
  project_name: string;
  entered_at: string;
  exited_at: string | null;
  exit_state: VisitExitState;
  last_seen_at: string | null;
}

export interface WorkerFence {
  id: string;
  name: string;
  shape: "CIRCLE" | "POLYGON";
  latitude: string | null;
  longitude: string | null;
  radius_m: number | null;
  polygon: Array<[number, number]>;
}

export interface WorkerLastPosition {
  received_at: string;
  geofence_result: "INSIDE" | "OUTSIDE" | "NOT_EVALUATED";
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  geofence_name: string;
  fence_distance_km: string | null;
}

export interface SiteWorkerDetail extends SiteWorker {
  visits: SiteWorkerVisit[];
  visit_count: number;
  last_position: WorkerLastPosition | null;
  fences: WorkerFence[];
}

export interface SiteWorkerPayload {
  project?: string;
  name: string;
  phone: string;
  passport_no: string;
  nationality: string;
  date_of_birth: string | null;
  passport_expiry: string | null;
  cidb_no: string;
  supplier: string | null;
  company_note: string;
  trade?: string | null;
  documents: SiteWorkerDocument[];
}

/** One 「施工工种」 on the company's list (JB91). */
export interface SiteWorkerTrade {
  id: string;
  /** REBAR, FORMWORK, CONCRETE, ELECTRICIAN, GENERAL - or empty for one the company added. */
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  built_in: boolean;
}

export interface TradeCount {
  /** The `trade` filter's value: the trade's id, or "none" for 「未填工种」. */
  value: string;
  registered: number;
  on_site: number;
}

/** 「按工种汇总」 (JB91): 登记 and 在场 per trade. */
export interface TradeSummary {
  results: Array<SiteWorkerTrade & TradeCount>;
  no_trade: TradeCount;
  registered: number;
  on_site: number;
  /** The moment the numbers were counted (「最后更新」). */
  updated_at: string;
}

export interface CompanyOption {
  value: string;
  label: string;
  kind: "SUPPLIER" | "TYPED";
}

export interface IssuedWorkerLink {
  link_url: string;
  replaced: boolean;
  worker: SiteWorker;
}

/** What the worker's own page reads about its link. */
export interface WorkerLinkState {
  project_name: string;
  company_name: string;
  bound: boolean;
  consented: boolean;
  worker_name: string;
  last_position_at: string | null;
  interval_seconds: number;
}

// --- 批量新增人员 (JB61-1) ---------------------------------------------------

export type BatchRowSource = "TYPED" | "EXCEL" | "UPLOAD" | "PHONE";
export type PassportReadStatus = "NONE" | "READ" | "CHECK_FAILED" | "UNREADABLE";

export interface SiteWorkerBatch {
  id: string;
  project: string;
  project_name: string;
  supplier: string | null;
  supplier_name: string;
  company_note: string;
  company_name: string;
  status: "OPEN" | "DONE";
  saved_count: number;
  row_count: number;
  created_at: string;
}

export interface BatchRowData {
  id: string;
  position: number;
  name: string;
  phone: string;
  passport_no: string;
  nationality: string;
  date_of_birth: string;
  passport_expiry: string;
  cidb_no: string;
  company_text: string;
  trade_text: string;
  source: BatchRowSource;
  read_status: PassportReadStatus;
  needs_check: boolean;
  photo_url: string | null;
  photo_is_pdf: boolean;
}

export interface BatchRowProblem {
  code: string;
  values: Record<string, string>;
}

export interface BatchState {
  problems: Record<string, BatchRowProblem[]>;
  /** JB91: rows that only give a worker already on the roster a trade, and whose. */
  fills?: Record<string, { name: string }>;
  row_count: number;
  saved_count: number;
}

export interface BatchDetail extends BatchState {
  /** The server's clock: the first poll asks for rows since this. */
  now: string;
  batch: SiteWorkerBatch;
  rows: BatchRowData[];
}

export interface BatchRowsPoll extends BatchState {
  now: string;
  rows: BatchRowData[];
  status: "OPEN" | "DONE";
}

export interface BatchSyncRow {
  key?: string;
  id?: string;
  name?: string;
  phone?: string;
  passport_no?: string;
  nationality?: string;
  date_of_birth?: string;
  passport_expiry?: string;
  cidb_no?: string;
  company_text?: string;
  trade_text?: string;
  checked?: boolean;
}

export interface BatchSyncResult extends BatchState {
  ids: Record<string, string>;
  removed: string[];
}

export interface BatchPhotoResult extends BatchState {
  row: BatchRowData;
}

export interface BatchExcelResult extends BatchState {
  rows: BatchRowData[];
  added: number;
}

export interface BatchSaveResult extends BatchState {
  saved: number;
  saved_ids: string[];
  /** JB91: rows that gave a worker already on the roster a trade. */
  filled?: number;
  filled_ids?: string[];
  problem_count: number;
  last: number;
  done: boolean;
}

export interface CaptureLink {
  url: string;
  expires_at: string;
}

/** What a phone's capture page reads about its batch. */
export interface CaptureState {
  project_name: string;
  company_name: string;
  phone_count: number;
}

export interface CaptureResult {
  row: string;
  read_status: PassportReadStatus;
  name: string;
  passport_no: string;
  phone_count: number;
}
