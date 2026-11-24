/**
 * JB237 (客户 11-23 事项 9): 「申请批准不等于批准车辆出场」 - a 材料出场's 出门条
 * after the approval is 「准备出门条」; the site's exit photos come first;
 * 【启动出门条】 is drawn locked (with the reason) until they are in; only after
 * it may the safety manager sign. The server refuses every skip on its own
 * (`contractor_ops/tests/test_jb237_exit_pass_start.py`); these prove what
 * the screen says at each step, in four languages.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ExitPass, ExitPassStart } from "@/interfaces/exit-pass";
import { recordStatusLabel } from "@/lib/record-status";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-office", is_field_staff: false }, can: () => true }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ExitPassSections } = await import("@/components/contractor-ops/exit-pass-panel");
const { exitPass } = await import("@/components/contractor-ops/jb217-exit-pass-fixtures");

function start(overrides: Partial<ExitPassStart> = {}): ExitPassStart {
  return {
    needed: true,
    photos_in: false,
    photos_at: null,
    started_by_name: "",
    started_at: null,
    may_start: false,
    can_start: false,
    ...overrides,
  };
}

function approval(pass: ExitPass, readOnly = false) {
  const html = renderDetail(<ExitPassSections pass={pass} readOnly={readOnly} />);
  const at = html.indexOf('data-exit-pass-part="approval"');
  const next = html.indexOf("data-exit-pass-part=", at + 10);
  return html.slice(at, next < 0 ? undefined : next);
}

describe("启动出门条 (JB237)", () => {
  it("approved, no photos: 「准备出门条」, why it is not a release yet, and the office's button locked with its reason", () => {
    const html = approval(exitPass({ state: "awaiting_photos", start: start({ may_start: true }) }));
    expect(html).toContain("准备出门条");
    expect(html).toContain("申请已批准，但这还不是放行");
    expect(html).toContain("data-exit-pass-start-button");
    expect(html).toMatch(/data-exit-pass-start-button[^>]*disabled|disabled[^>]*data-exit-pass-start-button/);
    expect(html).toContain("现场还没有提交出场照片，按钮锁定");
    // Nobody can sign yet: no 【签名批准】.
    expect(html).not.toContain("data-exit-pass-sign");
  });

  it("photos in: the office's button can be pressed and says when the photos came", () => {
    const html = approval(
      exitPass({
        state: "awaiting_start",
        start: start({ photos_in: true, photos_at: "2026-11-24T02:00:00Z", may_start: true, can_start: true }),
      }),
    );
    expect(html).toContain("等待启动出门条");
    expect(html).toContain("现场照片已提交（");
    expect(html).toContain("data-exit-pass-start-button");
    expect(html).not.toMatch(/data-exit-pass-start-button[^>]*disabled=""/);
    expect(html).not.toContain("按钮锁定");
  });

  it("a safety manager or a reader without the right sees whose step it is, never the button", () => {
    const waiting = approval(
      exitPass({ state: "awaiting_start", start: start({ photos_in: true, photos_at: "2026-11-24T02:00:00Z" }) }),
    );
    expect(waiting).toContain("现场照片已提交，等待后台按【启动出门条】");
    expect(waiting).not.toContain("data-exit-pass-start-button");
    // A read-only sheet (现场记录中心, 我提交过的) never draws it either.
    const sheet = approval(
      exitPass({ state: "awaiting_start", start: start({ photos_in: true, may_start: true, can_start: true }) }),
      true,
    );
    expect(sheet).not.toContain("data-exit-pass-start-button");
  });

  it("started: who pressed 【启动出门条】 and when stays on the pass, and the signature opens", () => {
    const html = approval(
      exitPass({
        state: "awaiting_signature",
        can_sign: true,
        start: start({ photos_in: true, started_by_name: "Wang HQ", started_at: "2026-11-24T03:00:00Z" }),
      }),
    );
    expect(html).toContain("已启动：Wang HQ");
    expect(html).toContain("data-exit-pass-sign");
    expect(html).not.toContain("data-exit-pass-start-button");
  });

  it("a record archived or returned while preparing waits for nothing: no 「准备出门条」, no button", () => {
    const html = approval(
      exitPass({ state: "awaiting_photos", record_closed: "archived", start: start({ may_start: true }) }),
    );
    expect(html).not.toContain("准备出门条");
    expect(html).not.toContain("data-exit-pass-start-button");
    expect(html).toContain("未批准");
  });

  it("the start button sits above the signature in the client's order (photos → start → sign)", () => {
    const source = readFileSync(path.join(__dirname, "exit-pass-panel.tsx"), "utf8");
    expect(source).toContain("startExitPass(pass.kind, pass.record)");
    expect(source.indexOf("beforeStart ? (")).toBeLessThan(source.indexOf("pass.can_sign && !readOnly"));
  });
});

describe("准备出门条 in four languages (JB237)", () => {
  const catalogues = { zh, "zh-TW": zhTW, en, ms } as const;
  const keys = [
    "exitPass.start.title",
    "exitPass.start.button",
    "exitPass.start.preparing",
    "exitPass.start.waitingStart",
    "exitPass.start.noPhotos",
    "exitPass.start.lockedReason",
    "exitPass.start.photosIn",
    "exitPass.start.waitingOffice",
    "exitPass.start.started",
    "exitPass.start.confirm",
    "exitPass.start.done",
    "audit.operation.exit_pass_started",
    "errors.api.exit_pass_photos_missing",
    "errors.api.exit_pass_not_started",
    "errors.api.exit_pass_start_not_allowed",
    "errors.api.exit_pass_already_started",
  ];
  const read = (catalogue: unknown, dotted: string) =>
    dotted.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], catalogue);

  it("every new word is in all four catalogues and never says 您", () => {
    for (const [language, catalogue] of Object.entries(catalogues)) {
      for (const key of keys) {
        const value = read(catalogue, key);
        expect(typeof value, `${language} ${key}`).toBe("string");
        expect(String(value)).not.toContain("您");
      }
    }
  });

  it("an approved 材料出场 reads 「准备出门条」; a 材料领用 keeps its own words", () => {
    expect(zh.contractorOps.outgoingStatus.APPROVED).toBe("准备出门条");
    expect(zhTW.contractorOps.outgoingStatus.APPROVED).toBe("準備出門條");
    expect(en.contractorOps.outgoingStatus.APPROVED).toBe("Preparing exit pass");
    expect(ms.contractorOps.outgoingStatus.APPROVED).toBe("Menyediakan pas keluar");
    const t = Object.assign(
      (key: string) => String(read(zh, key)),
      { has: (key: string) => typeof read(zh, key) === "string" },
    );
    expect(recordStatusLabel(t, { kind: "MATERIAL_OUTGOING", status: "APPROVED", status_label: "" })).toBe("准备出门条");
    expect(
      recordStatusLabel(t, { kind: "MATERIAL_OUTGOING", status: "APPROVED", status_label: "", outgoing_kind: "ISSUE" }),
    ).toBe("已批准 / 等待领用");
  });
});
