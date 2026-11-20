/**
 * Walk 11-18 (Walker B, JB218 / JB219) - 编辑用户 / 新增用户 and the 权限开关.
 *
 * FAIL 4: 编辑用户 of an office account offered 设备操作人员、门岗保安、工地人员, and
 * 保存 came back in English 「Create field staff from the field login link
 * screen instead.」. P3: 「已打开 20 / 123」 before 保存, 86 after. FAIL 1 / 2
 * sibling: a refusal of the 权限开关 is said beside 「保存」, with its reason.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { PermissionEntry, Role } from "@/interfaces/auth";
import { publishTranslator } from "@/lib/i18n-runtime";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/users",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { invitableRoles, saveUserThenAfter } = await import("@/components/users/create-user");
const { keptOff, saveSwitchesIfDirty, switchesForRole } = await import("@/components/users/permission-switches");
const { api } = await import("@/services/api-client");
const { saveRefusalLine } = await import("@/lib/save-refusal");

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
const OFFICE = role("ROLE-0001", { kind: "head_office", head_office: true });
const QS = role("quantity_surveyor", { kind: "project" });

describe("编辑用户 of an office account offers office roles only (FAIL 4)", () => {
  it("leaves out 设备操作人员、门岗保安、工地人员, as 新增用户 does", () => {
    const offered = invitableRoles([ADMIN, ...PHONES, OFFICE, QS], true, { phone: false, role: "quantity_surveyor" });
    expect(offered.map((row) => row.code)).toEqual(["company_admin", "ROLE-0001", "quantity_surveyor"]);
  });

  it("keeps a phone account's choices as they were", () => {
    const offered = invitableRoles([ADMIN, ...PHONES, OFFICE], true, { phone: true, role: "site_staff" });
    expect(offered).toHaveLength(5);
  });

  it("words the server's refusal in the reader's language, under 角色", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          message: "Validation failed.",
          code: "validation_failed",
          errors: {
            role: [
              {
                code: "phone_role_office_account",
                message: "Create field staff from the field login link screen instead.",
              },
            ],
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    let failure: ApiError | null = null;
    try {
      await api.patch("/api/users/u1/update_user/", { role: "gate_guard" }, { silent: true });
    } catch (error) {
      failure = error as ApiError;
    }
    expect(failure?.errors.role).toBe(zh.errors.field.phone_role_office_account);
    expect(failure?.errors.role).toContain("现场人员管理");
    expect(failure?.errors.role).not.toContain("Create field staff");
  });

  it("has the sentence in all four languages, as a refusal and under the field", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const refusals = messages.errors.api as Record<string, string>;
      const field = messages.errors.field as Record<string, string>;
      expect(refusals.phone_role_office_account).toBeTruthy();
      expect(field.phone_role_office_account).toBe(refusals.phone_role_office_account);
    }
    expect(zh.errors.api.phone_role_office_account).toContain("手机角色");
    expect(zhTW.errors.api.phone_role_office_account).toContain("現場人員管理");
    expect(zh.common.saveFailed).toContain("没有保存成功");
    expect(zhTW.common.saveFailed).toContain("沒有保存成功");
    expect(en.common.saveFailed).toContain("not saved");
    expect(ms.common.saveFailed).toContain("tidak disimpan");
  });
});

describe("the 权限开关 count is right before 保存 (P3)", () => {
  const entry = (code: string, page: PermissionEntry["page"]): PermissionEntry => ({
    group: code.split(".")[0],
    code,
    page,
    audiences: ["CONTRACTOR"],
  });
  const ENTRIES = [
    entry("user.view", "hq_reserved"),
    entry("supplier.create", "hq_grantable"),
    entry("receipt.view", "project"),
    entry("receipt.create", "project"),
  ];
  const officeAdmin = role("ROLE-0002", { kind: "head_office", head_office: true, permissions: ["user.view"] });

  it("opens every 项目权限 for an account still on its role alone, as the server does", () => {
    // walkb.staff: QS on its role alone - what QS did not tick reads as off.
    const shown = new Set(["user.view", "supplier.create", "receipt.create"]);
    const { off } = switchesForRole(ENTRIES, officeAdmin, keptOff({ uses_switches: false }, shown), false);
    expect([...off].sort()).toEqual(["supplier.create"]);
  });

  it("keeps a 项目权限 switched off for the person when the account is on switches", () => {
    const shown = new Set(["user.view", "supplier.create", "receipt.create"]);
    const { off } = switchesForRole(ENTRIES, officeAdmin, keptOff({ uses_switches: true }, shown), false);
    expect([...off].sort()).toEqual(["receipt.create", "supplier.create"]);
  });
});

describe("a refusal of the 权限开关 is said beside 「保存」 with its reason (FAIL 1 / 2 sibling)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hands the reason back instead of a bare false", async () => {
    const refused = new ApiError(zh.errors.api.grant_not_held, 403, {}, "grant_not_held");
    const result = await saveSwitchesIfDirty(
      true,
      async () => {
        throw refused;
      },
      (error) => saveRefusalLine(error, zh.users.switches.failed),
    );
    expect(result).toBe(zh.errors.api.grant_not_held);
  });

  it("says a server fault did not save", async () => {
    const result = await saveSwitchesIfDirty(
      true,
      async () => {
        throw new ApiError("", 500);
      },
      (error) => saveRefusalLine(error, zh.users.switches.failed),
    );
    expect(result).toBe(zh.users.switches.failed);
  });

  it("keeps the dialog open and passes the sentence to the form", async () => {
    const finish = vi.fn();
    const result = await saveUserThenAfter({
      saveUser: async () => undefined,
      saveAfter: async () => zh.errors.api.grant_admin_account_only_admin,
      finish,
    });
    expect(result).toBe(zh.errors.api.grant_admin_account_only_admin);
    expect(finish).not.toHaveBeenCalled();
    expect(zh.users.switches.partSavedWhy).toContain("{reason}");
  });
});
