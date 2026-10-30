/**
 * 【改正】 around 确认归档. Lucas 10-30 evening: 「全部事项归档后都可以修改」 -
 * the server locks nothing and the button reads 【改正】. Should the lock come
 * back (`archived` on the form), it reads 【补充】 while something is blank
 * and is gone once nothing is (JB77: no button that only says no).
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

  it("reads 改正 on an archived record when the server locks nothing (Lucas 10-30 evening)", () => {
    archived.mockReturnValue(true);
    const html = show("PROGRESS", { ...blankLeft, archived: false });
    expect(html).toContain("改正");
    expect(html).not.toContain("补充");
  });

  it("reads 补充 on an archived record that still has a blank", () => {
    archived.mockReturnValue(true);
    const html = show("PROGRESS", blankLeft);
    expect(html).toContain("补充");
    expect(html).not.toContain(">改正<");
  });

  it("is gone from a locked archived record with nothing blank", () => {
    archived.mockReturnValue(true);
    expect(show("PROGRESS", nothingLeft)).toBe("");
  });

  it("treats 材料出场 like every other kind (JB41 withdrawn)", () => {
    archived.mockReturnValue(true);
    expect(show("MATERIAL_OUTGOING", nothingLeft)).toBe("");
    expect(archived).toHaveBeenCalledWith("MATERIAL_OUTGOING", "r1");
  });

  it("treats a 整改 like every other kind: archived by its 【确认归档】 (JB90)", () => {
    archived.mockReturnValue(true);
    expect(show("HAZARD", { ...blankLeft, kind: "HAZARD" })).toContain("补充");
    expect(show("HAZARD", { ...nothingLeft, kind: "HAZARD" })).toBe("");
    expect(archived).toHaveBeenCalledWith("HAZARD", "r1");
  });
});
