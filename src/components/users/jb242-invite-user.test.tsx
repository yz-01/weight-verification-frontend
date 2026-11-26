/**
 * JB242 (客户 11-23 事项 14): 邀请用户 in one page.
 *
 * 「在一个页面填写姓名、邮箱，选择总部或项目，绑定所属项目，勾选需要的权限，就能直接
 * 建立账号并发送登录邀请。」 The page's steps, where the switches start (系统默认
 * or a 常用权限), 【存成常用权限】's ticks, the body sent, the hidden 「总部」 /
 * 「项目」 starting roles, and the invitation e-mail's 7 days in four languages.
 * Rendered to static markup (the runner has no DOM), or read in the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { InviteOptions, PermissionEntry, Role } from "@/interfaces/auth";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/users/create",
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
    user: { id: "boss", company: "c1", portal: "MSE_TRACE" },
    can: () => true,
  }),
}));

const { InviteUser, invitePayload, presetTicks, presetsFor, startingSwitches } = await import(
  "@/components/users/invite-user"
);
const { invitableRoles, INVITE_START_ROLE_CODES } = await import("@/components/users/create-user");
const { inviteEmailCopy, linkValidFor } = await import("@/lib/invite-email");

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
  entry("material_request", "material_request.review", "hq_grantable", "project", "approve"),
  entry("receipt", "receipt.view", "project", "project"),
  entry("receipt", "receipt.update", "project", "project"),
];

const role = (over: Partial<Role>): Role => ({
  id: "r",
  company: "c1",
  code: "ROLE-0001",
  name: "x",
  description: "",
  permissions: [],
  is_system: false,
  created_at: "",
  updated_at: "",
  ...over,
});

const ADMIN = role({ id: "admin", code: "company_admin", name: "Company Administrator", kind: "head_office", is_system: true });
const HR = role({ id: "hr", name: "人事", kind: "head_office", permissions: ["user.update", "project.view_all"] });
const SITE = role({ id: "site", code: "ROLE-0002", name: "工地主管", kind: "project", permissions: ["supplier.create"] });

const OPTIONS: InviteOptions = {
  roles: [ADMIN, HR, SITE],
  locked_on: [],
  available_projects: [
    { id: "p1", code: "P-T", name: "Tower" },
    { id: "p2", code: "P-M", name: "Mall" },
  ],
  link_valid_hours: 168,
  remaining_user_seats: null,
};

function render(options: InviteOptions = OPTIONS, messages: Record<string, unknown> = zh, locale = "zh") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  client.setQueryData(["users", "invite-options"], options);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <InviteUser />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("one page: name, e-mail, 总部 / 项目, projects, 常用权限, permissions, 邀请", () => {
  it("shows every step in order and the one 【邀请】", () => {
    const html = render();
    const order = ["基本资料", "姓名", "电子邮箱", "电话", "这个人在哪里工作", "所属项目", "从常用权限开始", "权限"];
    let at = 0;
    for (const word of order) {
      const next = html.indexOf(word, at);
      expect(next, word).toBeGreaterThanOrEqual(0);
      at = next;
    }
    expect(html).toContain('data-invite-place="head_office"');
    expect(html).toContain("在总部办公室，管理整个公司。");
    expect(html).toContain('data-invite-place="project"');
    expect(html).toContain("只做被分配的项目。");
    expect(html).toContain("邀请");
    // 语言 / 时区 wait under 更多.
    expect(html).toContain("更多（语言、时区）");
    expect(html).not.toContain(">时区<");
    // No 角色 box: 「不必先建立角色」.
    expect(html).not.toContain("请选角色");
    // The invitation's lifetime, said on the page.
    expect(html).toContain("邀请邮件里的链接 7 天内有效。");
  });

  it("asks for 总部 or 项目 before projects, 常用权限 and switches", () => {
    const html = render();
    expect(html.match(/先选上面的「总部」或「项目」。/g)).toHaveLength(3);
    expect(html).not.toContain("data-switch=");
  });
});

describe("where the switches start", () => {
  const off = (codes: Set<string>) => [...codes].sort();

  it("项目 by the system's default: every everyday permission on, A and B off, chosen projects", () => {
    const start = startingSwitches(CATALOGUE, "project");
    expect(off(start.off)).toEqual(["billing.view", "material_request.review", "supplier.create", "user.update"]);
    expect(start.allProjects).toBe(false);
  });

  it("总部 by the system's default: A and B off for the inviter to switch on", () => {
    const start = startingSwitches(CATALOGUE, "head_office");
    expect(off(start.off)).toEqual(["billing.view", "material_request.review", "supplier.create", "user.update"]);
  });

  it("a 常用权限: its ticks on, the rest as the default", () => {
    const hr = startingSwitches(CATALOGUE, "head_office", HR);
    expect(off(hr.off)).toEqual(["billing.view", "material_request.review", "supplier.create"]);
    expect(hr.allProjects).toBe(true);
    const site = startingSwitches(CATALOGUE, "project", SITE);
    expect(off(site.off)).toEqual(["billing.view", "material_request.review", "user.update"]);
    // 公司管理员: everything.
    expect(off(startingSwitches(CATALOGUE, "head_office", ADMIN).off)).toEqual([]);
  });

  it("offers the company's own roles of the place chosen, never the phone's or the hidden ones", () => {
    const phone = role({ id: "g", code: "gate_guard", kind: "phone" });
    expect(presetsFor([ADMIN, HR, SITE, phone], "head_office").map((r) => r.id)).toEqual(["admin", "hr"]);
    expect(presetsFor([ADMIN, HR, SITE, phone], "project").map((r) => r.id)).toEqual(["site"]);
    expect(presetsFor([ADMIN, HR, SITE], "")).toEqual([]);
  });
});

describe("【存成常用权限】", () => {
  it("keeps 总部's A and B switched on, and 全部项目", () => {
    const ticks = presetTicks(CATALOGUE, "head_office", new Set(["billing.view", "supplier.create"]), true);
    expect(ticks).toEqual(["material_request.review", "project.view_all", "user.update"]);
  });

  it("keeps 项目's B switched on only - A is never a project role's, everyday permissions everybody's", () => {
    const ticks = presetTicks(CATALOGUE, "project", new Set(["user.update", "billing.view", "receipt.view"]), false);
    expect(ticks).toEqual(["material_request.review", "supplier.create"]);
  });
});

describe("the body sent to invite_user", () => {
  const fields = { full_name: "阿明", email: "ming@x.test", phone: "", language: "zh", timezone: "Asia/Kuala_Lumpur" };

  it("a project person: chosen projects, never all", () => {
    const body = invitePayload(fields, "project", "", new Set(["user.update", "project.view_all"]), true, new Set(["p1"]));
    expect(body).toMatchObject({ workplace: "project", role: null, off: ["user.update"] });
    expect(body.projects).toEqual({ all: false, chosen: ["p1"] });
  });

  it("head office on every project, from a 常用权限", () => {
    const body = invitePayload(fields, "head_office", "hr", new Set(), true, new Set(["p1"]));
    expect(body).toMatchObject({ workplace: "head_office", role: "hr", projects: { all: true } });
  });
});

describe("the hidden 「总部」 / 「项目」 starting roles", () => {
  const start = role({ id: "s", code: "invite_project", kind: "project", is_system: true });

  it("are no role to pick on a new user, and named on 编辑用户 only for the person in one", () => {
    expect(INVITE_START_ROLE_CODES).toEqual(["invite_head_office", "invite_project"]);
    expect(invitableRoles([start, SITE], false).map((r) => r.id)).toEqual(["site"]);
    expect(invitableRoles([start, SITE], true, { phone: false, role: "s" }).map((r) => r.id)).toEqual(["s", "site"]);
    expect(invitableRoles([start, SITE], true, { phone: false, role: "site" }).map((r) => r.id)).toEqual(["site"]);
  });

  it("have names in four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.roles.system_.invite_head_office).toBeTruthy();
      expect(messages.roles.system_.invite_project).toBeTruthy();
    }
    expect(zh.roles.system_.invite_head_office).toBe("总部");
    expect(zh.roles.system_.invite_project).toBe("项目");
  });
});

describe("the invitation e-mail says 7 days (Lucas 11-26)", () => {
  const cases = [
    ["zh", zh, "7 天"],
    ["zh-TW", zhTW, "7 天"],
    ["en", en, "7 days"],
    ["ms", ms, "7 hari"],
  ] as const;

  for (const [locale, messages, words] of cases) {
    it(`in ${locale}`, () => {
      const t = createTranslator({ locale, messages });
      const copy = inviteEmailCopy(t as never, locale);
      // The server fills the placeholder with its real lifetime.
      expect(copy.body).toContain("{valid_for}");
      expect(copy.language).toBe(locale);
      expect(linkValidFor(t as never, 168)).toBe(words);
      expect(t("jb242.linkValid", { valid: words })).toContain(words);
    });
  }

  it("a re-sent invitation is the invitation again", () => {
    const users = read("src/components/users/users.tsx");
    expect(users).toContain('target.status === "INVITED"\n          ? inviteEmailCopy(t, locale)');
    for (const file of [
      "src/components/users/create-user.tsx",
      "src/components/companies/create-company.tsx",
      "src/components/companies/owner-account-panel.tsx",
    ]) {
      expect(read(file)).toContain("inviteEmailCopy(t, locale)");
    }
  });
});

describe("four languages", () => {
  it("every jb242 word, and the refusals", () => {
    const keys = Object.keys(zh.jb242).sort();
    for (const messages of [zhTW, en, ms]) {
      expect(Object.keys(messages.jb242).sort()).toEqual(keys);
      for (const code of ["role_start_fixed", "invite_workplace_required", "invite_projects_required", "invite_role_wrong_kind"]) {
        expect((messages.errors.api as Record<string, string>)[code], code).toBeTruthy();
      }
      expect((messages.mseAccess.operation as Record<string, string>).invite_user).toBeTruthy();
    }
    expect(JSON.stringify(zh.jb242)).not.toContain("您");
  });

  it("renders in English", () => {
    const html = render(OPTIONS, en, "en");
    expect(html).toContain("Where this person works");
    expect(html).toContain("The link in the invitation e-mail is valid for 7 days.");
  });
});

describe("the page a builder opens", () => {
  it("is the one-page invitation; MSE Admin keeps its form", () => {
    const entryFile = read("src/components/users/user-create-entry.tsx");
    expect(entryFile).toContain('if (me.portal === "MSE_TRACE" && !searchParams.get("company")) return <InviteUser />;');
    expect(entryFile).toContain("return <CreateUser />;");
    expect(read("src/app/(dashboard)/users/create/page.tsx")).toContain("<UserCreateEntry />");
  });
});
