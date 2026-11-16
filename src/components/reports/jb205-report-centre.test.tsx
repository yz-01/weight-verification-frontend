/**
 * JB205 (Lucas 11-16 audit) - 报表中心 › 报表查询 for MSE staff.
 *
 * - JB205-7: the file behind 导出 - its 预览 and 打印 too - is made by the
 *   export endpoint, which needs `report.export`; the button is shown only to
 *   whoever holds it.
 * - JB205-10: a start date after the end date is not asked for at all and
 *   says so under the dates, instead of 「无法加载报表」.
 *
 * Rendered to static markup (the runner has no DOM); the date rule, which
 * needs a date to be typed, is read in the source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({ codes: new Set<string>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/reports/search",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "MSE", portal: "MSE_ADMIN", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => state.codes.has(code),
  }),
}));

const { AdminReportWorkspace } = await import("@/components/reports/admin-report-workspace");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function render(codes: string[]) {
  state.codes = new Set(codes);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <AdminReportWorkspace section="search" />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB205-7: 导出 follows report.export", () => {
  it("is not offered to a role that may only read reports", () => {
    const html = render(["report.view"]);
    expect(html).toContain(zh.adminReports.filter.dateFrom);
    expect(html).not.toContain('data-slot="export-menu"');
  });

  it("is offered to whoever may export", () => {
    expect(render(["report.view", "report.export"])).toContain('data-slot="export-menu"');
  });
});

describe("JB205-10: a start after the end is said under the dates", () => {
  const source = read("src/components/reports/admin-report-workspace.tsx");

  it("is not sent to the server, which would only refuse it", () => {
    expect(source).toContain("const backwards = Boolean(dateFrom && dateTo && dateFrom > dateTo);");
    expect(source).toMatch(/meta: NOT_LIVE,\n\s+enabled: !backwards,/);
  });

  it("says why, in place of the report", () => {
    expect(source).toMatch(/\{backwards && \(\n\s+<p role="alert"[^>]*>\n\s+\{t\("datesBackwards"\)\}/);
    expect(source).toContain("{backwards ? null : report.isError ? (");
  });

  it("in all four languages", async () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = (await import(`@/messages/${locale}.json`)).default as typeof zh;
      expect(messages.adminReports.datesBackwards, locale).toBeTruthy();
    }
    expect(zh.adminReports.datesBackwards).toBe("开始日期不能晚于结束日期。");
  });
});
