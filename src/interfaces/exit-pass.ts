/**
 * 出门条 (JB217, 客户 11-18 事项 2): an exit record's 「出门条批准（安全经理）」,
 * 「外部审批」 and 「门岗放行」, as `GET /api/exit-passes/get_pass/` sends them
 * (`wt/review/jb217-contract.md` §2).
 *
 * Called "exit pass" in code, never "gate pass": that is already the name of
 * the 人员/车辆通行证 (`SiteAccessPass`, `confirmGatePass`).
 */

import type { MySubmissionField, MySubmissionPhoto } from "@/interfaces/contractor";

/** The four 出场事项 (plan D1). 材料领用 has none. */
export type ExitPassKind =
  | "MATERIAL_OUTGOING"
  | "EQUIPMENT_MOVEMENT"
  | "WASTE_OUTGOING"
  | "DISPOSAL_REQUEST";

export const EXIT_PASS_KINDS: readonly ExitPassKind[] = [
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
];

export function isExitPassKind(kind: string | null | undefined): kind is ExitPassKind {
  return EXIT_PASS_KINDS.includes(kind as ExitPassKind);
}

/**
 * Where the pass is (contract §2 「state → what the screen shows」).
 * `not_applicable`: a 材料领用 or a machine's entry - no panel at all.
 */
export type ExitPassState =
  | "not_applicable"
  | "not_ready"
  | "legacy"
  /** JB237 (材料出场): approved - 「准备出门条」 - the site's exit photos not in yet. */
  | "awaiting_photos"
  /** JB237 (材料出场): photos in, the office has not pressed 【启动出门条】. */
  | "awaiting_start"
  /** JB285 (工地清运): approved, no executor chosen yet. */
  | "awaiting_executor"
  /** JB285 (工地清运): executor chosen, the load leaving not photographed yet. */
  | "awaiting_exit_evidence"
  | "awaiting_signature"
  | "awaiting_external"
  | "sent"
  | "released";

/** The record is over: no button acts any more. */
export type ExitPassRecordClosed = "" | "archived" | "rejected" | "cancelled";

export interface ExitPassApproval {
  /** As signed (an assistant's PIN: 「助理 X（代 LILY TAN）」). */
  name: string;
  /** 职位 at signing time. */
  title: string;
  signature: string;
  at: string;
}

export interface ExitPassExternal {
  status: "not_required" | "waiting" | "done";
  required: boolean;
  set_by_name: string;
  set_at: string | null;
  /** Turned off after the safety manager signed (「不需要外部审批，直接发出门条」). */
  waived_by_name: string;
  waived_at: string | null;
  mode: "" | "ONLINE" | "PAPER";
  /** 所属公司／部门 */
  company: string;
  /** 审批人姓名 */
  name: string;
  /** 审批意见 */
  opinion: string;
  /** 日期, `YYYY-MM-DD` */
  date: string | null;
  /** The drawn signature (ONLINE only). */
  signature: string | null;
  /** The signed copy, one of the record's own 附件 (PAPER only). */
  attachment: { id: string; name: string; url: string } | null;
  recorded_by_name: string;
  recorded_at: string | null;
  /** May turn 「需要外部审批」 on or off now (before the safety manager signs). */
  can_set: boolean;
  /** May turn it off although signed (web, PIN `exit_pass.waive_external`). */
  can_waive: boolean;
  can_sign_online: boolean;
  can_record_paper: boolean;
  /** 【换一个签回的文件】: a paper copy is registered and nothing released yet (contract v2). */
  can_correct_paper: boolean;
  /** Prefill for 【在线签名】; `name` is fixed. */
  online_defaults: { company: string; name: string } | null;
}

export interface ExitPassSent {
  at: string;
  to: { name: string; role: "applicant" | "gate" }[];
  no_gate_phones: boolean;
}

export interface ExitPassReleasePhoto {
  id: string;
  image: string;
  watermarked_image: string;
  captured_at: string | null;
  latitude: string | null;
  longitude: string | null;
}

/** One 门岗放行: a 门岗事项 (GT-…) closed by the guard who released. */
export interface ExitPassRelease {
  incident_id: string;
  incident_no: string;
  by: string;
  at: string;
  photos: ExitPassReleasePhoto[];
  /** JB290 (工地清运): 第几车 this release let out; null on other kinds and older releases. */
  trip_seq?: number | null;
  /** JB290: that lorry's plate. */
  vehicle_plate?: string;
}

/** The record itself, as 我提交过的 shows it (`mySubmissions.field.*` keys). */
export interface ExitPassRecordView {
  kind: string;
  id: string;
  label: string;
  status: string;
  status_label: string;
  fields: MySubmissionField[];
  photos: MySubmissionPhoto[];
}

