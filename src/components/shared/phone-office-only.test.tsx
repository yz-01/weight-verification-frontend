/**
 * What belongs to the office is not offered on the phone (JB107).
 *
 * Lucas 11-05 (图2, from the bell): 「手机端不需要可以预览导出pdf的，这些都只是属于
 * 后台而已」, and the phone's record window said 「无法载入这条记录是否已归档」.
 * The record window, the photo viewer and every list are shared with the office,
 * so the rule sits in the shared pieces: 预览 / 打印 / 导出 / 发送, 改正 and
 * 【确认归档】 are the office's.
 *
 * The runner has no DOM, so screens are rendered to static markup.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const session = { user: { id: "u-1", is_field_staff: true }, can: () => true };
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => session,
}));

const { RecordExportButton } = await import("@/components/shared/record-export-button");
const { EvidenceFileActions } = await import("@/components/shared/evidence-file-actions");
const { ExportButton } = await import("@/components/shared/export-button");
const { useCanCorrect } = await import("@/components/shared/record-correction");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function CanCorrect() {
  return <span>{useCanCorrect("PROGRESS") ? "yes" : "no"}</span>;
}

const pieces = () => (
  <>
    <RecordExportButton kind="GATE_INCIDENT" recordId="r-1" reference="GI-014" />
    <EvidenceFileActions url="https://x/p.jpg" filename="p.jpg" title="SI-014" share />
    <ExportButton onExport={vi.fn()} />
    <CanCorrect />
  </>
);

describe("the office's buttons on the phone", () => {
  it("are not there: no 预览 / 打印 / 导出 / 发送, no 改正", () => {
    session.user.is_field_staff = true;
    const html = render(pieces());
    for (const word of ["预览", "打印", "导出", "发送", "下载"]) expect(html).not.toContain(word);
    expect(html).toContain("no");
  });

  it("are still there in the office", () => {
    session.user.is_field_staff = false;
    const html = render(pieces());
    session.user.is_field_staff = true;
    expect(html).toContain("预览");
    expect(html).toContain("yes");
  });
});
