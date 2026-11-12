/**
 * JB176 (客户 11-12 事项 3) on screen:
 *
 * > 目前项目经理进入「顾问申请」时，系统显示「此项目没有获授权的顾问，请先授予项目
 * > 权限」，导致无法建立申请。……请统一检查所有项目的顾问申请流程，确保项目经理
 * > 可以正常选择获授权顾问并提交申请。
 *
 * Lucas 11-12: only head office opens a project to a consultant. What changes is
 * what people see:
 *
 * 1. the warning says where and who - head office gets 【去开通顾问】;
 * 2. a project user's 「顾问账号与项目授权」 is a notice and the consultants
 *    open on his projects, not three empty tabs; head office's page as before;
 * 3. the 顾问设定 card says 「由总部设置」 to a project user.
 *
 * Rendered to static markup like the other screen tests - the runner has no DOM.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { OpenConsultant } from "@/interfaces/consultant-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

/** The permissions the signed-in account holds, set per test. */
const auth = vi.hoisted(() => ({ codes: new Set<string>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/consultant-access",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", account_type: "TENANT", full_name: "Someone" },
    can: (code: string) => auth.codes.has(code),
  }),
}));

const { NoConsultantNotice } = await import("@/components/consultant-workflow/application-form");
const { ConsultantAccessManagement } = await import(
  "@/components/consultant-workflow/consultant-access-management"
);
const { ConsultantSettingsHub } = await import("@/components/consultant-workflow/consultant-settings-hub");
const { setsUpConsultants } = await import("@/lib/consultant-access");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

/** A project manager as the client's are set up: no A group (JB139). */
const PROJECT_MANAGER = ["consultant.submit", "consultant.config", "approval.view", "project.view"];
/** Head office holds everything; these are the ones this page reads with. */
const HEAD_OFFICE = [...PROJECT_MANAGER, "user.view", "user.create", "user.update", "project.assign"];

function as(codes: string[]) {
  auth.codes = new Set(codes);
}

function render(node: React.ReactNode, seed?: (client: QueryClient) => void, messages: typeof zh = zh) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const buttonTexts = (html: string) =>
  [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]).trim());

const OPEN: OpenConsultant[] = [
  {
    project: "p4",
    project_code: "PRJ-0004",
    project_name: "OIL & GAS",
    consultant: "c1",
    consultant_name: "Resident Engineer",
    consultant_email: "engineer@example.test",
    organization_name: "Independent Engineers",
    valid_until: null,
  },
];

/* ------------------------------------------------------------------ */

