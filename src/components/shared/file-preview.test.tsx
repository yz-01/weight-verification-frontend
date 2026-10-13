/**
 * H9 (事项9, 图9): 「今天检查所有事项的眼睛，很多不能预览」.
 *
 * The preview says plainly when a file is download-to-view, and a PDF on a
 * phone whose browser has no PDF viewer opens the phone's own viewer instead
 * of a blank frame (the same rule as `file-actions`' PdfView). Rendered to
 * static markup; the runner has no DOM.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "@/messages/zh.json";

import { TooltipProvider } from "@/components/ui/tooltip";

const { FilePreview, downloadOnlyReason, previewKind } = await import(
  "@/components/shared/file-preview"
);

function render(filename: string, previewType: string | null) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>
        <FilePreview
          load={() => new Promise<string>(() => {})}
          previewType={previewType}
          filename={filename}
          onDownload={() => undefined}
        />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

describe("what the eye can and cannot show (H9)", () => {
  it("names why a file is download-to-view", () => {
    expect(downloadOnlyReason("minutes.doc")).toBe("legacyOffice");
    expect(downloadOnlyReason("costs.XLS")).toBe("legacyOffice");
    expect(downloadOnlyReason("briefing.pptx")).toBe("presentation");
    expect(downloadOnlyReason("briefing.ppt")).toBe("presentation");
    expect(downloadOnlyReason("site.HEIC")).toBe("photoFormat");
    expect(downloadOnlyReason("drawing.dwg")).toBe("other");
  });

  it("says 下载查看 on the button, with the reason, for each of them", () => {
    for (const [name, words] of [
      ["minutes.doc", "旧版 DOC"],
      ["briefing.pptx", "PPTX 演示文稿"],
      ["site.heic", "HEIC 照片"],
      ["drawing.dwg", "DWG 文件"],
    ] as const) {
      const html = render(name, null);
      expect(html, name).toContain(words);
      expect(html, name).toContain("下载查看");
    }
  });

  it("shows a scanned TIFF as the PDF the server converts it to", () => {
    expect(previewKind("application/pdf", "permit-scan.tif")).toBe("pdf");
  });

  it("keeps Word and Excel workbooks in the page", () => {
    expect(previewKind(null, "minutes.docx")).toBe("word");
    expect(previewKind(null, "emergency-list.xlsx")).toBe("sheet");
  });
});

describe("a PDF on a phone with no PDF viewer", () => {
  it("opens the phone's own viewer instead of a blank frame, and prints from it", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/shared/file-preview.tsx"),
      "utf8",
    );
    expect(source).toContain("useState(canShowPdfInPage)");
    const fallback = source.indexOf('kind === "pdf" && !pdfInPage ? (');
    const frame = source.indexOf("<iframe ref={frame}");
    expect(fallback).toBeGreaterThan(-1);
    expect(fallback).toBeLessThan(frame);
    expect(source).toContain('t("openInViewer")');
    // Print on such a phone opens the viewer too: a frame cannot print there.
    const print = source.slice(source.indexOf("const print = () => {"));
    expect(print.indexOf('kind === "pdf" && !pdfInPage')).toBeLessThan(
      print.indexOf("window.open(url"),
    );
  });
});
