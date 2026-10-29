/**
 * 【改正】 after 确认归档 (Lucas 10-30: 「空白的需要补进去的归档后都可以继续
 * 补充，改正就不能」). Before the archive it reads 【改正】. Archived, it reads
 * 【补充】 while something is still blank, and is gone once nothing is
 * (JB77, 客户 10-29 晚 事项 5: no button that only says no).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const archived = vi.fn();
const form = vi.fn();
vi.mock("@/components/shared/record-closure", () => ({
  useRecordArchived: (...args: unknown[]) => archived(...args),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: () => true }),
}));
vi.mock("@/services/record-corrections.service", async (original) => ({
  ...(await original<object>()),
  getCorrectionForm: (...args: unknown[]) => form(...args),
}));

const { RecordCorrectionButton } = await import("@/components/shared/record-correction");

const blankLeft = { kind: "PROGRESS", record: "r1", reference: "", blocked: null, archived: true, fields: [] };
const nothingLeft = {
  ...blankLeft,
  blocked: { reason: "record_archived", message: "Archived." },
};

/** Rendered with the form the button asks for already answered. */
function show(kind: "PROGRESS" | "MATERIAL_OUTGOING" | "HAZARD" = "PROGRESS", answer?: object) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (answer) client.setQueryData(["record-correction-fillable", kind, "r1"], answer);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <RecordCorrectionButton kind={kind} recordId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("改正 / 补充 around 确认归档", () => {
  beforeEach(() => {
    archived.mockReset();
    form.mockReset();
  });

  it("reads 改正 before the archive", () => {
    archived.mockReturnValue(false);
    const html = show();
    expect(html).toContain("改正");
    expect(html).not.toContain("补充");
  });

  it("reads 补充 on an archived record that still has a blank", () => {
    archived.mockReturnValue(true);
    const html = show("PROGRESS", blankLeft);
    expect(html).toContain("补充");
    expect(html).not.toContain(">改正<");
  });

  it("is gone from an archived record with nothing blank, and while it asks", () => {
    archived.mockReturnValue(true);
    expect(show("PROGRESS", nothingLeft)).toBe("");
    expect(show("PROGRESS")).toBe("");
  });

  it("treats 材料出场 like every other kind (JB41 withdrawn)", () => {
    archived.mockReturnValue(true);
    expect(show("MATERIAL_OUTGOING", nothingLeft)).toBe("");
    expect(archived).toHaveBeenCalledWith("MATERIAL_OUTGOING", "r1");
  });

  it("never asks the closure address about a 整改: its form says (the 「不在范围」 toast, 10-30)", () => {
    archived.mockReturnValue(false);
    expect(show("HAZARD", { ...blankLeft, kind: "HAZARD", archived: false })).toContain("改正");
    expect(show("HAZARD", { ...blankLeft, kind: "HAZARD" })).toContain("补充");
    expect(show("HAZARD", { ...nothingLeft, kind: "HAZARD" })).toBe("");
    for (const call of archived.mock.calls) expect(call[1]).toBeUndefined();
  });
});
