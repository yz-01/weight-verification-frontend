/**
 * QA1 audit #15 (JB276 + JB279, 客户 11-26 事项 17 + 20): on a 材料进场 /
 * 材料退场 the missing MR link is one line of 「以下必填资料不完整」 - never a
 * separate line hidden behind another reason (the JB169 补供应商 one). On a
 * 材料领用 (no checklist) it keeps its own line.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-office", full_name: "Office", is_field_staff: false },
    can: () => true,
  }),
}));

const { RecordClosurePanel, recordClosureKey } = await import("@/components/shared/record-closure");

function render(node: React.ReactNode, data: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(recordClosureKey(String(data.kind), "r-1"), {
    record: "r-1",
    ready: true,
    closed: false,
    closure: null,
    ...data,
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the MR link inside 「以下必填资料不完整」", () => {
  it("is listed with the other missing items on a delivery, the supplier reason shown too", () => {
    const html = render(
      <RecordClosurePanel
        kind="MATERIAL_RECEIPT"
        recordId="r-1"
        blocked={{ reason: "SUPPLIER-FIRST" }}
      />,
      { kind: "MATERIAL_RECEIPT", checklist: true, missing: ["supplier", "mr_link"], mr_link_missing: true },
    );
    expect(html).toContain(zh.jb276.missingTitle);
    expect(html).toContain('data-archive-missing-item="mr_link"');
    expect(html).toContain(zh.jb276.missing.mr_link);
    expect(html).toContain("SUPPLIER-FIRST");
    // Not a second, separate copy of the same reason.
    expect(html).not.toContain(zh.jb279.archiveBlocked);
  });

  it("keeps its own line on a 领用 (no checklist), even behind another reason", () => {
    const html = render(
      <RecordClosurePanel kind="MATERIAL_OUTGOING" recordId="r-1" blocked={{ reason: "OTHER-REASON" }} />,
      { kind: "MATERIAL_OUTGOING", mr_link_missing: true },
    );
    expect(html).toContain("OTHER-REASON");
    expect(html).toContain(zh.jb279.archiveBlocked);
  });

  it("has its words in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb276.missing.mr_link.length).toBeGreaterThan(3);
    }
  });
});
