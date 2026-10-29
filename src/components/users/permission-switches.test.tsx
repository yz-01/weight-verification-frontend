/**
 * J17 (Q17): one back-office person's permissions as ON / OFF switches -
 * 总部后台 apart from 项目后台, which has 项目查看 (all or chosen projects),
 * 金额查看, the everyday work by module and the approvals. Field staff and
 * consultants keep their role.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PermissionEntry, PermissionSwitchState } from "@/interfaces/auth";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/users",
}));

const {
  PermissionSwitches,
  UnsavedSwitchesNote,
  SwitchesNotSavedNote,
  isSwitchesDirty,
  saveSwitchesIfDirty,
} = await import("@/components/users/permission-switches");
const { saveUserThenAfter } = await import("@/components/users/create-user");
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

/**
 * Lucas, 10-29: 「我已经更改权限了为什么还是不会变」 - the switches had their own
 * 保存 at the bottom of a long list, and the dialog's 保存 left them unsaved.
 * Now the dialog's one 「保存」 saves the user, then the switches.
 */
describe("one 保存 in the edit-user dialog (10-29)", () => {
  function dialogSave(dirty: boolean, switches: () => Promise<unknown>) {
    const order: string[] = [];
    const saveUser = vi.fn(async () => {
      order.push("user");
    });
    const saveSwitches = vi.fn(async () => {
      order.push("switches");
      return switches();
    });
    const finish = vi.fn(() => {
      order.push("close");
    });
    const result = saveUserThenAfter({
      saveUser,
      saveAfter: () => saveSwitchesIfDirty(dirty, saveSwitches),
      finish,
    });
    return { result, order, saveUser, saveSwitches, finish };
  }

  it("saves the switches after the user when they changed, then closes", async () => {
    const run = dialogSave(true, async () => state());
    await expect(run.result).resolves.toBe(true);
    expect(run.saveSwitches).toHaveBeenCalledTimes(1);
    expect(run.order).toEqual(["user", "switches", "close"]);
  });

  it("does not save the switches when they did not change", async () => {
    const run = dialogSave(false, async () => state());
    await expect(run.result).resolves.toBe(true);
    expect(run.saveSwitches).not.toHaveBeenCalled();
    expect(run.order).toEqual(["user", "close"]);
  });

  it("keeps the dialog open when the switches fail or the PIN is cancelled", async () => {
    const run = dialogSave(true, async () => {
      throw new Error("sign-off cancelled");
    });
    await expect(run.result).resolves.toBe(false);
    expect(run.saveUser).toHaveBeenCalledTimes(1);
    expect(run.finish).not.toHaveBeenCalled();
  });

  it("does not touch the switches when the user's fields fail", async () => {
    const saveSwitches = vi.fn(async () => true);
    const finish = vi.fn();
    await expect(
      saveUserThenAfter({
        saveUser: async () => {
          throw new Error("400");
        },
        saveAfter: saveSwitches,
        finish,
      }),
    ).rejects.toThrow("400");
    expect(saveSwitches).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("says plainly that the details saved and the permissions did not", () => {
    const html = render(<SwitchesNotSavedNote error="签核密码不对" />, state());
    expect(html).toContain("基本资料已保存，权限还没保存");
    expect(html).toContain("签核密码不对");
    expect(html).toContain('role="alert"');
  });

  it("tells the switches apart from what the server holds", () => {
    const held = state({ off: ["receipt.update", "project.view_all"], projects: { all: false, chosen: ["p1"] } });
    const same = () => new Set(["project.view_all", "receipt.update"]);
    expect(isSwitchesDirty(held, same(), false, new Set(["p1"]))).toBe(false);
    // The scope code is the project choice, not a switch.
    expect(isSwitchesDirty(held, new Set(["receipt.update"]), false, new Set(["p1"]))).toBe(false);
    expect(isSwitchesDirty(held, new Set(["project.view_all"]), false, new Set(["p1"]))).toBe(true);
    expect(isSwitchesDirty(held, same(), true, new Set(["p1"]))).toBe(true);
    expect(isSwitchesDirty(held, same(), false, new Set())).toBe(true);
    // All projects: which ones were ticked before no longer matters.
    expect(isSwitchesDirty(state(), new Set(), true, new Set(["p1"]))).toBe(false);
  });

  it("shows the unsaved line while the switches have changes, in every language", () => {
    expect(render(<UnsavedSwitchesNote />, state())).toContain("权限已改，按下面的「保存」才会生效");
    for (const book of [messages, zhTW, en, ms]) {
      expect(book.users.switches.unsaved).toBeTruthy();
      expect(book.users.switches.partSaved).toBeTruthy();
      // The line names the dialog's own button.
      expect(book.users.switches.unsaved).toContain(book.common.save);
    }
    // Nothing changed yet: no line.
    expect(render(<PermissionSwitches userId="u1" />, state())).not.toContain("data-switches-unsaved");
  });

  it("has no save button of its own inside the dialog", () => {
    const html = render(<PermissionSwitches userId="u1" handleRef={{ current: null }} />, state());
    expect(html).toContain("data-permission-switches");
    expect(html).not.toContain("保存权限");
  });

  it("keeps its own 保存权限 when used on its own", () => {
    const html = render(<PermissionSwitches userId="u1" />, state());
    expect(html).toContain("保存权限");
  });
});
