/**
 * JB208 (Lucas 11-16 audit), 公司管理 and 用户管理 on MSE Admin:
 *
 * - JB208-4: a 「试用」 company gets the existing 启用 (TRIAL → ACTIVE), with
 *   its own words in the confirm dialog.
 * - JB208-12: 新增公司 finishes on the company's own page; a recycler's 返回
 *   goes to 回收商资料; the 套餐 filter is offered only with 账单 rights; the
 *   角色 field of an MSE account says what no role means.
 *
 * Source only: these screens need a router, a session and the server, and the
 * runner has no DOM.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("JB208 company and user pages", () => {
  it("JB208-4: a trial company is offered 启用", () => {
    const code = source("src/components/companies/companies.tsx");
    expect(code).toContain('can("company.suspend") && company.status === "TRIAL"');
    expect(code).toContain('t("companies.activateTrial.title", { name: pending.company.name })');
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.companies.activateTrial.title).toContain("{name}");
      expect(catalogue.companies.activateTrial.confirm).toBeTruthy();
    }
    expect(zh.companies.activateTrial.confirm).toBe("启用");
  });

  it("JB208-12: the 套餐 filter needs 账单 rights", () => {
    const code = source("src/components/companies/companies.tsx");
    expect(code).toContain('const canFilterPlans = can("billing.view");');
    expect(code).toContain("enabled: canFilterPlans,");
    expect(code).toContain("{canFilterPlans && (");
  });

  it("JB208-12: a new company opens on its own page", () => {
    const code = source("src/components/companies/create-company.tsx");
    expect(code).toContain('!isEdit && user?.portal === "MSE_ADMIN"');
    expect(code).toContain("? `/companies/${saved.id}`");
    expect(code).toContain("finish(doneHref || listHref)");
  });

  it("JB208-12: a recycler's 返回 goes to 回收商资料", () => {
    const code = source("src/components/companies/view-company.tsx");
    expect(code).toContain(': "/companies/admin/recyclers";');
    expect(code).not.toContain('"/companies/admin/review"');
  });

  it("JB208-12: an MSE account's 角色 says what no role means", () => {
    const code = source("src/components/users/create-user.tsx");
    expect(code).toContain('t("users.field.roleHint")');
    expect(zh.users.field.roleHint).toContain("什么都看不到");
  });
});
