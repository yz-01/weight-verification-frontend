/**
 * PDF 统一操作规则 (2026-10-10): the browser side of 预览 · 打印 · 导出 · 发送.
 */
import { describe, expect, it, vi } from "vitest";

import {
  canShowPdfInPage,
  fileFormat,
  isAppleMobile,
  mailtoLink,
  shareFile,
  whatsappLink,
} from "@/lib/file-actions";

const PDF = new File(["%PDF"], "MO-1.pdf", { type: "application/pdf" });

const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

describe("fileFormat", () => {
  it("knows a PDF and a workbook by type or by name", () => {
    expect(fileFormat(PDF)).toBe("pdf");
    expect(fileFormat({ name: "report.pdf", type: "" })).toBe("pdf");
    expect(
      fileFormat({ name: "x", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    ).toBe("sheet");
    expect(fileFormat({ name: "list.xlsx", type: "application/octet-stream" })).toBe("sheet");
    expect(fileFormat({ name: "a.jpg", type: "image/jpeg" })).toBe("image");
    expect(fileFormat({ name: "a.zip", type: "application/zip" })).toBe("other");
  });
});

describe("where a PDF can be shown in the page", () => {
  it("on a computer, yes", () => {
    expect(canShowPdfInPage({ userAgent: DESKTOP, maxTouchPoints: 0, pdfViewerEnabled: true })).toBe(true);
    expect(canShowPdfInPage({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 })).toBe(true);
  });

  it("on Android Chrome, no - it says so, or is known not to", () => {
    expect(canShowPdfInPage({ userAgent: ANDROID, maxTouchPoints: 5, pdfViewerEnabled: false })).toBe(false);
    expect(canShowPdfInPage({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });

  it("on an iPhone or an iPad, no - Safari draws only the first page in a frame", () => {
    expect(isAppleMobile({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })).toBe(true);
    expect(canShowPdfInPage({ userAgent: IPHONE, maxTouchPoints: 5, pdfViewerEnabled: true })).toBe(false);
  });
});

describe("shareFile", () => {
  it("hands the file itself to the share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareFile(PDF, "MO-1", { share, canShare: () => true })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "MO-1", files: [PDF] });
  });

  it("says unsupported where there is no share sheet for files", async () => {
    expect(await shareFile(PDF, "MO-1", {})).toBe("unsupported");
    expect(await shareFile(PDF, "MO-1", { share: vi.fn(), canShare: () => false })).toBe("unsupported");
  });

  it("tells a cancel from a refusal", async () => {
    const cancelled = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    expect(await shareFile(PDF, "MO-1", { share: cancelled, canShare: () => true })).toBe("cancelled");
    const refused = vi.fn().mockRejectedValue(new DOMException("no tap", "NotAllowedError"));
    expect(await shareFile(PDF, "MO-1", { share: refused, canShare: () => true })).toBe("failed");
  });
});

describe("the desktop fallback's links", () => {
  it("writes an email and a WhatsApp message to attach the file to", () => {
    expect(mailtoLink("MO-1", "请查收附件：MO-1.pdf")).toBe(
      `mailto:?subject=MO-1&body=${encodeURIComponent("请查收附件：MO-1.pdf")}`,
    );
    expect(whatsappLink("MO-1 & co")).toBe("https://wa.me/?text=MO-1%20%26%20co");
  });
});
