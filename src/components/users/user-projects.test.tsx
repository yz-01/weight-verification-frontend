/**
 * 所属项目 (JB119, 客户 11-06 第三轮事项 1): 「进入「用户管理」查看她的账号资料时，没有
 * 显示所属项目……请确保项目人员名单、用户账号所属项目及实际访问权限一致。」
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { portal: "MSE_TRACE" }, can: () => true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/users/u1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { UserProjectsSection } = await import("@/components/users/view-user");

function render(projects: { all: boolean; assigned: { id: string; code: string; name: string }[] }) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
      <UserProjectsSection projects={projects} />
    </NextIntlClientProvider>,
  );
}

describe("所属项目 on a person's page", () => {
  it("lists every project the person is on", () => {
    const html = render({
      all: false,
      assigned: [
        { id: "p1", code: "PRJ-0001", name: "Project 1A" },
        { id: "p2", code: "PRJ-0002", name: "Project 2B" },
      ],
    });
    expect(html).toContain("所属项目");
    expect(html).toContain("Project 1A");
    expect(html).toContain("Project 2B");
    expect(html).toContain('href="/projects/p2"');
    expect(html).toContain("项目人员名单");
  });

  it("says when the person sees every project, or is on none", () => {
    expect(render({ all: true, assigned: [] })).toContain("可以查看公司全部项目");
    expect(render({ all: false, assigned: [] })).toContain("还没有加入任何项目");
  });

  it("the project card is called 项目人员名单", () => {
    expect(zh.projects.team.title).toBe("项目人员名单");
  });
});
