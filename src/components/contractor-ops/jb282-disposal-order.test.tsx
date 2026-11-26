/**
 * 垃圾清运 (客户 11-26 事项 23–27, JB282–JB286): the approval is the office's
 * (the phone shows the status only), the outside company's form marks the
 * refused field, the 出门条 waits for the executor and the exit photos, and
 * 【补录数字】 stands where 【更改供应商】 stood once a lorry is in. The server
 * refuses every skip on its own (`contractor_ops/tests/test_jb282_disposal_order.py`);
 * these prove what each screen draws and says, in four languages.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { DisposalRequest, DisposalTrip } from "@/interfaces/contractor-ops";
import type { ExitPass, ExitPassEvidence } from "@/interfaces/exit-pass";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/waste-clearance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-office", is_field_staff: false }, can: () => true }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ExitPassSections } = await import("@/components/contractor-ops/exit-pass-panel");
const { exitPass } = await import("@/components/contractor-ops/jb217-exit-pass-fixtures");
const { disposalSteps, fillEntries, linkExpiryPast, nowLinkInput, siteExitShots } = await import(
  "@/components/contractor-ops/site-disposal-workspaces"
);

const here = (file: string) => readFileSync(path.join(__dirname, file), "utf8");
const LANGUAGES = { zh, "zh-TW": zhTW, en, ms } as const;

function evidence(overrides: Partial<Extract<ExitPassEvidence, { needed: true }>> = {}): ExitPassEvidence {
  return {
    needed: true,
    executor_chosen: false,
    photos_in: false,
    photos_count: 0,
    photos_at: null,
    may_sign_later: true,
    ...overrides,
  };
}

function approval(pass: ExitPass, readOnly = false) {
  const html = renderDetail(<ExitPassSections pass={pass} readOnly={readOnly} />);
  const at = html.indexOf('data-exit-pass-part="approval"');
  const next = html.indexOf("data-exit-pass-part=", at + 10);
  return html.slice(at, next < 0 ? undefined : next);
}

function trip(seq: number, status: DisposalTrip["status"], extra: Partial<DisposalTrip> = {}): DisposalTrip {
  return {
    id: `t-${seq}`, seq, status, weight_kg: null, do_no: "", vehicle_plate: "", note: "",
    submitted_at: null, submitted_by_name: "", accepted_by_name: null, accepted_at: null,
    corrections: [], evidence: [], ...extra,
  };
}

type StepRow = Parameters<typeof disposalSteps>[0];
function job(status: DisposalRequest["status"], extra: Partial<StepRow> = {}): StepRow {
  return { status, assignment_type: "", collector_supplier: null, supplier_name: "", trips: [], ...extra };
}

describe("JB282 / JB283: the approval is the office computer's", () => {
  it("the phone never offers 审批 - not even with the permission; the office does", () => {
    const phone = { manage: true, confirm: true, phone: true };
    const office = { manage: true, confirm: true, phone: false };
    expect(disposalSteps(job("REQUESTED"), phone).review).toBeNull();
    expect(disposalSteps(job("REQUESTED"), office).review).toBe("open");
    // Approved: no review anywhere.
    expect(disposalSteps(job("APPROVED"), office).review).toBeNull();
  });

  it("an office account without the permission sees 审批 locked, saying why (图 34 showed nothing)", () => {
    expect(disposalSteps(job("REQUESTED"), { manage: false, confirm: false, phone: false }).review).toBe("locked");
    const source = here("site-disposal-workspaces.tsx");
    expect(source).toContain('steps.review === "locked" && <Button size="sm" data-disposal-review-locked disabled disabledReason={w("reviewLocked")} showReason>');
    expect(source).toContain('steps.review === "open" && <Button size="sm" onClick={() => onStep("reviewing")}>');
    // The only way to the approval sheet is the open step.
    expect(source.match(/onStep\("reviewing"\)/g)).toHaveLength(1);
    expect(zh.jb282.reviewLocked).toContain("审核及安排垃圾清运");
  });

  it("总部's approval list does not decide on the phone either", () => {
    const opener = readFileSync(path.join(__dirname, "../dashboard/approval-opener.tsx"), "utf8");
    expect(opener).toContain('!can("disposal.manage") || user?.is_field_staff || row.status !== "REQUESTED"');
  });

  it("the phone is not offered 更正 or 更换供应商, which only the office may sign", () => {
    const named = job("IN_PROGRESS", { assignment_type: "", collector_supplier: "s-1", supplier_name: "Best" });
    expect(disposalSteps(named, { manage: true, confirm: true, phone: true }).supplier).toBe(false);
    expect(disposalSteps(named, { manage: true, confirm: true, phone: false }).supplier).toBe(true);
    expect(here("site-disposal-workspaces.tsx")).toContain("{canCorrectTrip(row, trip) && !phone && (");
  });
});

describe("JB284: the outside company's form marks the refused field", () => {
  it("an expiry already gone is caught under its own box, and the box starts at now", () => {
    const now = new Date("2026-11-26T05:39:00Z").getTime();
    expect(linkExpiryPast(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(linkExpiryPast(new Date(now + 60_000).toISOString(), now)).toBe(false);
    expect(linkExpiryPast("", now)).toBe(false);
    expect(nowLinkInput(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("every field of the dialog shows the server's words under it", () => {
    const source = here("site-disposal-workspaces.tsx");
    for (const field of ["collector_supplier", "collector_contact_name", "collector_phone", "collector_email", "expires_at", "assigned_staff"]) {
      expect(source).toContain(`serverFieldError(save.error, "${field}")`);
    }
    expect(source).toContain('min={nowLinkInput()}');
  });

  it("the words exist in four languages", () => {
    for (const [lang, messages] of Object.entries(LANGUAGES)) {
      expect(messages.errors.field.link_expiry_past, lang).toBeTruthy();
      expect(messages.errors.field.supplier_inactive, lang).toBeTruthy();
      expect(messages.jb284.expiryPast, lang).toBeTruthy();
    }
    expect(zh.errors.field.link_expiry_past).toBe("这个时间已经过了，请选现在以后的时间。");
  });
});

describe("JB285: the 出门条 waits for the executor and the exit photos", () => {
  const disposal = (state: ExitPass["state"], ev: ExitPassEvidence, extra: Partial<ExitPass> = {}) =>
    exitPass({ kind: "DISPOSAL_REQUEST", state, evidence: ev, can_sign: false, ...extra });

  it("no executor yet: 准备出门条, the order, and 签名批准 locked saying 选择执行人", () => {
    const html = approval(disposal("awaiting_executor", evidence()));
    expect(html).toContain("准备出门条");
    expect(html).toContain("已选择执行人（内部工作人员或外部清运商）");
    expect(html).toContain("还没有选择执行人，现在不能签出门条");
    expect(html).toMatch(/data-exit-pass-sign-locked[^>]*disabled|disabled[^>]*data-exit-pass-sign-locked/);
    expect(html).not.toContain('data-exit-pass-sign=""');
    expect(html).toContain('data-step="executor" data-done="0"');
  });

  it("executor chosen, no photo: says the vehicle exit / Gate Pass photo is missing", () => {
    const html = approval(disposal("awaiting_exit_evidence", evidence({ executor_chosen: true })));
    expect(html).toContain('data-step="executor" data-done="1"');
    expect(html).toContain('data-step="photos" data-done="0"');
    expect(html).toContain("还没有拍车辆出场 / Gate Pass 照片");
  });

  it("everything in: the real 签名批准 opens (server state awaiting_signature)", () => {
    const html = approval(
      disposal("awaiting_signature", evidence({ executor_chosen: true, photos_in: true, photos_count: 2, photos_at: "2026-11-26T05:30:00Z", may_sign_later: false }), { can_sign: true }),
    );
    expect(html).toContain('data-exit-pass-sign=""');
    expect(html).not.toContain("data-exit-pass-sign-locked");
  });

  it("somebody who cannot sign reads the steps without a button; a read-only sheet too", () => {
    const reader = approval(disposal("awaiting_executor", evidence({ may_sign_later: false })));
    expect(reader).toContain("安全经理签名批准");
    expect(reader).not.toContain("data-exit-pass-sign-locked");
    expect(approval(disposal("awaiting_executor", evidence()), true)).not.toContain("data-exit-pass-sign-locked");
  });

  it("the executor's phone and the outside link take 车辆出场 / Gate Pass", () => {
    const source = here("site-disposal-workspaces.tsx");
    expect(source.match(/<SiteExitCapture /g)).toHaveLength(2);
    expect(source).toContain("addExternalDisposalSiteEvidence(token, { kind, image");
    const shots = siteExitShots(
      [
        { kind: "VEHICLE_EXIT", trip: "t-1" },
        { kind: "GATE_PASS", trip: "t-2" },
        { kind: "DISPOSAL_PROOF", trip: "t-1" },
        { kind: "GATE_PASS", trip: null },
      ] as Array<{ kind: DisposalRequest["evidence"][number]["kind"]; trip: string | null }>,
      "t-1",
    );
    expect(shots.map((shot) => shot.kind)).toEqual(["VEHICLE_EXIT", "GATE_PASS"]);
  });

  it("the new states and refusals are worded in four languages", () => {
    for (const [lang, messages] of Object.entries(LANGUAGES)) {
      for (const key of ["exit_pass_executor_missing", "exit_pass_exit_evidence_missing", "disposal_trip_number_recorded"] as const) {
        expect(messages.errors.api[key], `${lang} ${key}`).toBeTruthy();
      }
      expect(Object.keys(messages.jb285.step), lang).toEqual(["approved", "executor", "photos", "photosDone", "sign", "gate"]);
      expect(messages.audit.operation.external_site_evidence, lang).toBeTruthy();
      expect(messages.audit.operation.fill_trip_numbers, lang).toBeTruthy();
      expect(messages.siteDisposal.timelineEvent.TRIP_NUMBERS_FILLED, lang).toBeTruthy();
    }
  });
});

describe("JB286: 【补录数字】 where 【更改供应商】 stood (图 40)", () => {
  const office = { manage: true, confirm: true, phone: false };

  it("offered once a lorry is in while the job runs; not before, not on the phone", () => {
    expect(disposalSteps(job("IN_PROGRESS", { trips: [trip(1, "PLANNED")] }), office).fillNumbers).toBe(false);
    expect(disposalSteps(job("IN_PROGRESS", { trips: [trip(1, "SUBMITTED")] }), office).fillNumbers).toBe(true);
    expect(disposalSteps(job("ASSIGNED", { trips: [trip(1, "ACCEPTED"), trip(2, "PLANNED")] }), office).fillNumbers).toBe(true);
    expect(disposalSteps(job("IN_PROGRESS", { trips: [trip(1, "SUBMITTED")] }), { ...office, phone: true }).fillNumbers).toBe(false);
    // Finished: the existing 补录数字 (job totals) as before.
    expect(disposalSteps(job("COMPLETED", { trips: [trip(1, "ACCEPTED")] }), office).fillNumbers).toBe(false);
  });

  it("stands in 更改供应商's place; the company is still changed, after 加进资料包", () => {
    const source = here("site-disposal-workspaces.tsx");
    const regenerate = source.indexOf('onStep("regenerating")');
    const fill = source.indexOf("data-disposal-fill-numbers");
    const extra = source.indexOf("      {extra}\n") >= 0 ? source.indexOf("      {extra}\n") : source.indexOf("      {extra}\r\n");
    expect(regenerate).toBeLessThan(fill);
    expect(fill).toBeLessThan(source.indexOf("{!steps.fillNumbers && supplierButton}"));
    expect(extra).toBeLessThan(source.indexOf("{steps.fillNumbers && supplierButton}"));
  });

  it("sends only the blanks typed into, the plate as the server keeps it", () => {
    const lorries = [
      trip(1, "SUBMITTED", { weight_kg: "5000.00" }),
      trip(2, "ACCEPTED", { do_no: "DO-1" }),
      trip(3, "SUBMITTED"),
    ];
    expect(
      fillEntries(lorries, {
        "t-1": { weight_kg: "6000", do_no: "DO-9", vehicle_plate: " wxy  1234 " },
        "t-2": { weight_kg: "", do_no: "DO-2", vehicle_plate: "" },
        "t-3": { weight_kg: "", do_no: "", vehicle_plate: "" },
      }),
    ).toEqual([{ trip: "t-1", do_no: "DO-9", vehicle_plate: "WXY 1234" }]);
  });

  it("its history line says 补录 instead of an empty reason", () => {
    expect(here("site-disposal-workspaces.tsx")).toContain('reason: item.reason || filled("historyFilled")');
    expect(zh.jb286.historyFilled).toBe("补录");
    expect(zh.siteDisposal.action.recordNumbers).toBe("补录数字");
  });
});
