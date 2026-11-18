/**
 * JB139 (客户 11-09 事项 3): the role editor's 总部权限 / 项目权限. A project
 * role cannot tick 总部专属 A, chooses 总部 B, and its 项目权限 are on by
 * default for its people - shown, not ticked (Lucas 11-09: 「默认是全部打开，
 * 后续可以自行开关和修改」). The phone's roles tick as before.
 *
 * JB218/JB219 (客户 11-18 事项 3: 「总部角色的A组及B组权限，应该允许公司管理员自行勾选
 * 或取消」): a 总部角色 ticks A and B, nothing locked and nothing pre-ticked; its
 * 项目权限 are on by default like a project role's. A recycler's / MSE's role
 * (``plain``) is one page with every box - the 11-09 split had taken its
 * project boxes away.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PermissionEntry } from "@/interfaces/auth";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

const { PermissionMatrix, roleKindOf } = await import("@/components/roles/permission-matrix");

const entry = (group: string, code: string, page: PermissionEntry["page"]): PermissionEntry => ({
  group,
  code,
  page,
  audiences: ["CONTRACTOR"],
});

const CATALOGUE: PermissionEntry[] = [
  entry("user", "user.view", "hq_reserved"),
  entry("disposal", "disposal.view", "hq_grantable"),
  entry("receipt", "receipt.view", "project"),
  entry("receipt", "receipt.create", "project"),
];

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the role editor's two pages (JB139)", () => {
  it("opens a project role on 总部权限: A locked, B to tick", () => {
    const html = render(<PermissionMatrix selected={[]} onChange={() => {}} kind="project" />);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>总部权限/);
    expect(html).toContain('data-permission-section="hq_reserved"');
    expect(html).toContain('data-permission-section="hq_grantable"');
    expect(html).toContain("A 组是总部专属，不能勾选");
    // Two boxes on the page: A is there but disabled.
    expect(html.match(/role="checkbox"/g)).toHaveLength(2);
    expect(html.match(/role="checkbox"[^>]*disabled=""/g)).toHaveLength(1);
    // The 项目权限 are not on this page.
    expect(html).not.toContain('data-default-on="receipt.view"');
  });

  it("shows a project role's 项目权限 page as on by default, no boxes", () => {
    const html = render(
      <PermissionMatrix selected={[]} onChange={() => {}} kind="project" initialPage="project" />,
    );
    expect(html).toContain('data-default-on="receipt.view"');
    expect(html).toContain('data-default-on="receipt.create"');
    expect(html).toContain("默认打开");
    expect(html).toContain("以后可以在「编辑用户」或项目的「项目权限」为某个人关掉某一项");
    expect(html).not.toContain('role="checkbox"');
    // No 全选 / 全部取消 over boxes that are not there.
    expect(html).not.toContain(messages.roles.selectAll);
  });

  it("shows a project role's 项目权限 as on by default, read-only, with the note", () => {
    const html = render(<PermissionMatrix selected={["disposal.view"]} readOnly kind="project" />);
    expect(html).toContain("data-project-default-on");
    expect(html).toContain("这个角色的人默认全部打开");
    // Only its B is listed; the 项目权限 are the note, A it never holds.
    expect(html).not.toContain("receipt.view");
  });

  it("lets a head-office role tick A and B, nothing locked or pre-ticked (JB218)", () => {
    const html = render(<PermissionMatrix selected={[]} onChange={() => {}} kind="head_office" />);
    // Opens on 总部权限: A and B both boxes, neither disabled, neither ticked.
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>总部权限/);
    expect(html.match(/role="checkbox"/g)).toHaveLength(2);
    expect(html).not.toMatch(/role="checkbox"[^>]*disabled=""/);
    expect(html).not.toMatch(/role="checkbox"[^>]*aria-checked="true"/);
    expect(html).toContain(messages.roles.pages.hqHelp);
    expect(html).not.toContain("不能勾选");
    expect(html).toContain("没有权限");
  });

  it("shows a head-office role's 项目权限 as on by default (JB218)", () => {
    const html = render(
      <PermissionMatrix selected={[]} onChange={() => {}} kind="head_office" initialPage="project" />,
    );
    expect(html).toContain('data-default-on="receipt.view"');
    expect(html).not.toContain('role="checkbox"');
    expect(html).toContain(messages.roles.pages.projectDefaultOnHeadOffice);
  });

  it("counts only what the role decides: its 总部权限 (JB219)", () => {
    // A kept 总部 preset also stores project codes; they are on for everybody.
    const html = render(
      <PermissionMatrix selected={["user.view", "receipt.view"]} onChange={() => {}} kind="head_office" />,
    );
    expect(html).toContain("1 项权限");
  });

  it("shows a head-office role read-only with its A ticked and the note", () => {
    const html = render(<PermissionMatrix selected={["user.view", "receipt.view"]} readOnly kind="head_office" />);
    expect(html).toContain("data-project-default-on");
    expect(html).toContain(messages.roles.pages.projectDefaultOnHeadOffice);
    expect(html).not.toContain("receipt.view");
  });

  it("gives a recycler's role one page with every box (plain, JB219 sibling)", () => {
    const html = render(<PermissionMatrix selected={["receipt.view"]} onChange={() => {}} kind="plain" />);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("data-permission-section");
    expect(html.match(/role="checkbox"/g)).toHaveLength(4);
    expect(html).not.toMatch(/role="checkbox"[^>]*disabled=""/);
    expect(html).not.toContain("data-default-on");
  });

  it("keeps a phone role's 项目权限 tickable", () => {
    const html = render(<PermissionMatrix selected={["receipt.view"]} onChange={() => {}} kind="phone" />);
    expect(html.match(/role="checkbox"/g)).toHaveLength(2);
    expect(html).not.toContain("data-default-on");
  });

  it("reads a role's kind from the server, else its 总部角色 mark, else its code", () => {
    expect(roleKindOf({ code: "ROLE-0007", kind: "phone" })).toBe("phone");
    expect(roleKindOf({ code: "ROLE-0008", kind: "plain" })).toBe("plain");
    expect(roleKindOf({ code: "ROLE-0009", head_office: true })).toBe("head_office");
    expect(roleKindOf({ code: "company_admin" })).toBe("head_office");
    // JB219: head office is the company's choice, not the old code.
    expect(roleKindOf({ code: "headquarters" })).toBe("project");
    expect(roleKindOf({ code: "gate_guard" })).toBe("phone");
    expect(roleKindOf({ code: "" })).toBe("project");
    expect(roleKindOf(undefined)).toBe("project");
  });

  it("has the new words in every language", () => {
    for (const book of [messages, zhTW, en, ms]) {
      expect(book.roles.pages.projectDefaultOn).toBeTruthy();
      expect(book.roles.pages.defaultOn).toBeTruthy();
      expect(book.roles.pages.projectDefaultOnHeadOffice).toBeTruthy();
      expect(book.roles.kind.headOffice).toBeTruthy();
      expect(book.roles.kind.project).toBeTruthy();
    }
  });
});
