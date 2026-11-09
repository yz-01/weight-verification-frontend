/**
 * JB139 (客户 11-09 事项 3): 编辑用户's switches for a project user. 总部专属 A
 * is not offered (only a note), 总部 B is off until head office switches it
 * on, every 项目权限 is on by default and can be switched off (Lucas 11-09:
 * 「默认是全部打开，后续可以自行开关和修改」), and only chosen projects.
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

const { PermissionSwitches } = await import("@/components/users/permission-switches");

const entry = (
  group: string,
  code: string,
  page: PermissionEntry["page"],
  area: "hq" | "project",
  kind: PermissionEntry["kind"],
  extra: Partial<PermissionEntry> = {},
): PermissionEntry => ({ group, code, page, area, kind, audiences: ["CONTRACTOR"], ...extra });

const CATALOGUE: PermissionEntry[] = [
  entry("user", "user.update", "hq_reserved", "hq", "operate"),
  entry("project", "project.view_all", "hq_reserved", "project", "scope"),
  entry("disposal", "disposal.view", "hq_grantable", "project", "operate"),
  entry("supplier", "supplier.create", "hq_grantable", "hq", "operate"),
  entry("announcement", "announcement.publish", "project", "hq", "operate"),
  entry("receipt", "receipt.view", "project", "project", "operate"),
  entry("receipt", "receipt.create", "project", "project", "operate"),
  entry("sundry_claim", "sundry_claim.review", "project", "project", "approve"),
  entry("finance", "finance.view_amounts", "project", "project", "amounts", { switch_only: true }),
];

function state(over: Partial<PermissionSwitchState> = {}): PermissionSwitchState {
  return {
    switchable: true,
    uses_switches: true,
    project_user: true,
    on: ["announcement.publish", "receipt.view", "receipt.create", "sundry_claim.review", "finance.view_amounts"],
    off: ["user.update", "project.view_all", "disposal.view", "supplier.create"],
    projects: { all: false, chosen: ["p1"] },
    available_projects: [{ id: "p1", code: "P-T", name: "Tower" }],
    ...over,
  };
}

function render(switches: PermissionSwitchState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  client.setQueryData(["users", "permission-switches", "u1"], switches);
  client.setQueryData(["roles", "switch-presets"], { results: [], count: 0 });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <PermissionSwitches userId="u1" />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function area(html: string, name: string) {
  const start = html.indexOf(`data-switch-area="${name}"`);
  const end = html.indexOf("data-switch-area=", start + 10);
  return html.slice(start, end < 0 ? undefined : end);
}

function switchRow(html: string, code: string) {
  const row = html.slice(html.indexOf(`data-switch="${code}"`));
  return row.slice(0, row.indexOf("</label>"));
}

describe("a project user's switches (JB139)", () => {
  it("does not offer 总部专属 A, only says it is head office's", () => {
    const html = render(state());
    expect(html).not.toContain('data-switch="user.update"');
    expect(html).not.toContain('data-switch="project.view_all"');
    expect(html).toContain("data-switch-reserved");
    expect(html).toContain("只有总部账号才有，项目用户不能打开");
  });

  it("puts 总部 B under 总部权限, off until switched on", () => {
    const hq = area(render(state()), "hq");
    expect(hq).toContain('data-switch="disposal.view"');
    expect(hq).toContain('data-switch="supplier.create"');
    expect(hq).toContain("默认关掉，总部打开后这个人才可以用");
    expect(switchRow(hq, "disposal.view")).toContain('aria-checked="false"');
    // A 项目权限 is not a head-office switch any more, whatever its old area.
    expect(hq).not.toContain('data-switch="announcement.publish"');
  });

  it("shows every 项目权限 on by default, and switchable", () => {
    const html = render(state());
    const project = area(html, "project");
    expect(project).toContain("项目权限默认全部打开");
    for (const code of ["announcement.publish", "receipt.view", "receipt.create", "sundry_claim.review", "finance.view_amounts"]) {
      expect(project).toContain(`data-switch="${code}"`);
      expect(switchRow(project, code)).toContain('aria-checked="true"');
      // The switch's own classes carry "data-disabled:..." styling; only the attribute counts.
      expect(switchRow(project, code)).not.toMatch(/\sdisabled=""/);
    }
  });

  it("shows a 项目权限 switched off for this person as off", () => {
    const html = render(state({ off: [...state().off, "receipt.create"] }));
    expect(switchRow(html, "receipt.create")).toContain('aria-checked="false"');
  });

  it("offers chosen projects only, never all projects", () => {
    const html = render(state());
    expect(html).toContain("项目用户只能看指定的项目");
    expect(html).not.toMatch(/role="radio"[^>]*>全部项目/);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>指定项目/);
  });

  it("counts only what can be switched", () => {
    // 2 B + 5 project; A is not counted.
    expect(render(state())).toContain("已打开 5 / 7");
  });

  it("leaves head office's own page as it was", () => {
    const html = render(
      state({ project_user: false, off: [], on: CATALOGUE.map((row) => row.code), projects: { all: true, chosen: [] } }),
    );
    expect(area(html, "hq")).toContain('data-switch="user.update"');
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>全部项目/);
    expect(html).not.toContain("data-switch-reserved");
  });

  it("has the new words in every language", () => {
    for (const book of [messages, zhTW, en, ms]) {
      expect(book.users.switches.reservedNote).toBeTruthy();
      expect(book.users.switches.hqHintProjectUser).toBeTruthy();
      expect(book.users.switches.scopeProjectUser).toBeTruthy();
      expect(book.users.switches.projectDefaultOn).toBeTruthy();
    }
  });
});
