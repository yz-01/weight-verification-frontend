/**
 * JB210 (客户 11-16 顾问权限) on screen:
 *
 * > 请完善顾问权限设置，保留原有7项权限，并支持总部按项目勾选以下11个模块：1. 仪表板
 * > 2. 项目 3. 现场任务 4. 材料管理 5. 工程进度 6. 整改／EHS 7. 文件档案 8. 现场记录中心
 * > 9. 报表中心 10. 通知中心 11. 沟通记录
 * > 原有7项与上述模块重叠的权限请统一关联，避免重复设置或互相冲突。
 * > 任务和沟通只显示顾问参与的记录。
 *
 * The grant dialog's 11 ticks + 3 options, the company default in the same
 * shape, the consultant's menu from the ticks, and the conversations a
 * consultant does not see. Rendered to static markup like the other screen
 * tests - the runner has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ConsultantProjectAccessGrant } from "@/interfaces/consultant-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { consultantSeesConversation } from "@/lib/consultant-modules";
import { navLeaves, visibleNavigation } from "@/lib/navigation";

const auth = vi.hoisted(() => ({
  user: { id: "u1", account_type: "TENANT" as string, full_name: "Someone" },
  codes: new Set<string>(["company_settings.view", "project.assign", "user.view", "project.view"]),
}));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-chats",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: (code: string) => auth.codes.has(code) }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind, recordId }: { kind: string; recordId: string }) => (
    <div data-stub="conversation" data-kind={kind} data-record={recordId} />
  ),
}));

const { GrantDialog } = await import("@/components/consultant-workflow/consultant-access-management");
const { FieldChatsOffice } = await import("@/components/site-access/field-chats-office");
const { OFFICE_FIELD_CHATS_KEY } = await import("@/components/site-access/field-chats-find");

function render(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** The tick inside one `data-module` / `data-option` label: checked or not. */
function ticked(html: string, attribute: "data-module" | "data-option", key: string): boolean {
  const start = html.indexOf(`${attribute}="${key}"`);
  expect(start, `${attribute}=${key} is drawn`).toBeGreaterThan(-1);
  const label = html.slice(start, html.indexOf("</label>", start));
  return /aria-checked="true"/.test(label);
}

const GRANT: ConsultantProjectAccessGrant = {
  id: "g1",
  organization: "o1",
  organization_name: "Independent Engineers",
  consultant: "c1",
  consultant_name: "Resident Engineer",
  consultant_email: "engineer@example.test",
  project: "p1",
  project_name: "Tower",
  project_code: "PRJ-1",
  modules: ["dashboard", "safety", "reports"],
  permissions: ["approval.view"],
  is_active: true,
  is_current: true,
  valid_from: "2026-11-01T00:00:00Z",
  valid_until: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const dialog = (row: ConsultantProjectAccessGrant | null, seed?: (client: QueryClient) => void) =>
  render(
    <GrantDialog
      row={row}
      organizations={[{ id: "o1", name: "Independent Engineers" } as never]}
      members={[]}
      projects={[{ id: "p1", code: "PRJ-1", name: "Tower" }]}
      onClose={() => undefined}
      onSaved={() => undefined}
    />,
    seed,
  );

describe("the grant dialog: 11 module ticks and the 3 options left of the original 7", () => {
  it("lists the client's eleven, in the client's order, and 「其他权限」", () => {
    const html = dialog(GRANT);
    const modules = [...html.matchAll(/data-module="([^"]+)"/g)].map((match) => match[1]);
    expect(modules).toEqual([
      "dashboard",
      "projects",
      "field_tasks",
      "materials",
      "progress",
      "safety",
      "documents",
      "record_centre",
      "reports",
      "notifications",
      "conversations",
    ]);
    const options = [...html.matchAll(/data-option="([^"]+)"/g)].map((match) => match[1]);
    expect(options).toEqual(["approval.view", "approval.review", "report.export"]);
    const words = text(html);
    for (const name of ["仪表板", "整改／EHS", "文件档案", "现场记录中心", "沟通记录", "顾问申请：查看", "导出"]) {
      expect(words).toContain(name);
    }
    expect(words).toContain(zh.consultantAccess.grant.selectAll);
    expect(words).toContain(zh.consultantAccess.grant.selectNone);
    // No code shown as a word.
    expect(words).not.toContain("safety.view");
  });

  it("shows an existing grant's ticks and options", () => {
    const html = dialog(GRANT);
    expect(ticked(html, "data-module", "safety")).toBe(true);
    expect(ticked(html, "data-module", "materials")).toBe(false);
    expect(ticked(html, "data-option", "approval.view")).toBe(true);
    expect(ticked(html, "data-option", "approval.review")).toBe(false);
  });

  it("starts a new grant from the company's 顾问项目默认权限 (JB203-9 kept)", () => {
    const html = dialog(null, (client) =>
      client.setQueryData(["contractor-site-settings"], {
        default_consultant_modules: ["materials", "record_centre"],
        default_consultant_permissions: ["report.export"],
      }),
    );
    expect(ticked(html, "data-module", "materials")).toBe(true);
    expect(ticked(html, "data-module", "record_centre")).toBe(true);
    expect(ticked(html, "data-module", "safety")).toBe(false);
    expect(ticked(html, "data-option", "report.export")).toBe(true);
  });

  it("has every word in the four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const group of ["module", "moduleHint"] as const) {
        expect(Object.keys(messages.consultantAccess[group]).sort()).toEqual(
          Object.keys(zh.consultantAccess[group]).sort(),
        );
      }
      for (const code of ["consultant_read_only", "consultant_module_not_granted", "consultant_no_permit"]) {
        expect((messages.errors.api as Record<string, string>)[code]).toBeTruthy();
      }
    }
  });
});

