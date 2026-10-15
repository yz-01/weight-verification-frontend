import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { GatePassCheck, VisitorArrival } from "@/interfaces/site-access";
import {
  canNotifyHost,
  gateVisitorStep,
  visitStatusTone,
  waitedMinutes,
} from "@/lib/visitor-arrival";

function check(over: Partial<GatePassCheck> = {}): GatePassCheck {
  return {
    project: "p1",
    pass: { pass_no: "PASS-1", project_name: "Site A", subject_name: "Ali" },
    refusal: null,
    refusal_message: "",
    can_enter: true,
    can_exit: false,
    last_direction: null,
    last_at: null,
    needs_host: true,
    arrival: null,
    ...over,
  };
}

function visit(over: Partial<VisitorArrival> = {}): VisitorArrival {
  return {
    id: "a1",
    arrival_no: "VA-SITE-261015-001",
    project: "p1",
    project_name: "Site A",
    pass_id: "pass1",
    pass_no: "PASS-1",
    subject_type: "VISITOR",
    subject_name: "Ali",
    subject_company: "QA",
    phone: "",
    purpose: "Inspection",
    valid_until: "2026-10-15T18:00:00+08:00",
    host: "u1",
    host_name: "Siti",
    gate_user: "g1",
    gate_user_name: "Guard",
    gate_name: "",
    arrived_at: "2026-10-15T09:00:00+08:00",
    latitude: null,
    longitude: null,
    status: "AWAITING_HOST",
    visit_status: "AWAITING_HOST",
    confirmed_by_name: "",
    confirmed_at: null,
    declined_by_name: "",
    declined_at: null,
    decline_reason: "",
    on_behalf: false,
    cancelled_by_name: null,
    cancelled_at: null,
    entry_at: null,
    exit_at: null,
    photos: [],
    may_answer: false,
    may_cancel: true,
    qr_value: "MSEACCESS:x",
    created_at: "2026-10-15T09:00:00+08:00",
    ...over,
  };
}

describe("the guard's visitor steps (I26)", () => {
  it("a refused or unread pass goes no further", () => {
    expect(gateVisitorStep(undefined)).toBe("refused");
    expect(gateVisitorStep(check({ refusal: "expired" }))).toBe("refused");
  });

  it("a worker's or a lorry's pass keeps its own buttons", () => {
    expect(gateVisitorStep(check({ needs_host: false }))).toBe("other");
  });

  it("a visitor at the gate is photographed first", () => {
    expect(gateVisitorStep(check())).toBe("photo");
  });

  it("waits for the host, then turns green or red", () => {
    expect(gateVisitorStep(check(), visit())).toBe("waiting");
    expect(gateVisitorStep(check(), visit({ status: "CONFIRMED" }))).toBe("confirmed");
    expect(gateVisitorStep(check(), visit({ status: "DECLINED" }))).toBe("declined");
  });

  it("a visit already waiting on this pass is picked up from the check", () => {
    expect(gateVisitorStep(check({ arrival: visit() }))).toBe("waiting");
  });

  it("a cancelled visit starts again with a photo; a visitor inside goes out", () => {
    expect(gateVisitorStep(check(), visit({ status: "CANCELLED" }))).toBe("photo");
    expect(gateVisitorStep(check({ can_enter: false, can_exit: true }))).toBe("exit");
    expect(
      gateVisitorStep(
        check({ can_enter: false, can_exit: true }),
        visit({ status: "CONFIRMED", entry_at: "2026-10-15T09:05:00+08:00" }),
      ),
    ).toBe("exit");
  });

  it("notifies the host only with a photo and a host", () => {
    expect(canNotifyHost(0, "u1")).toBe(false);
    expect(canNotifyHost(1, "")).toBe(false);
    expect(canNotifyHost(2, "u1")).toBe(true);
  });

  it("counts the minutes waited", () => {
    const since = "2026-10-15T09:00:00Z";
    expect(waitedMinutes(since, Date.parse("2026-10-15T09:04:59Z"))).toBe(4);
    expect(waitedMinutes(since, Date.parse("2026-10-15T08:59:00Z"))).toBe(0);
    expect(waitedMinutes("not a time")).toBe(0);
  });

  it("colours a visit by where it stands", () => {
    expect(visitStatusTone("AWAITING_HOST")).toBe("warning");
    expect(visitStatusTone("CONFIRMED")).toBe("positive");
    expect(visitStatusTone("DECLINED")).toBe("danger");
    expect(visitStatusTone("LEFT")).toBe("neutral");
  });
});

describe("the visitor words in four languages (I26)", () => {
  const read = (locale: string) =>
    JSON.parse(readFileSync(path.join(process.cwd(), "src/messages", `${locale}.json`), "utf8"));
  const statuses = ["AWAITING_HOST", "CONFIRMED", "DECLINED", "CANCELLED", "ON_SITE", "LEFT"];

  for (const locale of ["en", "zh", "zh-TW", "ms"]) {
    it(`${locale} names every visit status and the 409`, () => {
      const messages = read(locale);
      for (const status of statuses) {
        expect(messages.siteControl.visitorArrival.status[status], status).toBeTruthy();
      }
      expect(messages.siteControl.visitorScan.refusal.host_not_confirmed).toBeTruthy();
      expect(messages.errors.api.gate_pass_host_not_confirmed).toBeTruthy();
      expect(messages.archiveQueue.kind.VISITOR_ARRIVAL).toBeTruthy();
    });
  }

  it("the Chinese guard reads 已确认 and 放行", () => {
    const zh = read("zh");
    expect(zh.siteControl.visitorArrival.confirmedBanner).toContain("已确认");
    expect(zh.siteControl.visitorArrival.letIn).toBe("放行");
    expect(zh.siteControl.visitorArrival.notifyHost).toBe("通知接待人");
  });
});
