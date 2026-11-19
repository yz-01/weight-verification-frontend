/**
 * JB218 / JB219: what the user form offers as 角色, and what a chosen role does
 * to a person's switches (客户 11-18 事项 3、4).
 */
import { describe, expect, it, vi } from "vitest";

import type { PermissionEntry, Role } from "@/interfaces/auth";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/users",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { hasNoOwnRoles, invitableRoles } = await import("@/components/users/create-user");
const { switchesForRole } = await import("@/components/users/permission-switches");

const role = (code: string, over: Partial<Role> = {}): Role => ({
  id: code,
  company: "c1",
  code,
  name: code,
  description: "",
  permissions: [],
  kind: "project",
  is_system: false,
  created_at: "2026-11-18T00:00:00Z",
  updated_at: "2026-11-18T00:00:00Z",
  ...over,
});

const ADMIN = role("company_admin", { kind: "head_office", head_office: true, is_system: true });
const PHONES = [
  role("site_staff", { kind: "phone" }),
  role("gate_guard", { kind: "phone" }),
  role("equipment_operator", { kind: "phone" }),
];

describe("the 角色 field on 新增用户", () => {
  it("never offers a phone role to a new person - all three, not only 工地人员", () => {
    const office = role("ROLE-0001", { kind: "head_office", head_office: true });
    const offered = invitableRoles([ADMIN, ...PHONES, office], false).map((row) => row.code);
    expect(offered).toEqual(["company_admin", "ROLE-0001"]);
    // Editing a phone account, or an account that holds one, still shows it
    // (walk 11-18: an office account is offered office roles only).
    expect(invitableRoles([ADMIN, ...PHONES], true, { phone: true, role: "site_staff" })).toHaveLength(4);
    expect(invitableRoles([ADMIN, ...PHONES], true, { phone: false, role: "gate_guard" }).map((row) => row.code)).toEqual([
      "company_admin",
      "gate_guard",
    ]);
  });

  it("says how to make a role when a builder has only 公司管理员 (a new company)", () => {
    expect(hasNoOwnRoles([ADMIN, ...PHONES])).toBe(true);
    expect(hasNoOwnRoles([ADMIN, ...PHONES, role("ROLE-0001")])).toBe(false);
    // A recycler's roles are not split into 总部 / 项目: no such line.
    expect(hasNoOwnRoles([role("company_admin", { kind: "plain", is_system: true })])).toBe(false);
    expect(zh.users.field.noOwnRoles).toContain("新增角色");
  });
});

describe("a role's switches for a person (按角色套用, and a 角色 changed on the form)", () => {
  const entry = (code: string, page: PermissionEntry["page"]): PermissionEntry => ({
    group: code.split(".")[0],
    code,
    page,
    audiences: ["CONTRACTOR"],
  });
  const ENTRIES = [
    entry("user.view", "hq_reserved"),
    entry("user.update", "hq_reserved"),
    entry("supplier.create", "hq_grantable"),
    entry("partnership.view", "hq_grantable"),
    entry("receipt.view", "project"),
    entry("receipt.create", "project"),
  ];
  const office = role("ROLE-0002", {
    kind: "head_office",
    head_office: true,
    permissions: ["user.view", "supplier.create", "project.view_all"],
  });
  const site = role("ROLE-0003", { kind: "project", permissions: ["partnership.view"] });

  it("gives a head-office person the A and B their role ticks, and keeps their own project switch", () => {
    const { off, allProjects } = switchesForRole(ENTRIES, office, new Set(["receipt.create", "user.view"]), false);
    expect([...off].sort()).toEqual(["partnership.view", "receipt.create", "user.update"]);
    expect(allProjects).toBe(true);
  });

  it("gives a project user no A, the B their role ticks, and chosen projects only", () => {
    const { off, allProjects } = switchesForRole(ENTRIES, site, new Set(), true);
    expect([...off].sort()).toEqual(["supplier.create", "user.update", "user.view"]);
    expect(allProjects).toBe(false);
  });

  it("gives 公司管理员 everything", () => {
    const { off, allProjects } = switchesForRole(ENTRIES, ADMIN, new Set(["receipt.view"]), false);
    expect(off.size).toBe(0);
    expect(allProjects).toBe(true);
  });
});
