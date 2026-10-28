/**
 * JB48 (Lucas 10-28): a report of more than 20 records is made in the
 * background. The export says 「报表正在准备，好了会通知您」 and ends without a
 * file; 「报表导出历史」 shows 「准备中」 until it is ready, and one that was
 * not made says why, with 「重新导出」 back to its report page.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContractorReportJob } from "@/interfaces/contractor-report";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } } }),
}));

const { ApiError } = await import("@/interfaces/api");
const { REPORT_QUEUED, captureDownload, download } = await import("@/services/api-client");
const { ReportJobs, reportPageOf } = await import("@/components/reports/report-jobs");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function job(patch: Partial<ContractorReportJob>): ContractorReportJob {
  return {
    id: "j-1",
    report_type: "safety",
    title: "整改 / EHS 报表",
    date_from: "2026-10-01",
    date_to: "2026-10-28",
    record_count: 45,
    status: "PREPARING",
    failure: "",
    return_to: "/reports/contractor/safety?date_from=2026-10-01",
    created_at: "2026-10-28T09:00:00Z",
    ...patch,
  };
}

function render(rows: ContractorReportJob[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["contractor-reports", "jobs"], rows);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <ReportJobs />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a report made in the background (JB48)", () => {
  it("ends the export without a file and says it is being prepared", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { background: true, job: "j-1", record_count: 45 } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const failure = await captureDownload(() =>
      download("/api/contractor-reports/export_report/", { method: "POST", fallbackFilename: "r.pdf" }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as InstanceType<typeof ApiError>).code).toBe(REPORT_QUEUED);
    // No message of its own: the file actions stay quiet; the toast says it.
    expect((failure as InstanceType<typeof ApiError>).message).toBe("");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("shows 准备中 while it is being made", () => {
    const html = render([job({})]);
    expect(html).toContain("正在准备的报表");
    expect(html).toContain("整改 / EHS 报表");
    expect(html).toContain("45 笔");
    expect(html).toContain("准备中");
    expect(html).toContain("报表正在准备，好了会通知您。");
  });

  it("says plainly why one was not made, with 重新导出", () => {
    const html = render([
      job({ id: "j-2", status: "FAILED", failure: "interrupted" }),
      job({ id: "j-3", status: "FAILED", failure: "failed" }),
    ]);
    expect(html).toContain("没有做成");
    expect(html).toContain("做报表时被中断了");
    expect(html).toContain("请把日期范围改短");
    expect(html.match(/重新导出<\/button>/g)?.length).toBe(2);
  });

  it("shows nothing when nothing is being made", () => {
    expect(render([])).toBe("");
  });

  it("sends 重新导出 back to the report page it came from", () => {
    expect(reportPageOf(job({}))).toBe("/reports/contractor/safety?date_from=2026-10-01");
    expect(reportPageOf(job({ return_to: "" }))).toBe("/reports/contractor/safety");
    expect(reportPageOf(job({ return_to: "", report_type: "material_report" }))).toBe("/reports/material-quantity");
  });

  it("has every word in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const jobs = messages.contractorReports.jobs;
      for (const value of [jobs.title, jobs.preparing, jobs.preparingHint, jobs.failed, jobs.again,
        jobs.failure.failed, jobs.failure.interrupted, messages.fileActions.reportQueued,
        messages.contractorReports.type.material_report]) {
        expect(value).toBeTruthy();
      }
    }
  });
});
