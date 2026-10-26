/**
 * JB29 (客户 10-26 事项 5): 「预览、打印、下载、导出、发送及打开原记录等操作集中
 * 安排在上方，避免重复按钮」. In the photo viewer's one row, a record's two
 * PDFs are one button each - 「完整证据 PDF ▾」「修改前原单 ▾」 - their four
 * actions under it, instead of two rows of 预览 · 打印 · 导出 · 发送.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecordExportButton } from "@/components/shared/record-export-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

function render(layout?: "buttons" | "menu") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  // A corrected delivery: it has an original too.
  client.setQueryData(["record-corrections", "MATERIAL_RECEIPT", "r1"], { corrections: [{ id: "c1" }] });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <RecordExportButton kind="MATERIAL_RECEIPT" recordId="r1" reference="MI-001" layout={layout} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a record's PDFs in one row (JB29)", () => {
  it("is one button per PDF, named by the file, with nothing repeated beside it", () => {
    const html = render("menu");
    expect(html.match(/data-slot="file-action-menu"/g)).toHaveLength(2);
    expect(html).toContain("完整证据 PDF");
    expect(html).toContain("修改前原单");
    // The four actions wait inside each menu, not as buttons in the row.
    expect(html).not.toContain('data-slot="file-action-preview"');
    expect(html).not.toContain('data-slot="file-action-share"');
  });

  it("leaves the record detail's four buttons as they were", () => {
    const html = render();
    expect(html).not.toContain('data-slot="file-action-menu"');
    expect(html.match(/data-slot="file-action-preview"/g)).toHaveLength(2);
  });
});
