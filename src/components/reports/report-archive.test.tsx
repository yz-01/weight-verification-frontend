/**
 * 报表导出历史 as an archive (建筑商总部, 2026-10-10).
 *
 * 「点击文件名或「查看」按钮，可直接打开当时生成的报表 · 支持预览 · 支持再次下载 ·
 * 支持打印 · 打开的必须是当时已经生成并保存的那一份历史文件 · 不要点击后再用
 * 当前数据库资料重新生成」.
 *
 * The runner has no DOM: the row pieces are rendered to static markup, and the
 * hook is called inside a render with the shared file actions replaced by a
 * recorder, so the test can see exactly which file each action fetches.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ArchivedReportFile } from "@/interfaces/report-archive";
import messages from "@/messages/zh.json";

const run = vi.fn();
vi.mock("@/components/shared/file-actions", async (original) => ({
  ...(await original<typeof import("@/components/shared/file-actions")>()),
  useFileActions: () => ({ busy: null, run, element: null }),
}));

const preview = vi.fn(async () => new File(["x"], "kept.pdf"));
const download = vi.fn(async () => new File(["x"], "kept.pdf"));
vi.mock("@/services/report-archive.service", () => ({
  previewArchivedReport: (id: string, name: string) => preview(id, name),
  archivedReportFile: (id: string, name: string) => download(id, name),
}));

const {
  ArchivedReportActions,
  ArchivedReportName,
  ArchivedReportNote,
  formatFileSize,
  useReportArchive,
} = await import("@/components/reports/report-archive");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

const KEPT: ArchivedReportFile = {
  id: "11111111-1111-1111-1111-111111111111",
  file_name: "safety-20261001-101500.pdf",
  export_format: "PDF",
  has_file: true,
  file_size: 1_258_291,
  file_sha256: "a".repeat(64),
};
const OLD: ArchivedReportFile = {
  ...KEPT,
  id: "22222222-2222-2222-2222-222222222222",
  file_name: "safety-20260901-090000.pdf",
  has_file: false,
  file_size: 0,
  file_sha256: "",
};

function html(node: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

/** The hook's `open`, taken from inside a render. */
function archiveFromRender() {
  let archive: ReturnType<typeof useReportArchive> | null = null;
  function Probe() {
    archive = useReportArchive();
    return null;
  }
  html(<Probe />);
  return archive!;
}

beforeEach(() => {
  run.mockClear();
  preview.mockClear();
  download.mockClear();
});

describe("a history row that kept its file", () => {
  it("makes the file name and 「查看」 open it, with 打印 · 导出 · 发送 beside", () => {
    const archive = archiveFromRender();
    const markup = html(
      <>
        <ArchivedReportName row={KEPT} archive={archive} />
        <ArchivedReportActions row={KEPT} archive={archive} />
      </>,
    );
    expect(markup).toMatch(/<button[^>]*data-slot="report-archive-name"/);
    expect(markup).toContain(">查看<");
    for (const action of ["print", "save", "share"]) {
      expect(markup).toContain(`data-slot="report-archive-${action}"`);
    }
    expect(markup).not.toMatch(/data-slot="report-archive-view"[^>]*disabled=""/);
  });

  it("offers no 打印 for an Excel file, which previews as a sheet instead", () => {
    const archive = archiveFromRender();
    const markup = html(<ArchivedReportActions row={{ ...KEPT, export_format: "EXCEL" }} archive={archive} />);
    expect(markup).not.toContain('data-slot="report-archive-print"');
    expect(markup).toContain('data-slot="report-archive-save"');
  });

  it("says it is archived and never regenerated, with its size and SHA-256 behind 技术资料", () => {
    const markup = html(<ArchivedReportNote row={KEPT} />);
    expect(markup).toContain("已存档 · 不会重新生成");
    expect(markup).toContain("1.2 MB");
    expect(markup).toContain("技术资料");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("previews and prints the stored file, and saves or sends it as a download", async () => {
    const archive = archiveFromRender();
    archive.open(KEPT, "preview", "安全报表 · 2026-10-01 - 2026-10-07");
    expect(run).toHaveBeenCalledTimes(1);
    const [action, source, options] = run.mock.calls[0];
    expect(action).toBe("preview");
    expect(source.title).toBe("安全报表 · 2026-10-01 - 2026-10-07");
    expect(options).toEqual({ key: `${KEPT.id}:preview` });

    await source.load();
    expect(preview).toHaveBeenCalledWith(KEPT.id, KEPT.file_name);
    expect(download).not.toHaveBeenCalled();
    await source.loadToSend();
    expect(download).toHaveBeenCalledWith(KEPT.id, KEPT.file_name);
  });
});

describe("a history row from before files were kept", () => {
  it("greys 「查看」 and its buttons with the reason, and does not open anything", () => {
    const archive = archiveFromRender();
    const markup = html(
      <>
        <ArchivedReportName row={OLD} archive={archive} />
        <ArchivedReportNote row={OLD} />
        <ArchivedReportActions row={OLD} archive={archive} />
      </>,
    );
    const reason = "这份是本功能上线前生成的，当时没有保存文件。";
    expect(markup).not.toMatch(/<button[^>]*data-slot="report-archive-name"/);
    expect(markup).toContain(reason);
    expect(markup).toMatch(/data-slot="report-archive-view"[^>]*disabled=""/);
    expect(markup).toContain(`title="${reason}"`);

    archive.open(OLD, "preview");
    expect(run).not.toHaveBeenCalled();
  });

  it("is worded the same as the server's refusal, in all four languages", () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const catalogue = JSON.parse(read(`src/messages/${locale}.json`));
      expect(catalogue.reportArchive.missing).toBe(catalogue.errors.api.report_export_file_missing);
      expect(catalogue.errors.api.report_export_file_altered).toBeTruthy();
    }
  });
});

describe("where the archive opens from", () => {
  it("fetches the stored file, never an export that would rebuild the report", () => {
    const service = read("src/services/report-archive.service.ts");
    expect(service.match(/\/api\/report-exports\/\$\{id\}\/download_file\//g)).toHaveLength(2);
    expect(service).toMatch(/query: \{ inline: "1" \}/);
    expect(service).not.toMatch(/export_report|export_dashboard/);
  });

  it("is on every report export history", () => {
    for (const file of [
      "src/components/contractor-ops/contractor-report-workspace.tsx",
      "src/components/reports/admin-report-workspace.tsx",
      "src/components/reports/recycler-report-center.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toMatch(/<ArchivedReportName /);
      expect(source, file).toMatch(/<ArchivedReportActions /);
      expect(source, file).toMatch(/\{archive\.element\}/);
    }
  });
});
