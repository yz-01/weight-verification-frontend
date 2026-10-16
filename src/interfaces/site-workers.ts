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
  phone: string;
  cidb_no: string;
  supplier: string | null;
  supplier_name: string;
  company_note: string;
  company_name: string;
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
  cidb_no: string;
  supplier: string | null;
  company_note: string;
  documents: SiteWorkerDocument[];
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
