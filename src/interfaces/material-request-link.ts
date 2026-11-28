import type {
  MaterialRequestExecutionStatus,
  MaterialRequestStatus,
  MaterialRequestType,
} from "@/interfaces/material-request";

/**
 * 材料进场 / 材料退场 / 材料领用 linked to their MR / 其他申请 (JB279, 客户 11-26
 * 事项 20). Endpoints in `contractor_ops/material_request_links.py`.
 */
export type RequestLinkRecordKind = "MATERIAL_RECEIPT" | "MATERIAL_OUTGOING";

/** One request as a picker and a record's page show it. */
export interface LinkableRequest {
  id: string;
  request_no: string;
  request_type: MaterialRequestType;
  request_kind_name: string;
  subject: string;
  material_name: string;
  specification: string;
  quantity: string | null;
  unit: string;
  lines: { material_name: string; specification: string; quantity: string | null; unit: string }[];
  status: MaterialRequestStatus;
  execution_status: MaterialRequestExecutionStatus | "";
  created_at: string | null;
  project: string;
}

export interface RecordRequestLink extends LinkableRequest {
  linked_at: string | null;
  linked_by_name: string;
}

/**
 * JB302 (客户 11-28e): how one material of a linked record is counted against
 * the lines of its MR. `exact` the same 材料、规格、单位; `auto` the only
 * 规格 to count under; `chosen` the office chose; `pick` the office must
 * choose; `unit` the MR holds it in another unit; `none` not in the MR.
 */
export type SpecMatchState = "exact" | "auto" | "chosen" | "pick" | "unit" | "none";
export type SpecMatchTarget = "receipt_line" | "outgoing" | "issue_line";

/** A line of a linked MR a material may be counted under. */
export interface SpecMatchOption {
  id: string;
  request: string;
  request_no: string;
  position: number;
  material_name: string;
  specification: string;
  unit: string;
  quantity: string | null;
}

/** One material of the record under 「规格核对」. */
export interface SpecMatch {
  target: SpecMatchTarget;
  id: string;
  position: number;
  material_name: string;
  specification: string;
  unit: string;
  quantity: string | null;
  state: SpecMatchState;
  /** Waits for the office before 确认归档. */
  unsettled: boolean;
  /** The MR line it is counted under, if any. */
  request_line: SpecMatchOption | null;
  /** The lines the office may choose from (same material and unit). */
  options: SpecMatchOption[];
}

/** A record's links (`get_links` / `set_links`). */
export interface RecordRequestLinks {
  kind: RequestLinkRecordKind;
  record: string;
  project: string;
  reference: string;
  archived: boolean;
  /** No live link: 「未完成关联，不允许确认归档」. */
  missing: boolean;
  /** An office account that acts on the record, before it is archived. */
  may_change: boolean;
  links: RecordRequestLink[];
  /** JB302 「规格核对」: each material and the MR line it is counted under. */
  matches?: SpecMatch[];
  /** A material still waits for the office's choice (archive refused). */
  spec_unmatched?: boolean;
}

/** 进场 / 退场 / 领用 as one request's page lists them. */
export type LinkedRecordKind = "RECEIPT" | "RETURN" | "ISSUE";

export interface LinkedRecordMaterial {
  material_name: string;
  specification: string;
  unit: string;
  /** What arrived, left or was handed over; what was applied for until then. */
  quantity: string | null;
  /** Set while only the applied quantity is known (a 退场 / 领用 not done yet). */
  applied_quantity: string | null;
  /** The material is one of the request's (「不在申请里」 when false). */
  in_request: boolean;
  /** JB302: counted under this MR line rather than its own words. */
  counted_as?: { request_no: string; material_name: string; specification: string; unit: string } | null;
}

export interface LinkedRecord {
  kind: LinkedRecordKind;
  record_kind: RequestLinkRecordKind;
  id: string;
  reference: string;
  date: string | null;
  /** A receipt's 验收 (PENDING / ACCEPTED / REJECTED) or an outgoing's status. */
  status: string;
  /** Counted in the totals: a delivery not rejected, a 退场 / 领用 completed. */
  counted: boolean;
  materials: LinkedRecordMaterial[];
}

/** One material of a material request against its linked records, each kind apart. */
export interface LinkedRecordTotal {
  material_name: string;
  specification: string;
  unit: string;
  applied_quantity: string | null;
  received_quantity: string | null;
  returned_quantity: string | null;
  issued_quantity: string | null;
  outstanding_quantity: string | null;
  over_quantity: string | null;
}

export interface RequestLinkedRecords {
  request: string;
  request_no: string;
  request_type: MaterialRequestType;
  records: LinkedRecord[];
  totals: LinkedRecordTotal[];
}