export interface ExitPass {
  kind: ExitPassKind;
  record: string;
  pass_id: string | null;
  project: string;
  project_name: string;
  reference: string;
  /** One line: what goes. */
  summary: string;
  vehicle_plate: string;
  applicant_name: string;
  applicant_phone: string;
  state: ExitPassState;
  record_closed: ExitPassRecordClosed;
  multi_release: boolean;
  approval: ExitPassApproval | null;
  /** The first five who may sign, and how many there are. */
  signers: { names: string[]; total: number };
  no_signers: boolean;
  /** With `no_signers`: the applicant is the project's only 安全经理 (contract v2 §11). */
  applicant_is_only_signer: boolean;
  /** 改正 after the safety manager signed: when and by whom (contract v2 §11). */
  corrected_after_approval: { at: string; by: string } | null;
  can_sign: boolean;
  /**
   * JB237 (客户 11-23 事项 9, 材料出场 only): 准备出门条 → 现场出场照片 →
   * 【启动出门条】 → the safety manager signs. Absent from a server before JB237.
   */
  start?: ExitPassStart;
  /**
   * JB285 (客户 11-26 事项 26, 工地清运 only): approved → executor → 装车与工地出场
   * 证据 → the safety manager signs. Absent from a server before JB285.
   */
  evidence?: ExitPassEvidence;
  external: ExitPassExternal;
  sent: ExitPassSent | null;
  releases: ExitPassRelease[];
  can_release: boolean;
  /**
   * Why this phone may not 【确认放行】 although it otherwise could (contract v3, audit F1):
   * the record's own applicant, or - on a project with 门岗 phones - a phone that is not one.
   * The window shows `errors.api.<code>` where 【确认放行】 would be.
   */
  release_blocked: ExitPassReleaseBlock | null;
  /**
   * A 工地清运 whose 出门条 was sent, no lorry released, and the job is over
   * (contract v4 F8): `state` stays `"sent"`, `can_release` false; the
   * 门岗放行 part reads 「本清运已结束」, not 「等待门岗放行」.
   */
  release_ended: boolean;
  /**
   * JB290 (客户 11-27d, 工地清运 only): the lorry the gate may release now - its
   * plate and the driver's and the site person-in-charge's signatures. Null on
   * other kinds; absent from a server before JB290.
   */
  lorry?: ExitPassLorry | null;
  /**
   * JB290: why 拍照 / 上传 / 确认放行 are locked on this phone although it may
   * release - the site has not filled the lorry's plate and signatures, or no
   * lorry is left. Words: `errors.api.<code>`.
   */
  release_locked?: ExitPassReleaseLock | null;
  record_view?: ExitPassRecordView | null;
}

/** 【启动出门条】 (JB237): the step between the site's photos and the signature. */
export interface ExitPassStart {
  /** This kind has the step (材料出场). */
  needed: boolean;
  /** The site's 实际退场 (photos of the vehicle and the goods) is in. */
  photos_in: boolean;
  photos_at: string | null;
  started_by_name: string;
  started_at: string | null;
  /** The office approver of this project: the button is drawn (locked while no photos). */
  may_start: boolean;
  /** …and may be pressed now. */
  can_start: boolean;
}

/** JB285: what a 工地清运's signature waits for. */
export type ExitPassEvidence =
  | { needed: false }
  | {
      needed: true;
      /** 【选择执行人】 done (internal worker or outside company), or the driver started. */
      executor_chosen: boolean;
      /** At least one 车辆出场 / Gate Pass / 装车 photograph. */
      photos_in: boolean;
      photos_count: number;
      photos_at: string | null;
      /** A safety manager of the project: 【签名批准】 is drawn locked, with the reason. */
      may_sign_later: boolean;
    };

/** `release_blocked` (contract v3): the same codes the release refuses with. */
export type ExitPassReleaseBlock = "exit_pass_own_release" | "exit_pass_gate_release_only";

/** JB290: the gate's lock on a 工地清运's lorry. */
export type ExitPassReleaseLock = "disposal_lorry_sheet_missing" | "disposal_no_lorry_left";

/** JB290: the lorry of a 工地清运 the gate may release now. */
export interface ExitPassLorry {
  state: "ready" | "waiting_sheet" | "none_left";
  trip: {
    id: string;
    seq: number;
    vehicle_plate: string;
    sheet: {
      id: string;
      vehicle_plate: string;
      driver_name: string;
      driver_signature: string | null;
      site_signer_name: string;
      site_signature: string | null;
      filled_by_name: string;
      signed_at: string | null;
    } | null;
  } | null;
}

/** One row of the guard's 「待放行」 (contract §4.1). */
export interface ExitPassWaiting {
  kind: ExitPassKind;
  record: string;
  reference: string;
  project: string;
  project_name: string;
  summary: string;
  vehicle_plate: string;
  sent_at: string;
  multi_release: boolean;
  release_count: number;
  /** JB290 (工地清运): the next lorry has its plate and both signatures. */
  lorry_ready?: boolean;
  /** JB290: 第几车 is next; null when none is left or on other kinds. */
  lorry_seq?: number | null;
}

/** A gate record's 「关联原申请」 (contract §7). */
export interface ExitRecordLink {
  kind: ExitPassKind;
  id: string;
  reference: string;
  project: string;
}

/** `exit_pass=<KIND>:<uuid>` from a notice's link, or `null` when it is not one. */
export function parseExitPassParam(
  value: string | null | undefined,
): { kind: ExitPassKind; record: string } | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const kind = value.slice(0, at);
  const record = value.slice(at + 1);
  if (!record || !isExitPassKind(kind)) return null;
  return { kind, record };
}
