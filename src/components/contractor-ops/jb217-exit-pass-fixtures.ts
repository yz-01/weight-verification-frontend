/**
 * JB217 test fixtures: one 出门条 as `GET /api/exit-passes/get_pass/` sends it
 * (`wt/review/jb217-contract.md` §2), and its states.
 *
 * Test-only: imported by `*.test.tsx` files and nothing else.
 */
import type { ExitPass } from "@/interfaces/exit-pass";

const EXTERNAL_OFF: ExitPass["external"] = {
  status: "not_required",
  required: false,
  set_by_name: "",
  set_at: null,
  waived_by_name: "",
  waived_at: null,
  mode: "",
  company: "",
  name: "",
  opinion: "",
  date: null,
  signature: null,
  attachment: null,
  recorded_by_name: "",
  recorded_at: null,
  can_set: false,
  can_waive: false,
  can_sign_online: false,
  can_record_paper: false,
  can_correct_paper: false,
  online_defaults: null,
};

export const APPROVAL = {
  name: "LILY TAN",
  title: "Safety Manager · 安全部",
  signature: "https://cdn.example/exit-pass/approval.png",
  at: "2026-11-18T06:02:11Z",
};

export const SENT = {
  at: "2026-11-18T06:02:11Z",
  to: [
    { name: "ah ong", role: "applicant" as const },
    { name: "示范门岗", role: "gate" as const },
  ],
  no_gate_phones: false,
};

export const RELEASE = {
  incident_id: "gt-1",
  incident_no: "GT-PRJ-0001-045",
  by: "示范门岗",
  at: "2026-11-18T06:20:00Z",
  photos: [
    { id: "ph-1", image: "https://cdn.example/1.jpg", watermarked_image: "", captured_at: null, latitude: null, longitude: null },
    { id: "ph-2", image: "https://cdn.example/2.jpg", watermarked_image: "", captured_at: null, latitude: null, longitude: null },
  ],
};

/** A material return approved and waiting for the safety manager. */
export function exitPass(overrides: Partial<ExitPass> = {}): ExitPass {
  return {
    kind: "MATERIAL_OUTGOING",
    record: "mo-1",
    pass_id: "pass-1",
    project: "p-1",
    project_name: "示范商业大厦一期",
    reference: "MO-PRJ-0001-012",
    summary: "111 · 10.000 Bag",
    vehicle_plate: "MMP 7007",
    applicant_name: "ah ong",
    applicant_phone: "+60 12-345 6789",
    state: "awaiting_signature",
    record_closed: "",
    multi_release: false,
    approval: null,
    signers: { names: ["LILY TAN", "陈安全", "王五"], total: 3 },
    no_signers: false,
    applicant_is_only_signer: false,
    corrected_after_approval: null,
    can_sign: false,
    external: { ...EXTERNAL_OFF },
    sent: null,
    releases: [],
    can_release: false,
    release_blocked: null,
    release_ended: false,
    record_view: {
      kind: "MATERIAL_OUTGOING",
      id: "mo-1",
      label: "MO-PRJ-0001-012",
      status: "APPROVED",
      status_label: "已批准",
      fields: [{ key: "material_name", value: "111" }],
      photos: [{ id: "a-1", url: "https://cdn.example/app.jpg", thumbnail_url: null, caption: "申请时的照片" }],
    },
    ...overrides,
  };
}

export function external(overrides: Partial<ExitPass["external"]>): ExitPass["external"] {
  return { ...EXTERNAL_OFF, ...overrides };
}
