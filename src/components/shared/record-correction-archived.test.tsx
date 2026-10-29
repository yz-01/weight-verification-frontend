/**
 * JB77 (客户 10-29 晚 事项 5): a record confirmed and archived offers no 【改正】.
 * It used to, and only the dialog then said 「已确认归档，不能再改正」.
 * 材料出场 stays correctable after archiving (`after_archive` on the server).
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const archived = vi.fn();
vi.mock("@/components/shared/record-closure", () => ({
  useRecordArchived: (...args: unknown[]) => archived(...args),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: () => true }),
}));

const { RecordCorrectionButton } = await import("@/components/shared/record-correction");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("改正 after 确认归档 (JB77)", () => {
  beforeEach(() => archived.mockReset());

  it("is gone once a progress record is archived", () => {
    archived.mockReturnValue(true);
    expect(render(<RecordCorrectionButton kind="PROGRESS" recordId="p1" />)).toBe("");
    expect(archived).toHaveBeenCalledWith("PROGRESS", "p1");
  });

  it("is there while it is not", () => {
    archived.mockReturnValue(false);
    expect(render(<RecordCorrectionButton kind="PROGRESS" recordId="p1" />)).toContain("改正");
  });

  it("stays on 材料出场, which may still be corrected after archiving", () => {
    archived.mockReturnValue(false);
    expect(render(<RecordCorrectionButton kind="MATERIAL_OUTGOING" recordId="m1" />)).toContain("改正");
    // It does not even ask.
    expect(archived).toHaveBeenCalledWith("PROGRESS", undefined);
  });
});