describe("the warning when a project has no consultant (JB176-2)", () => {
  const form = zh.consultantWorkflow.form;

  it("tells head office where to go, with 【去开通顾问】 to the page", () => {
    const html = render(<NoConsultantNotice canOpen />);
    expect(text(html)).toContain(
      "这个项目还没有开通顾问。请到「顾问设定 › 顾问账号与项目授权」给顾问开通这个项目，再回来建立申请。",
    );
    expect(html).toMatch(/<a[^>]*href="\/consultant-access"[^>]*>[\s\S]*去开通顾问[\s\S]*<\/a>/);
  });

  it("tells a project user head office does it, with no button", () => {
    const html = render(<NoConsultantNotice canOpen={false} />);
    expect(text(html)).toContain(
      "这个项目还没有开通顾问。顾问由总部开通：请总部在「顾问设定 › 顾问账号与项目授权」给顾问开通这个项目，开通后这里就可以选。",
    );
    expect(html).not.toContain("/consultant-access");
    expect(html).not.toContain(form.openConsultantAccess);
    expect(html).not.toContain("<button");
  });

  it("never says 项目权限 - what sent the client to the role", () => {
    for (const catalogue of [zh, zhTW] as (typeof zh)[]) {
      const words = catalogue.consultantWorkflow.form;
      for (const sentence of [words.noConsultantGrantHeadOffice, words.noConsultantGrantProject]) {
        expect(sentence).not.toMatch(/项目权限|項目權限/);
      }
    }
    for (const catalogue of [en, ms] as (typeof zh)[]) {
      const words = catalogue.consultantWorkflow.form;
      for (const sentence of [words.noConsultantGrantHeadOffice, words.noConsultantGrantProject]) {
        expect(sentence.toLowerCase()).not.toMatch(/project permission|kebenaran projek/);
      }
    }
    expect("noConsultantGrant" in form).toBe(false);
  });

  it("names the menu exactly as the screen does, in all four languages", () => {
    for (const [catalogue, open, close] of [
      [zh, "「", "」"],
      [zhTW, "「", "」"],
      [en, "“", "”"],
      [ms, "“", "”"],
    ] as [typeof zh, string, string][]) {
      const nav = catalogue.nav.submodule;
      const menu = `${open}${nav.consultantSettings} › ${nav.consultantAccess}${close}`;
      const words = catalogue.consultantWorkflow.form;
      expect(words.noConsultantGrantHeadOffice).toContain(menu);
      expect(words.noConsultantGrantProject).toContain(menu);
      expect(words.openConsultantAccess.length).toBeGreaterThan(0);
      // The how-to on the applications list names the same page.
      expect(catalogue.consultantWorkflow.howTo.setupOnce).toContain(nav.consultantAccess);
    }
    expect(zh.nav.submodule.consultantSettings).toBe("顾问设定");
    expect(zh.nav.submodule.consultantAccess).toBe("顾问账号与项目授权");
  });

  it("is chosen by whether the reader may open projects, on new and edited applications alike", () => {
    const source = read("src/components/consultant-workflow/application-form.tsx");
    expect(source).toContain('<NoConsultantNotice canOpen={can("project.assign")} />');
    expect(source).not.toContain('t("form.noConsultantGrant")');
    // 新建 and 编辑草稿 are the one form.
    for (const page of [
      "src/app/(dashboard)/consultant-applications/create/page.tsx",
      "src/app/(dashboard)/consultant-applications/[id]/edit/page.tsx",
    ]) {
      expect(read(page)).toContain("<ConsultantApplicationForm");
    }
  });
});

