/**
 * Found by the 11-06 screenshot run: 「项目人员名单」 showed phone accounts'
 * placeholder emails (field+…@mse.invalid), and the delivery-note 作废 / 取消
 * dialog asked for titles that sat under the wrong key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { contactOf } = await import("@/components/projects/view-project");

describe("a person on the project's team", () => {
  it("a phone account shows its number, never its placeholder email", () => {
    expect(
      contactOf({ is_field_staff: true, user_phone: "+60129990001", user_email: "field+1@mse.invalid" }),
    ).toBe("+60129990001");
    expect(contactOf({ is_field_staff: true, user_email: "field+1@mse.invalid" })).toBe("");
  });

  it("an office account shows its email", () => {
    expect(contactOf({ is_field_staff: false, user_phone: "", user_email: "pm@example.com" })).toBe("pm@example.com");
  });
});

describe("发送项目通知's recipient list (JB159)", () => {
  // It listed phone accounts as field+…@mse.invalid.
  it("shows a phone account's number, or nothing, never the placeholder", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/notifications/notifications.tsx"), "utf8");
    expect(source).not.toContain("{row.user_email}");
    expect(source).toContain("{contactOf(row)}");
    // Whatever the account says it is, a placeholder address is never shown.
    expect(contactOf({ is_field_staff: false, user_phone: "+60129990077", user_email: "field+e65d@mse.invalid" })).toBe(
      "+60129990077",
    );
    expect(contactOf({ is_field_staff: false, user_email: "field+e65d@mse.invalid" })).toBe("");
    // A real address at that domain (the demo office accounts) stays.
    expect(contactOf({ is_field_staff: false, user_email: "shifan.admin@mse.invalid" })).toBe("shifan.admin@mse.invalid");
  });
});

describe("the delivery-note 作废 / 取消 dialog has its words", () => {
  it.each([
    ["zh", zh],
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ])("%s", (_, messages) => {
    const qr = (messages as { qrCodes: Record<string, { title?: string; description?: string }> }).qrCodes;
    for (const key of ["voidDialog", "cancelDialog"]) {
      expect(qr[key]?.title, key).toBeTruthy();
      expect(qr[key]?.description, key).toBeTruthy();
    }
  });
});

describe("the 项目负责人 choices name a preset role in the reader's language", () => {
  // Found by the 11-06 round-4 screenshots: 「示范 项目经理 · Project Manager」 on the zh page.
  it.each([
    ["Project Manager", "项目经理"],
    ["Headquarters", "总部"],
    ["Quantity Surveyor (QS)", "工料测量师（QS）"],
  ])("%s", async (stored, shown) => {
    const { createTranslator } = await import("next-intl");
    const { roleLabel } = await import("@/lib/role-labels");
    const t = createTranslator({ locale: "zh", messages: zh });
    expect(roleLabel(null, stored, t as never)).toBe(shown);
  });
});
