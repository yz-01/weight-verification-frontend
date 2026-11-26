/**
 * QA1 audit #9 (JB244, 客户 11-23 事项 16: 「材料名称、分类、规格及单位：导入『材料分类管理』」
 * 「导入后自动保存到对应管理栏目」): the done message no longer says the new
 * materials are already in the projects' 材料分类 - they are on the company's
 * list, and 【加到现有项目】 is offered right there; 「分类」 kept as 说明 says so.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import type { ImportResult } from "@/services/excel-import.service";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: () => true }),
}));

const { ResultPanel } = await import("@/components/shared/excel-import-dialog");
const SRC = path.resolve(__dirname, "../..");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const result = (over: Partial<ImportResult> = {}) =>
  ({ added_count: 2, skipped_count: 0, problem_count: 0, materials_added: 1, specs_added: 1, ...over }) as ImportResult;

describe("after a material import", () => {
  it("says the projects do not have them yet and offers 【加到现有项目】", () => {
    const html = render(<ResultPanel kind="material" result={result()} onAddToProjects={() => undefined} />);
    expect(html).toContain(zh.jb244.doneWhere.material);
    expect(html).toContain("excel-import-add-to-projects");
    expect(html).toContain(zh.jb244.addToProjects);
  });

  it("offers nothing when nothing was added, or to one who may not add to projects", () => {
    expect(
      render(<ResultPanel kind="material" result={result({ materials_added: 0, specs_added: 0 })} onAddToProjects={() => undefined} />),
    ).not.toContain("excel-import-add-to-projects");
    expect(render(<ResultPanel kind="material" result={result()} />)).not.toContain("excel-import-add-to-projects");
  });

  it("the company page passes the button, and the words are in all four languages", () => {
    const page = readFileSync(path.join(SRC, "components/contractor-ops/company-categories.tsx"), "utf8");
    expect(page).toMatch(/onAddToProjects=\{\s*can\("category\.manage"\)/);
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb244.doneWhere.material).toContain(messages.categoryManagement.company.addToProjects);
      expect(messages.jb244.addToProjects).toBe(messages.categoryManagement.company.addToProjects);
      expect(messages.jb244.categoryAsDescription).toContain("{header}");
    }
  });
});
