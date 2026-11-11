/**
 * 「A4 预览」 (JB163, 客户 11-10 晚上 第十一批 第二段): every consultant
 * application type gets the formal A4 page, while it is filled in and on an
 * application already made. The page itself is the backend's (the export's
 * own renderer - `consultant_workflow.test_jb163_form_preview`); here is what
 * the office screens draw: the button (enabled, or greyed with the fields it
 * waits for), the preview (pages, number, own-form note, 打开 PDF), its
 * failure with 重试, and the three calls it makes.
 *
 * Rendered to static markup - the runner has no DOM - so the dialog's body
 * is rendered on its own and clicks are not simulated.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ConsultantApplicationPayload } from "@/interfaces/consultant-workflow";
import zh from "@/messages/zh.json";
import type { ApplicationFormPreviewInfo, ApplicationFormPreviewSource } from "@/services/consultant-workflow.service";

const fetchObjectUrl = vi.fn(async () => "blob:fetched");
const api = { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() };
vi.mock("@/services/api-client", () => ({
  api,
  toastSuccess: vi.fn(),
  download: vi.fn(),
  fetchObjectUrl,
}));

const { ApplicationA4PreviewBody, ApplicationA4PreviewButton, PREVIEW_PAGE_LIMIT, previewKey } = await import(
  "@/components/consultant-workflow/application-a4-preview"
);
const { ApplicationFormCard } = await import("@/components/consultant-workflow/application-form-card");
const { applicationFormPreviewObjectUrl, getApplicationFormPreviewInfo } = await import(
  "@/services/consultant-workflow.service"
);

const SAVED: ApplicationFormPreviewSource = { kind: "saved", id: "app-1" };
const PAYLOAD = {
  project: "p1",
  workflow: "w1",
  application_type: "type-ncr",
  consultant_organization: "org-1",
  consultant: "c1",
  location: "Level 3",
  component: "",
  description: "Honeycomb at column C3.",
} as ConsultantApplicationPayload;
const NEW: ApplicationFormPreviewSource = { kind: "new", payload: PAYLOAD };

const INFO: ApplicationFormPreviewInfo = {
  application_no: "RFI-SITE-NCR-0003",
  number_provisional: false,
  status: "DRAFT",
  application_type_code: "NCR",
  pages: 1,
  form_pages: 1,
  consultant_form: null,
};

function wrap(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function body(
  source: ApplicationFormPreviewSource,
  { info, pages = {}, pdf, failed = false }: { info?: ApplicationFormPreviewInfo; pages?: Record<number, string>; pdf?: string; failed?: boolean } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  if (info) client.setQueryData(previewKey(source, "info"), info);
  for (const [page, url] of Object.entries(pages)) client.setQueryData(previewKey(source, "png", Number(page)), url);
  if (pdf) client.setQueryData(previewKey(source, "pdf"), pdf);
  if (failed) {
    const query = client.getQueryCache().build(client, { queryKey: previewKey(source, "info") });
    query.setState({ status: "error", error: new Error("boom"), fetchStatus: "idle" });
  }
  return wrap(<ApplicationA4PreviewBody source={source} onClose={() => {}} />, client);
}

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("「A4 预览」 button (JB163)", () => {
  it("is offered once the form has what the A4 page needs", () => {
    const html = wrap(<ApplicationA4PreviewButton source={() => NEW} requires={[["p1", "项目"], ["type-ncr", "申请类型"]]} />);
    expect(html).toContain("A4 预览");
    expect(html).toContain('data-slot="application-a4-preview"');
    expect(html).not.toMatch(/data-slot="application-a4-preview"[^>]*disabled=""/);
  });

  it("is greyed until the project and type are chosen, and says which are missing", () => {
    const html = wrap(<ApplicationA4PreviewButton source={() => NEW} requires={[["", "项目"], ["", "申请类型"], ["c1", "顾问"]]} />);
    expect(html).toMatch(/disabled=""[^>]*data-slot="application-a4-preview"|data-slot="application-a4-preview"[^>]*disabled=""/);
    expect(html).toContain("还差这些没填：项目、申请类型");
    expect(html).not.toContain("还差这些没填：项目、申请类型、顾问");
  });

  it("says why when greyed for another reason", () => {
    const html = wrap(<ApplicationA4PreviewButton source={() => SAVED} disabledReason="还不能预览" />);
    expect(html).toContain("还不能预览");
    expect(html).toMatch(/disabled=""/);
  });

  it("sits on the application's A4 form card, first", () => {
    const html = wrap(
      <ApplicationFormCard
        consultantName="Consultant Engineer"
        attachmentCount={2}
        canSend={false}
        isSubmitting={false}
        onSend={() => {}}
        onPrint={async () => {}}
        onShowAttachments={() => {}}
        exportButtons={null}
        a4Preview={<ApplicationA4PreviewButton source={() => SAVED} />}
      />,
    );
    expect(html.indexOf("A4 预览")).toBeGreaterThan(-1);
    expect(html.indexOf('data-slot="application-a4-preview"')).toBeLessThan(html.indexOf('data-slot="application-form-print"'));
  });

  it("is on the form while filling in (new and draft) and on the detail", () => {
    const form = read("src/components/consultant-workflow/application-form.tsx");
    expect(form).toContain("<ApplicationA4PreviewButton");
    expect(form).toContain("requires={formRequires}");
    expect(form).toContain('{ kind: "draft", id, payload: payloadNow() }');
    expect(form).toContain('{ kind: "new", payload: payloadNow() }');
    // The save sends the same payload the preview draws.
    expect(form).toContain("updateConsultantApplication(id, payloadNow()) : createConsultantApplication(payloadNow())");
    // The type is not one of a fixed list: whatever the project's options hold.
    expect(form.slice(form.indexOf("const formRequires"), form.indexOf("] as const;"))).not.toMatch(/RFI|NCR|WIR/);
    const detail = read("src/components/consultant-workflow/application-detail.tsx");
    expect(detail).toContain('<ApplicationA4PreviewButton source={() => ({ kind: "saved", id: application.id })} />');
  });
});

describe("the preview (JB163)", () => {
  it("shows the page drawn by the server, the number and 打开 PDF once the file is here", () => {
    const html = body(SAVED, { info: INFO, pages: { 1: "blob:page-1" }, pdf: "blob:pdf-1" });
    expect(html).toContain('src="blob:page-1"');
    expect(html).toContain('alt="正式 A4 申请表 第 1 页"');
    expect(html).toContain("第 1 / 1 页");
    expect(html).toContain("申请编号：RFI-SITE-NCR-0003");
    expect(html).not.toContain("现在保存草稿时会得到的编号");
    expect(html).toContain("打开 PDF");
    expect(html).not.toMatch(/data-slot="application-a4-open-pdf"[^>]*disabled=""/);
  });

  it("waits for the PDF with a reason, and says while the page is drawn", () => {
    const html = body(SAVED, { info: INFO });
    expect(html).toContain("PDF 正在生成，请稍候。");
    expect(html).not.toContain("<img");
    const loading = body(SAVED);
    expect(loading).toContain("正在生成 A4 预览……");
  });

  it("tells a form still being filled in that its number is the one it gets when saved", () => {
    const html = body(NEW, { info: { ...INFO, number_provisional: true }, pages: { 1: "blob:new-1" } });
    expect(html).toContain("申请编号 RFI-SITE-NCR-0003 是现在保存草稿时会得到的编号");
  });

  it("says the consultant's own form follows as it is, blank or filled in", () => {
    const own = { name: "Consultant RFI form", version: 2, file_name: "rfi.pdf", source: "BLANK" as const, pages: 2 };
    const html = body(SAVED, { info: { ...INFO, pages: 3, consultant_form: own } });
    expect(html).toContain("此申请使用顾问自有表格「Consultant RFI form」（第 2 版）");
    expect(html).toContain("第 2 页起是顾问表格原样，保留顾问原来的公司表头和格式");
    expect(html).toContain("这里显示的是空白原表");
    expect(html).toContain("第 3 / 3 页");
    const filled = body(SAVED, { info: { ...INFO, pages: 3, consultant_form: { ...own, source: "FILLED" } } });
    expect(filled).toContain("上传的已填写顾问表格原样");
  });

  it("draws at most a few pages and sends the reader to the PDF for the rest", () => {
    const html = body(SAVED, { info: { ...INFO, pages: PREVIEW_PAGE_LIMIT + 4 } });
    expect(html.match(/<figure/g)?.length).toBe(PREVIEW_PAGE_LIMIT);
    expect(html).toContain("另有 4 页没有在这里显示");
  });

  it("says when it could not be drawn, with 重试, and offers no file", () => {
    const html = body(SAVED, { failed: true });
    expect(html).toContain("无法载入A4 预览");
    expect(html).toContain("重试");
    expect(html).not.toContain("<img");
    expect(html).toMatch(/data-slot="application-a4-open-pdf"[^>]*disabled=""|disabled=""[^>]*data-slot="application-a4-open-pdf"/);
    expect(html).toContain("PDF 无法生成，请重试。");
    expect(html).not.toContain("PDF 正在生成");
  });
});

describe("the three calls (JB163)", () => {
  it("reads a saved application, posts a draft's edits and a new application's payload", async () => {
    await getApplicationFormPreviewInfo(SAVED);
    expect(api.get).toHaveBeenLastCalledWith("/api/consultant-applications/app-1/form_preview/", { output: "json" }, { silent: true });
    await getApplicationFormPreviewInfo({ kind: "draft", id: "app-1", payload: { description: "edited" } });
    expect(api.post).toHaveBeenLastCalledWith(
      "/api/consultant-applications/app-1/preview_draft_form/",
      { description: "edited" },
      { query: { output: "json" }, silent: true },
    );
    await getApplicationFormPreviewInfo(NEW);
    expect(api.post).toHaveBeenLastCalledWith("/api/consultant-applications/preview_new_form/", PAYLOAD, {
      query: { output: "json" },
      silent: true,
    });
  });

  it("fetches a page as a picture or the PDF, never saving anything", async () => {
    await applicationFormPreviewObjectUrl(SAVED, "png", 2);
    expect(fetchObjectUrl).toHaveBeenLastCalledWith("/api/consultant-applications/app-1/form_preview/", {
      query: { output: "png", page: 2 },
      silent: true,
    });
    await applicationFormPreviewObjectUrl(NEW, "pdf");
    expect(fetchObjectUrl).toHaveBeenLastCalledWith("/api/consultant-applications/preview_new_form/", {
      method: "POST",
      body: PAYLOAD,
      query: { output: "pdf" },
      silent: true,
    });
    await applicationFormPreviewObjectUrl({ kind: "draft", id: "app-1", payload: { remarks: "x" } }, "png");
    expect(fetchObjectUrl).toHaveBeenLastCalledWith("/api/consultant-applications/app-1/preview_draft_form/", {
      method: "POST",
      body: { remarks: "x" },
      query: { output: "png", page: 1 },
      silent: true,
    });
  });
});
