/**
 * JB139: a project's 「项目权限」 - every person's 项目权限 on by default and
 * switchable; 总部 B only for head office to switch on.
 *
 * JB147 (客户 11-10 事项 3): 「所有已获得该项目后台权限的人员，都必须正确显示在
 * 「项目权限」名单中」 - a head-office manager is listed read-only, an invited or
 * suspended person with their status.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PermissionEntry } from "@/interfaces/auth";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";
import type { ProjectPermissionsState } from "@/services/contractor.service";

const reader = vi.hoisted(() => ({ updatesUsers: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: (code: string) => code !== "user.update" || reader.updatesUsers }),
}));

const { ProjectPermissions } = await import("@/components/projects/project-permissions");

const CATALOGUE: PermissionEntry[] = [
  { group: "receipt", code: "receipt.view", page: "project", audiences: ["CONTRACTOR"] },
  { group: "receipt", code: "receipt.create", page: "project", audiences: ["CONTRACTOR"] },
  { group: "disposal", code: "disposal.view", page: "hq_grantable", audiences: ["CONTRACTOR"] },
];

function data(over: Partial<ProjectPermissionsState> = {}): ProjectPermissionsState {
  return {
    project_codes: ["receipt.create", "receipt.view"],
    grantable: ["disposal.view"],
    options: ["receipt.create", "receipt.view"],
    can_grant: false,
    can_edit: true,
    members: [
      { id: "u1", full_name: "Clerk", role_name: "Storekeeper", role_code: "storekeeper", kind: "project", status: "ACTIVE", editable: true, on: ["receipt.create", "receipt.view"] },
      { id: "u2", full_name: "Buyer", role_name: "Storekeeper", role_code: "storekeeper", kind: "project", status: "ACTIVE", editable: true, on: ["receipt.view", "disposal.view"] },
    ],
    ...over,
  };
}

function render(state: ProjectPermissionsState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  client.setQueryData(["projects", "permissions", "p1"], state);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <ProjectPermissions projectId="p1" />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reader.updatesUsers = true;
});

describe("a project's 项目权限 (JB139)", () => {
  it("says the project permissions are on by default and can be switched per person", () => {
    const html = render(data());
    expect(html).toContain("项目权限默认全部打开");
    expect(html).toContain("项目权限全部打开");
    expect(html).toContain("关掉了 1 项");
    expect(html).toContain("总部开了 1 项 B 组权限");
    // No project-wide B grant box any more.
    expect(html).not.toContain("data-project-grants");
  });

  it("has every word in the catalogue", () => {
    for (const key of ["projectNote", "allOn", "someOff", "grantedCount", "grantsTitle", "grantsHelp"] as const) {
      expect(messages.projects.permissions[key]).toBeTruthy();
    }
  });
});

const MIKE: ProjectPermissionsState["members"][number] = {
  id: "u3",
  full_name: "mike",
  role_name: "Headquarters",
  role_code: "headquarters",
  kind: "head_office",
  status: "ACTIVE",
  editable: false,
  on: ["disposal.view", "receipt.create", "receipt.view"],
};

describe("项目权限 lists the whole back-office team (JB147)", () => {
  it("shows a head-office manager read-only, with where their permissions are set", () => {
    const html = render(data({ members: [MIKE] }));
    expect(html).not.toContain("这个项目还没有后台人员");
    expect(html).toContain("mike");
    expect(html).toContain("项目权限全部打开");
    expect(html).toContain("总部账号：权限由总部在「用户管理」设置，这里只能查看。");
    expect(html).toContain('href="/users/u3"');
    expect(html).toContain("打开用户页");
    // Head office holds B by its role - no 「总部开了 B」 count for it.
    expect(html).not.toContain("B 组权限");
  });

  it("offers the user page only to a reader who manages users", () => {
    reader.updatesUsers = false;
    const html = render(data({ members: [MIKE] }));
    expect(html).toContain("总部账号：权限由总部在「用户管理」设置");
    expect(html).not.toContain('href="/users/u3"');
  });

  it("labels an invited and a suspended person and keeps them switchable", () => {
    const html = render(
      data({
        members: [
          { ...data().members[0], id: "u4", full_name: "lily", status: "INVITED" },
          { ...data().members[0], id: "u5", full_name: "steven", status: "SUSPENDED" },
        ],
      }),
    );
    expect(html).toContain("还没激活");
    expect(html).toContain("已停用");
    expect(html).not.toContain("data-member-note");
  });

  it("explains a person who is not switched here", () => {
    const html = render(data({ members: [{ ...data().members[0], editable: false }] }));
    expect(html).toContain("这个人的权限由总部在「用户管理」设置");
  });

  it("still says so when nobody is on the team", () => {
    expect(render(data({ members: [] }))).toContain("这个项目还没有后台人员");
  });

  it("has the new words in every language", () => {
    for (const catalogue of [messages, zhTW, en, ms]) {
      for (const key of ["invited", "suspended", "headOffice", "setInUsers", "openUser"] as const) {
        expect(catalogue.projects.permissions[key]).toBeTruthy();
      }
      expect(catalogue.errors.api.project_member_not_switchable).toBeTruthy();
    }
  });
});
