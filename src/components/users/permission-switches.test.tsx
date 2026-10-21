/**
 * J17 (Q17): one back-office person's permissions as ON / OFF switches -
 * 总部后台 apart from 项目后台, which has 项目查看 (all or chosen projects),
 * 金额查看, the everyday work by module and the approvals. Field staff and
 * consultants keep their role.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PermissionEntry, PermissionSwitchState } from "@/interfaces/auth";
import messages from "@/messages/zh.json";

const { PermissionSwitches } = await import("@/components/users/permission-switches");
const { PermissionMatrix } = await import("@/components/roles/permission-matrix");

const entry = (
  group: string,
  code: string,
  area: "hq" | "project",
  kind: PermissionEntry["kind"],
  extra: Partial<PermissionEntry> = {},
): PermissionEntry => ({ group, code, area, kind, audiences: ["CONTRACTOR"], ...extra });

const CATALOGUE: PermissionEntry[] = [
  entry("user", "user.update", "hq", "operate"),
  entry("project", "project.view_all", "project", "scope"),
  entry("receipt", "receipt.view", "project", "operate"),
  entry("receipt", "receipt.update", "project", "operate"),
  entry("sundry_claim", "sundry_claim.review", "project", "approve"),
  entry("consultant", "consultant.submit", "project", "approve"),
  entry("finance", "finance.view_amounts", "project", "amounts", { switch_only: true }),
];

function state(over: Partial<PermissionSwitchState> = {}): PermissionSwitchState {
  return {
    switchable: true,
    uses_switches: true,
    on: CATALOGUE.map((row) => row.code),
    off: [],
    projects: { all: true, chosen: [] },
    available_projects: [{ id: "p1", code: "P-T", name: "Tower" }],
    ...over,
  };
}

function render(node: React.ReactNode, switches: PermissionSwitchState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  client.setQueryData(["users", "permission-switches", "u1"], switches);
  client.setQueryData(["roles", "switch-presets"], { results: [], count: 0 });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function area(html: string, name: string) {
  const start = html.indexOf(`data-switch-area="${name}"`);
  const end = html.indexOf("data-switch-area=", start + 10);
  return html.slice(start, end < 0 ? undefined : end);
}

describe("the switch page (J17)", () => {
  it("puts user management under 总部后台 and the work under 项目后台", () => {
    const html = render(<PermissionSwitches userId="u1" />, state());
    expect(area(html, "hq")).toContain('data-switch="user.update"');
    expect(area(html, "hq")).not.toContain('data-switch="receipt.view"');
    const project = area(html, "project");
    expect(project).toContain("项目查看");
    expect(project).toContain('data-switch="finance.view_amounts"');
    expect(project).toContain("金额查看");
    // The project scope is its own choice, not a switch among the others.
    expect(html).not.toContain('data-switch="project.view_all"');
  });

  it("lists the approvals apart, with the PIN reminder", () => {
    const html = render(<PermissionSwitches userId="u1" />, state());
    const approve = html.slice(html.indexOf('data-switch-part="approve"'));
    expect(approve).toContain('data-switch="sundry_claim.review"');
    expect(approve).toContain('data-switch="consultant.submit"');
    expect(approve).toContain("审批时仍要本人签核密码");
    expect(approve).not.toContain('data-switch="receipt.update"');
  });

  it("shows every switch on for a new user, and all projects", () => {
    const html = render(<PermissionSwitches userId="u1" />, state());
    expect(html.match(/role="switch" aria-checked="true"/g)?.length).toBe(CATALOGUE.length - 1);
    expect(html).not.toContain('aria-checked="false" data-state="unchecked"');
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>全部项目/);
  });

  it("shows a switched-off code off, and the chosen projects", () => {
    const html = render(
      <PermissionSwitches userId="u1" />,
      state({ off: ["receipt.update", "project.view_all"], projects: { all: false, chosen: ["p1"] } }),
    );
    const row = html.slice(html.indexOf('data-switch="receipt.update"'));
    expect(row.slice(0, row.indexOf("</label>"))).toContain('aria-checked="false"');
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>指定项目/);
    expect(html).toContain("P-T · Tower");
  });

  it("says the phone and consultants keep their role", () => {
    const html = render(<PermissionSwitches userId="u1" />, state({ switchable: false }));
    expect(html).toContain("权限不变，由角色决定");
    expect(html).not.toContain("data-permission-switches");
  });
});

describe("the role editor (J17)", () => {
  it("does not offer 金额查看, which only a switch means", () => {
    const html = render(<PermissionMatrix selected={[]} onChange={() => {}} />, state());
    expect(html.match(/role="checkbox"/g)).toHaveLength(CATALOGUE.length - 1);
    expect(html).not.toContain("金额查看");
  });
});
