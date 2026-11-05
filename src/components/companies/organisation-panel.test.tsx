/**
 * 部门与工种, its own page under 用户 (JB99, 客户 11-05 事项 3 第 6 点), and
 * their codes left to the system (JB100: DEP-0001 / TRD-0001 on).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { DepartmentsTradesPage } = await import("@/components/companies/organisation-panel");

describe("部门与工种 (JB99)", () => {
  it("is one page with both lists side by side", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["company-departments"], { count: 1, results: [{ id: "d1", code: "DEP-0001", name: "工地部", is_active: true }] });
    client.setQueryData(["company-trades"], { count: 1, results: [{ id: "t1", code: "TRD-0001", name: "钢筋工", is_active: true }] });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
          <DepartmentsTradesPage />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("部门与工种");
    expect(html).toContain("工地部");
    expect(html).toContain("钢筋工");
    expect(html).toContain("新建部门");
    expect(html).toContain("新建工种");
  });

  it("asks for a code only when editing one", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/companies/organisation-panel.tsx"), "utf8");
    expect(source).toMatch(/required=\{row !== null\}/);
    expect(source).toMatch(/requires=\{\[\.\.\.\(row \? \[\[code, t\("field\.code"\)\] as const\] : \[\]\)/);
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.organisation.pageTitle.trim()).not.toBe("");
      expect(messages.organisation.field.codeAuto.trim()).not.toBe("");
      expect(messages.nav.submodule.departmentsTrades).toBe(messages.organisation.pageTitle);
    }
  });
});
