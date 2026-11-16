/**
 * JB205-10 (Lucas 11-16 audit) - 系统设置, for older readers.
 *
 * - Each setting row has its own 保存, and leaving the page dropped an edit
 *   without a word. A row with an edit not saved now holds the page: the
 *   browser asks on a reload or a closed tab, and a link inside the app opens
 *   「还有设定没有保存」 first (`leavingTo` decides which clicks leave).
 * - 发布公告: the main 标题 / 内容 are the English text every reader falls
 *   back to, and the Chinese goes under 「其他语言」 - a line above the first
 *   field says so.
 *
 * The listeners run in effects, which static rendering does not run, so the
 * wiring is read in the source; the click rule is tested directly.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/system-settings/qr",
  useSearchParams: () => new URLSearchParams(),
}));

const { leavingTo } = await import("@/components/platform-settings/system-settings-workspace");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

const HERE = {
  href: "https://app.msetrace.test/system-settings/qr",
  origin: "https://app.msetrace.test",
  pathname: "/system-settings/qr",
  search: "",
};

function click(href: string | null, overrides: Record<string, unknown> = {}, anchor: Record<string, unknown> = {}) {
  const link =
    href === null
      ? null
      : {
          target: "",
          getAttribute: (name: string) => (name === "href" ? href : null),
          hasAttribute: (name: string) => name in anchor,
          ...anchor,
        };
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => link },
    ...overrides,
  };
}

describe("which clicks leave the settings page", () => {
  it("a menu link to another page in the app", () => {
    expect(leavingTo(click("/companies"), HERE)).toBe("/companies");
    expect(leavingTo(click("/integrations?company=c-1"), HERE)).toBe("/integrations?company=c-1");
    expect(leavingTo(click("/system-settings/notifications"), HERE)).toBe("/system-settings/notifications");
  });

  it("not a click that opens a new tab, another site, or this same page", () => {
    expect(leavingTo(click("/companies", { ctrlKey: true }), HERE)).toBeNull();
    expect(leavingTo(click("/companies", { button: 1 }), HERE)).toBeNull();
    expect(leavingTo(click("/companies", {}, { target: "_blank" }), HERE)).toBeNull();
    expect(leavingTo(click("/report.pdf", {}, { download: "" }), HERE)).toBeNull();
    expect(leavingTo(click("https://example.com/help"), HERE)).toBeNull();
    expect(leavingTo(click("/system-settings/qr"), HERE)).toBeNull();
    expect(leavingTo(click("#top"), HERE)).toBeNull();
  });

  it("not a click on something that is not a link, or one already handled", () => {
    expect(leavingTo(click(null), HERE)).toBeNull();
    expect(leavingTo(click("/companies", { defaultPrevented: true }), HERE)).toBeNull();
  });
});

describe("a row with an edit not saved holds the page", () => {
  const source = read("src/components/platform-settings/system-settings-workspace.tsx");

  it("each row says when it has one, and only an edit it could save", () => {
    expect(source).toMatch(
      /useUnsavedRow\(\n\s+`\$\{company \?\? ""\}:\$\{row\.key\}`,\n\s+!row\.is_readonly && can\("platform_settings\.manage"\) && value !== row\.value,\n\s+\);/,
    );
  });

  it("the settings page asks before leaving: browser and in-app links", () => {
    expect(source).toContain("<UnsavedLeaveGuard />");
    expect(source).toContain('window.addEventListener("beforeunload", warn);');
    expect(source).toContain('window.addEventListener("click", intercept, true);');
    expect(source).toContain("<ConfirmDialog");
    expect(source).not.toMatch(/window\.confirm|\bconfirm\(/);
  });

  it("is worded in all four languages", async () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = (await import(`@/messages/${locale}.json`)).default as typeof zh;
      const leave = messages.adminSystemSettings.leave;
      expect([leave.title, leave.description, leave.confirm].every(Boolean), locale).toBe(true);
    }
    expect(zh.adminSystemSettings.leave.confirm).toBe("离开，不保存");
  });
});

describe("发布公告 says which fields are English", () => {
  it("a line above the first field", () => {
    const source = read("src/components/platform-settings/announcement-panel.tsx");
    const hint = source.indexOf('{t("mainLanguageHint")}');
    const title = source.indexOf('<FieldWrapper label={t("field.title")} required>');
    expect(hint).toBeGreaterThan(-1);
    expect(hint).toBeLessThan(title);
  });

  it("names 其他语言, in all four languages", async () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = (await import(`@/messages/${locale}.json`)).default as typeof zh;
      const announcements = messages.adminSystemSettings.announcements;
      expect(announcements.mainLanguageHint, locale).toContain(announcements.translations);
    }
  });
});