describe("「顾问账号与项目授权」 for a project user (JB176-3)", () => {
  it("is a notice and the consultants open on his projects - no tabs, no buttons", () => {
    as(PROJECT_MANAGER);
    const html = render(<ConsultantAccessManagement />, (client) =>
      client.setQueryData(["consultant-access", "open-consultants"], OPEN),
    );
    const words = text(html);
    expect(words).toContain("顾问单位、顾问账号和项目授权由总部设置。");
    expect(words).toContain("你的项目已开通的顾问");
    for (const cell of ["PRJ-0004", "OIL & GAS", "Resident Engineer", "Independent Engineers", "没有到期时间"]) {
      expect(words).toContain(cell);
    }
    // The columns: 项目、顾问、顾问单位、到期时间.
    const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect([...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]).trim())).toEqual([
      "项目",
      "顾问",
      "顾问单位",
      "到期时间",
    ]);
    // None of head office's tabs or buttons.
    expect(html).not.toContain('role="tab"');
    expect(buttonTexts(html)).toEqual([]);
    for (const gone of ["新增顾问单位", "邀请顾问", "新增项目授权", "编辑", "撤销"]) {
      expect(words).not.toContain(gone);
    }
  });

  it("says so when nothing is open, and to ask head office", () => {
    as(PROJECT_MANAGER);
    const html = render(<ConsultantAccessManagement />, (client) =>
      client.setQueryData(["consultant-access", "open-consultants"], []),
    );
    expect(text(html)).toContain("你的项目还没有开通顾问，请联系总部。");
  });

  it("is worded in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms] as (typeof zh)[]) {
      const view = catalogue.consultantAccess.projectView;
      expect(Object.keys(view).sort()).toEqual(["empty", "notice", "title", "what"]);
      for (const value of Object.values(view)) expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe("head office's page is unchanged (JB176 做法 4)", () => {
  it("still has its three tabs, its steps and its buttons, and no project-user notice", () => {
    as(HEAD_OFFICE);
    const html = render(<ConsultantAccessManagement />, (client) => {
      client.setQueryData(["consultant-access", "organizations"], {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "o1", name: "Independent Engineers", registration_no: "", contact_name: "", contact_email: "",
            contact_phone: "", address: "", is_active: true, logo: null,
          },
        ],
      });
      client.setQueryData(["consultant-access", "members"], { count: 0, next: null, previous: null, results: [] });
      client.setQueryData(["consultant-access", "grants"], { count: 0, next: null, previous: null, results: [] });
      client.setQueryData(["consultant-access", "projects"], { count: 0, next: null, previous: null, results: [] });
    });
    const words = text(html);
    for (const tab of ["顾问单位", "顾问账号", "项目授权"]) {
      expect(html).toMatch(new RegExp(`role="tab"[^>]*>[\\s\\S]*?${tab}`));
    }
    for (const step of ["1. 顾问单位", "2. 顾问账号", "3. 项目授权"]) expect(words).toContain(step);
    expect(buttonTexts(html).some((label) => label.includes("新增顾问单位"))).toBe(true);
    expect(words).toContain(zh.consultantAccess.subtitle);
    expect(words).not.toContain("由总部设置");
    expect(words).not.toContain("你的项目已开通的顾问");
  });

  it("is chosen by head office's own permissions, its queries as before", () => {
    const can = (codes: string[]) => (code: string) => codes.includes(code);
    expect(setsUpConsultants(can(HEAD_OFFICE))).toBe(true);
    expect(setsUpConsultants(can(["user.view"]))).toBe(true);
    expect(setsUpConsultants(can(["project.assign"]))).toBe(true);
    expect(setsUpConsultants(can(PROJECT_MANAGER))).toBe(false);

    const source = read("src/components/consultant-workflow/consultant-access-management.tsx");
    expect(source).toContain(
      "return setsUpConsultants(can) ? <HeadOfficeConsultantAccess /> : <ProjectConsultantAccess />;",
    );
    const headOffice = source.slice(source.indexOf("function HeadOfficeConsultantAccess()"));
    // The project user's read is not made on head office's page.
    expect(headOffice.slice(0, headOffice.indexOf("return ("))).not.toContain("getOpenConsultants");
  });
});

describe("the 顾问设定 card (JB176 做法 3)", () => {
  it("says 「由总部设置」 to a project user", () => {
    as(PROJECT_MANAGER);
    const words = text(render(<ConsultantSettingsHub />));
    expect(words).toContain("由总部设置");
    expect(words).toContain("顾问单位、顾问账号和项目授权由总部设置。你在这里可以看你的项目开通了哪些顾问。");
    expect(words).not.toContain(zh.consultantWorkflow.settingsHub.access.need);
  });

  it("is as before for head office", () => {
    as(HEAD_OFFICE);
    const words = text(render(<ConsultantSettingsHub />));
    expect(words).toContain(zh.consultantWorkflow.settingsHub.access.need);
    expect(words).toContain(zh.consultantWorkflow.settingsHub.access.body);
    expect(words).not.toContain("由总部设置");
  });

  it("is worded in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms] as (typeof zh)[]) {
      const access = catalogue.consultantWorkflow.settingsHub.access;
      expect(access.needProject.length).toBeGreaterThan(0);
      expect(access.bodyProject.length).toBeGreaterThan(0);
    }
  });

  it("carries the page's own name, the one the warning sends people to", () => {
    // 「顾问设定 › 顾问账号与项目授权」: the card used to read 「顾问账号授权」,
    // a name the warning does not say.
    for (const catalogue of [zh, zhTW, en, ms] as (typeof zh)[]) {
      expect(catalogue.consultantWorkflow.settingsHub.access.title).toBe(
        catalogue.nav.submodule.consultantAccess,
      );
    }
    as(HEAD_OFFICE);
    expect(text(render(<ConsultantSettingsHub />))).toContain("顾问账号与项目授权");
  });

  it("the consultant field's failure note does not say 项目权限 either", () => {
    expect(zh.consultantWorkflow.what.consultantGrants).not.toContain("项目权限");
    expect(zhTW.consultantWorkflow.what.consultantGrants).not.toContain("項目權限");
  });
});
