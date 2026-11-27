/**
 * QA2 (JB242 audit): 邀请用户 sets the new person's permissions in the same
 * step, so the server asks for 「编辑用户」 as well as 「新增用户」. A role with
 * only 新增用户 used to get a bare 403 after filling the whole page; now the
 * button says why before the click, and the server's refusal says it plainly
 * (`invite_needs_user_update`, four languages).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FormShell } from "@/components/shared/form-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/users/create",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const source = (file: string) => readFileSync(path.join(__dirname, file), "utf8");

describe("QA2 JB242: inviting needs 编辑用户, said before the click", () => {
  it("the four languages say what is missing and who switches it on", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const api = (messages as unknown as { errors: { api: Record<string, string> } }).errors.api;
      const page = (messages as unknown as { jb242: Record<string, string> }).jb242;
      expect(api.invite_needs_user_update).toBeTruthy();
      expect(page.needsUserUpdate).toBe(api.invite_needs_user_update);
    }
    expect(zh.jb242.needsUserUpdate).toContain("「编辑用户」");
    expect(zh.jb242.needsUserUpdate).toContain("公司管理员");
    expect(zh.jb242.needsUserUpdate).not.toContain("您");
  });

  it("FormShell greys the submit button and writes the reason", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <TooltipProvider>
          <FormShell
            backHref="/users"
            backLabel="用户"
            title="邀请用户"
            isSubmitting={false}
            submitLabel="邀请"
            onSubmit={() => undefined}
            submitDisabledReason={zh.jb242.needsUserUpdate}
          >
            <div />
          </FormShell>
        </TooltipProvider>
      </NextIntlClientProvider>,
    );
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain(zh.jb242.needsUserUpdate);
  });

  it("the users list and the invite page both use the reason", () => {
    expect(source("users.tsx")).toMatch(
      /me\?\.portal === "MSE_TRACE" && !can\("user\.update"\)[\s\S]{0,400}disabledReason=\{t\("jb242\.needsUserUpdate"\)\}/,
    );
    expect(source("invite-user.tsx")).toContain(
      'submitDisabledReason={can("user.update") ? undefined : t("jb242.needsUserUpdate")}',
    );
  });

  it("an e-mail already used is said in the reader's language (email_in_use wins over the server's English)", () => {
    const client = readFileSync(path.join(__dirname, "../../services/api-client.ts"), "utf8");
    const wins = client.slice(client.indexOf("const CATALOGUE_WINS"), client.indexOf("]);", client.indexOf("const CATALOGUE_WINS")));
    expect(wins).toContain('"email_in_use"');
    expect(zh.errors.field.email_in_use).toBe("该电子邮箱已注册");
    for (const messages of [zhTW, en, ms]) {
      expect((messages as unknown as { errors: { field: Record<string, string> } }).errors.field.email_in_use).toBeTruthy();
    }
  });
});
