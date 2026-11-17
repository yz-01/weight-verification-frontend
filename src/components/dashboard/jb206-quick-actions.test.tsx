/**
 * JB206-3 (Lucas 11-16 audit): the project dashboard's 快捷操作 offers 新建项目
 * and 新增供应商 only to who holds them - a project user was sent back to
 * the dashboard with no word. Rendered to static markup (no DOM).
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ codes: [] as string[] }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: (code: string) => auth.codes.includes(code) }),
}));

const { QuickActions } = await import("@/components/dashboard/contractor-dashboard");

function render(codes: string[]) {
  auth.codes = codes;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <QuickActions project="p1" />
    </NextIntlClientProvider>,
  );
}

describe("快捷操作 by permission (JB206-3)", () => {
  it("hides 新建项目 and 新增供应商 from a project user", () => {
    const html = render(["category.manage", "document.view", "notification.send"]);
    expect(html).not.toContain('href="/projects/create"');
    expect(html).not.toContain('href="/suppliers/create"');
    // The rest stay.
    expect(html).toContain("/documents?create=1");
    expect(html).toContain("/notifications?create=1");
  });

  it("shows all of them to head office", () => {
    const html = render(["project.create", "supplier.create"]);
    expect(html).toContain('href="/projects/create"');
    expect(html).toContain('href="/suppliers/create"');
  });
});
