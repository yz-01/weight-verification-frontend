/**
 * JB219 audit F1, F5, F6, F7 (客户 11-18 事项 4: 「保留公司管理员的完整权限……总部角色：
 * A组及B组权限由公司管理员自行勾选及分配」).
 *
 * A person may give only what he holds himself; 公司管理员 only a 公司管理员.
 * The screens grey what the server would refuse, and say why in one line.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PermissionEntry, PermissionSwitchState, Role } from "@/interfaces/auth";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const me = vi.hoisted(() => ({ cannot_give: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/roles",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/dialog-navigation", async (original) => ({
  ...(await original<typeof import("@/components/shared/dialog-navigation")>()),
  useFinishForm: () => vi.fn(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({
    user: { id: "chen", company: "c1", portal: "MSE_TRACE", cannot_give: me.cannot_give },
    can: () => true,
  }),
}));

const { CreateRole, rolePayloadFields } = await import("@/components/roles/create-role");
const { roleChoices } = await import("@/components/users/create-user");
const { PermissionSwitches } = await import("@/components/users/permission-switches");
const { notMineFor } = await import("@/components/projects/project-permissions");

const entry = (
  group: string,
  code: string,
  page: PermissionEntry["page"],
  area: "hq" | "project" = "hq",
  kind: PermissionEntry["kind"] = "operate",
): PermissionEntry => ({ group, code, page, area, kind, audiences: ["CONTRACTOR"] });

const CATALOGUE: PermissionEntry[] = [
  entry("user", "user.update", "hq_reserved"),
  entry("billing", "billing.view", "hq_reserved"),
  entry("project", "project.view_all", "hq_reserved", "project", "scope"),
  entry("supplier", "supplier.create", "hq_grantable"),
  entry("partnership", "partnership.view", "hq_grantable"),
  entry("receipt", "receipt.view", "project", "project"),
];

const role = (over: Partial<Role>): Role => ({
  id: "r1",
  company: "c1",
  code: "ROLE-0001",
  name: "office admin",
  description: "",
  permissions: [],
  kind: "head_office",
  head_office: true,
  is_system: false,
  user_count: 0,
  created_at: "2026-11-19T00:00:00Z",
  updated_at: "2026-11-19T00:00:00Z",
  ...over,
});

function render(node: ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the 角色 field greys what the editor may not give (F1)", () => {
  const ADMIN = role({ id: "admin", code: "company_admin", name: "Company Administrator", is_system: true, can_give: false });
  const FINANCE = role({ id: "fin", code: "ROLE-0002", name: "总部财务", can_give: false });
  const BUYER = role({ id: "buy", code: "ROLE-0003", name: "采购", kind: "project", can_give: true });
  const name = (row: Role) => row.name;

  it("shows 公司管理员 and a role with A / B he lacks greyed, with who to ask", () => {
    const options = roleChoices([ADMIN, FINANCE, BUYER], name, zh.users.field.roleNotYours);
    expect(options).toEqual([
      { value: "admin", label: `Company Administrator ${zh.users.field.roleNotYours}`, disabled: true },
      { value: "fin", label: `总部财务 ${zh.users.field.roleNotYours}`, disabled: true },
      { value: "buy", label: "采购" },
    ]);
  });

  it("keeps the role the person already holds choosable, and greys nothing for an older backend", () => {
    const options = roleChoices([FINANCE, BUYER], name, "x", "fin");
    expect(options[0]).toEqual({ value: "fin", label: "总部财务" });
    const older = roleChoices([role({ can_give: undefined })], name, "x");
    expect(older[0].disabled).toBeUndefined();
  });
});

describe("the role window (F1, F6, F7)", () => {
  it("greys a box the editor does not hold, with the reason, and keeps what the role already ticks", () => {
    me.cannot_give = ["billing.view", "partnership.view", "receipt.view"];
    const html = render(<CreateRole role={role({ permissions: ["user.update", "partnership.view"] })} />);
    expect(html).toContain(zh.roles.notYours);
    // billing.view greyed; partnership.view is already ticked - his to keep or untick.
    expect(html.match(/role="checkbox"[^>]*disabled=""/g)).toHaveLength(1);
    me.cannot_give = [];
  });

  it("says nothing to a 公司管理员 or anyone holding everything", () => {
    me.cannot_give = [];
    const html = render(<CreateRole role={role({})} />);
    expect(html).not.toContain(zh.roles.notYours);
    expect(html).not.toMatch(/role="checkbox"[^>]*disabled=""/);
  });

  it("shows 公司管理员's name in Chinese, read-only (F6)", () => {
    const html = render(
      <CreateRole
        role={role({
          code: "company_admin",
          name: "Company Administrator",
          description: "Full access to this company's data and users.",
          is_system: true,
          permissions: CATALOGUE.map((row) => row.code),
        })}
      />,
    );
    expect(html).toContain(zh.roles.system_.company_admin);
    expect(html).not.toContain("Company Administrator");
    expect(html).toContain(zh.roles.adminNameFixed);
    expect(html).toMatch(/id="name"[^>]*disabled=""|disabled=""[^>]*id="name"/);
  });

  it("sends a name or description only when it was changed (F7), never 公司管理员's (F6)", () => {
    const shown = { name: "项目经理", description: "管理项目" };
    expect(rolePayloadFields({ code: "project_manager", ...shown }, shown, false)).toEqual({ code: "project_manager" });
    expect(rolePayloadFields({ code: "project_manager", name: "工地经理", description: "管理项目" }, shown, false)).toEqual({
      code: "project_manager",
      name: "工地经理",
    });
    expect(rolePayloadFields({ code: "company_admin", name: "x", description: "y" }, shown, true)).toEqual({
      code: "company_admin",
    });
    // A new role sends both, as before.
    expect(rolePayloadFields({ code: "", name: "采购", description: "" }, null, false)).toEqual({
      code: "",
      name: "采购",
      description: "",
    });
  });
});

describe("权限开关 (F1)", () => {
  function state(over: Partial<PermissionSwitchState> = {}): PermissionSwitchState {
    return {
      switchable: true,
      uses_switches: true,
      project_user: false,
      on: ["user.update", "supplier.create", "receipt.view"],
      off: ["billing.view", "partnership.view", "project.view_all"],
      projects: { all: false, chosen: ["p1"] },
      available_projects: [{ id: "p1", code: "P-1", name: "Tower" }],
      ...over,
    };
  }
  function renderSwitches(switches: PermissionSwitchState) {
    return render(<PermissionSwitches userId="u1" />, (client) => {
      client.setQueryData(["users", "permission-switches", "u1"], switches);
      client.setQueryData(["roles", "switch-presets"], { results: [], count: 0 });
    });
  }

  it("greys a switch the editor does not hold while it is off, and says why", () => {
    const html = renderSwitches(state({ locked_on: ["billing.view", "partnership.view", "project.view_all", "user.suspend"] }));
    expect(html).toContain(zh.users.switches.notMine);
    expect(html).toMatch(/data-switch="billing.view" data-switch-locked=""/);
    expect(html).toMatch(/data-switch="partnership.view" data-switch-locked=""/);
    // On for the person already: his to switch off.
    expect(html).not.toMatch(/data-switch="supplier.create" data-switch-locked/);
    // 「全部项目」 needs 查看公司全部项目 himself.
    expect(html).toMatch(/aria-checked="false" disabled=""/);
  });

  it("shows a 公司管理员's switches to anyone else without letting them change one", () => {
    const html = renderSwitches(state({ admin_account: true, off: [], on: CATALOGUE.map((row) => row.code) }));
    expect(html).toContain(zh.users.switches.adminAccount);
    expect(html).not.toContain(zh.users.switches.notMine);
    expect(html.match(/data-switch-locked=""/g)?.length).toBeGreaterThan(0);
  });

  it("is unchanged for a 公司管理员 (nothing locked)", () => {
    const html = renderSwitches(state({ locked_on: [] }));
    expect(html).not.toContain(zh.users.switches.notMine);
    expect(html).not.toContain("data-switch-locked");
  });
});

describe("a project's 项目权限 (F1)", () => {
  it("greys only a code the reader lacks that is off for the person", () => {
    const locked = notMineFor(["partnership.view", "supplier.create"], ["supplier.create", "receipt.view"]);
    expect(locked("partnership.view")).toBe(true);
    expect(locked("supplier.create")).toBe(false);
    expect(locked("receipt.view")).toBe(false);
    expect(notMineFor(undefined, [])("partnership.view")).toBe(false);
  });
});

describe("every new word is in all four languages", () => {
  it("has the refusals and the greyed-box lines", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const code of [
        "grant_not_held",
        "grant_admin_role_only_admin",
        "grant_admin_account_only_admin",
        "role_self_lockout_type",
      ] as const) {
        expect(messages.errors.api[code]).toBeTruthy();
      }
      expect(messages.roles.notYours).toBeTruthy();
      expect(messages.roles.adminNameFixed).toBeTruthy();
      expect(messages.users.field.roleNotYours).toBeTruthy();
      expect(messages.users.field.rolesNotYours).toBeTruthy();
      expect(messages.users.field.adminRoleFixed).toBeTruthy();
      expect(messages.users.switches.notMine).toBeTruthy();
      expect(messages.users.switches.adminAccount).toBeTruthy();
      expect(messages.projects.permissions.notMine).toBeTruthy();
    }
    expect(zh.errors.api.grant_not_held).toBe("你自己没有这项权限，不能给别人，也不能给自己。请公司管理员来做。");
    expect(zh.errors.api.role_self_lockout_type).toContain("改成项目角色");
    // F5: 「项目」 on this page means a building project.
    expect(zh.roles.followers).toContain("其他权限不变");
    expect(zhTW.roles.followers).toContain("其他權限不變");
  });
});
