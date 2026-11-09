/**
 * JB139: a project's 「项目权限」 - every person's 项目权限 on by default and
 * switchable; 总部 B only for head office to switch on.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PermissionEntry } from "@/interfaces/auth";
import messages from "@/messages/zh.json";
import type { ProjectPermissionsState } from "@/services/contractor.service";

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
      { id: "u1", full_name: "Clerk", role_name: "Storekeeper", role_code: "storekeeper", editable: true, on: ["receipt.create", "receipt.view"] },
      { id: "u2", full_name: "Buyer", role_name: "Storekeeper", role_code: "storekeeper", editable: true, on: ["receipt.view", "disposal.view"] },
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