/** Every page the menu shows, headings left out. */
function menuPages(features: string[], permissions: string[] = []): string[] {
  return visibleNavigation("MSE_TRACE", features, permissions).flatMap((group) =>
    group.items.flatMap((item) =>
      item.children?.length ? navLeaves(item.children).map((leaf) => leaf.href) : [item.href],
    ),
  );
}

describe("the consultant's menu follows the ticks (「支持总部按项目勾选」)", () => {
  // What `consultant_features` returns for 报表中心 + 整改／EHS + 顾问申请：查看.
  const consultant = [
    "dashboard",
    "safety",
    "hazard_rectification",
    "approvals",
    "consultant_applications",
    "report_center",
    "report_safety",
    "report_consultant",
    "consultant_menu",
  ];

  it("shows the reports of the ticked modules and no other", () => {
    const pages = menuPages(consultant, ["approval.view"]);
    expect(pages).toContain("/reports/contractor/safety");
    expect(pages).toContain("/reports/contractor/consultant");
    expect(pages).toContain("/reports/contractor/history");
    for (const page of [
      "/reports/contractor/progress",
      "/reports/contractor/attendance",
      "/reports/contractor/equipment",
      "/reports/contractor/claims",
      "/reports/contractor/material_outgoing",
    ]) {
      // Typed in by hand, the page's report is refused by the server
      // (`consultant_module_not_granted`); the menu never offers it.
      expect(pages).not.toContain(page);
    }
  });

  it("never shows 审批流程（高级）, 现场记录中心 or 沟通记录 without their own ticks", () => {
    // `projects` (the 项目 tick) and `approvals` no longer open 沟通记录 or 审批流程.
    const pages = menuPages([...consultant, "documents", "projects"], ["approval.view", "document.view"]);
    expect(pages).toContain("/documents");
    expect(pages).not.toContain("/approvals");
    expect(pages).not.toContain("/archive-queue");
    expect(pages).not.toContain("/field-chats");
    const ticked = menuPages([...consultant, "record_centre", "field_chats"], ["approval.view"]);
    expect(ticked).toContain("/archive-queue");
    expect(ticked).toContain("/field-chats");
  });

  it("leaves the contractor's menu as it was (「已经弄好的功能不要改到」)", () => {
    // A contractor's list carries the keys it always had, and no marker.
    const contractor = ["dashboard", "projects", "project_categories", "documents", "approvals", "report_center"];
    const pages = menuPages(contractor, ["document.view", "approval.view"]);
    for (const page of [
      "/archive-queue",
      "/field-chats",
      "/approvals",
      "/reports/contractor/attendance",
      "/reports/contractor/progress",
      "/reports/contractor/documents",
      "/reports/contractor/history",
    ]) {
      expect(pages).toContain(page);
    }
  });
});

describe("conversations a consultant does not take part in (Lucas 11-16 Q2 = A)", () => {
  it("shows him the task and application conversations only", () => {
    expect(consultantSeesConversation("CONSULTANT", "FIELD_TASK")).toBe(true);
    expect(consultantSeesConversation("CONSULTANT", "CONSULTANT_APPLICATION")).toBe(true);
    expect(consultantSeesConversation("CONSULTANT", "MATERIAL_RECEIPT")).toBe(false);
    expect(consultantSeesConversation("CONSULTANT", "PROGRESS")).toBe(false);
    expect(consultantSeesConversation("TENANT", "MATERIAL_RECEIPT")).toBe(true);
  });

  it("lists his own conversations on 「沟通记录」, with no 找人沟通", () => {
    auth.user = { id: "c1", account_type: "CONSULTANT", full_name: "Resident Engineer" };
    try {
      const html = render(<FieldChatsOffice />, (client) =>
        client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "consultant"], {
          count: 2,
          results: [
            {
              kind: "FIELD_TASK",
              id: "t1",
              title: "FT-001 Slab photo",
              project: "",
              project_name: "Tower",
              people: [],
              member: true,
              message_count: 1,
              last: { body: "Please add a close-up." },
              last_at: "2026-11-16T09:00:00Z",
              unread: 0,
            },
            {
              kind: "HAZARD",
              id: "h1",
              title: "SI-001 Edge protection",
              project: "",
              project_name: "Tower",
              people: [],
              member: true,
              message_count: 1,
              last: null,
              last_at: "2026-11-16T08:00:00Z",
              unread: 0,
            },
          ],
        }),
      );
      expect(html).toContain('data-consultant-chats');
      expect(html).toContain('data-consultant-chat-row="FIELD_TASK"');
      // 整改 keeps its own room: the row opens it.
      expect(html).toContain('href="/hazard-rectifications?incident=h1"');
      expect(text(html)).not.toContain(zh.fieldChats.find.title);
      expect(text(html)).toContain(zh.fieldChats.consultant.kind.FIELD_TASK);
    } finally {
      auth.user = { id: "u1", account_type: "TENANT", full_name: "Someone" };
    }
  });
});
