/**
 * JB215B (Lucas 11-17: 「把你发现到的问题全部修复」) - two leftovers from the
 * 11-16 audit that live in the shared navigation registry.
 *
 * - JB215B-3: 施工准证 (`/permits`) opened the 「?」 help of the removed
 *   安全事件 / 事故上报 (`pageHelp.safety`, noticed in JB206); it has its own,
 *   written from what the page does.
 * - JB215B-7: 后台任务 (`/monitoring/jobs`) needs `platform.maintenance` on
 *   the server (JB205-5). The menu hid it, but typing the address opened a
 *   page of refusals; the address is now refused like the other admin pages
 *   (the dashboard shell bounces it with the standard toast).
 */
import { describe, expect, it } from "vitest";

import { isRouteAllowed } from "@/lib/navigation";
import { helpKeyFor, helpKeys } from "@/lib/page-help";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const ALL = [zh, zhTW, en, ms];
const SECTIONS = ["what", "who", "need", "then", "trouble"] as const;

describe("JB215B-3 施工准证's own help", () => {
  it("is the permit page's, not the removed incident report's", () => {
    expect(helpKeyFor("MSE_TRACE", "/permits")).toBe("permits");
    expect(helpKeys()).toContain("permits");
    // The neighbours are untouched.
    expect(helpKeyFor("MSE_TRACE", "/hazard-rectifications")).toBe("hazard_rectification");
  });

  it("says every section in all four languages", () => {
    for (const messages of ALL) {
      const help = (messages.pageHelp as unknown as Record<string, Record<string, string>>).permits;
      for (const section of SECTIONS) expect(help?.[section], section).toBeTruthy();
    }
  });

  it("talks about the permit flow, not incidents", () => {
    const words = Object.values(zh.pageHelp.permits).join("");
    expect(words).not.toMatch(/安全事件|事故/);
    expect(words).toContain("安全经理");
    expect(words).toContain("签名");
    expect(words).toContain("退回");
    expect(words).toContain("归档");
  });

  it("names the permissions in the 权限 page's words, never their codes", () => {
    // The permissions the server checks (`site_operations/permits.py`), as
    // `permissions.code.*` names them on the 权限 page (coordinator 11-17:
    // the help showed safety.view / safety.manage / safety.verify).
    for (const messages of ALL) {
      const help = (messages.pageHelp as unknown as Record<string, Record<string, string>>).permits;
      const names = messages.permissions.code.safety;
      for (const name of [names.view, names.manage, names.verify]) expect(help.who).toContain(name);
      for (const section of SECTIONS) expect(help[section], section).not.toMatch(/\b[a-z_]+\.[a-z_]+\b/);
    }
  });
});

describe("JB215B-7 后台任务 by typed address", () => {
  const allowed = (path: string, codes: string[], superuser = false) =>
    isRouteAllowed("MSE_ADMIN", [], path, codes, superuser);

  it("is refused to whoever only monitors", () => {
    expect(allowed("/monitoring/jobs", ["platform.monitor"])).toBe(false);
  });

  it("opens for whoever may run jobs", () => {
    expect(allowed("/monitoring/jobs", ["platform.monitor", "platform.maintenance"])).toBe(true);
    expect(allowed("/monitoring/jobs", [], true)).toBe(true);
  });

  it("leaves the other monitoring pages as they were", () => {
    expect(allowed("/monitoring", ["platform.monitor"])).toBe(true);
    expect(allowed("/monitoring/exceptions", ["platform.monitor"])).toBe(true);
    expect(allowed("/monitoring/exceptions", [])).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", [], "/monitoring/jobs", ["platform.monitor", "platform.maintenance"])).toBe(false);
  });
});
