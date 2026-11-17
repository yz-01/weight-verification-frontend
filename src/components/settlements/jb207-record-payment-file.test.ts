import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * JB207-6 (Lucas 11-16 audit): 记录付款 takes the 凭证文件.
 *
 * The backend always took `document` (multipart), and the contractor's
 * 付款凭证 has a 「凭证文件」 column for it, but the dialog sent JSON with
 * no file input, so the column could never fill. A chosen file now goes as a
 * form; without one the request is the JSON it always was.
 */
const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/services/api-client", () => ({
  api: { ...api, get: vi.fn(), list: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { recordPayment } = await import("@/services/recycler.service");

const PAYLOAD = {
  amount: "1000.00",
  paid_on: "2026-11-16",
  method: "BANK_TRANSFER",
  reference: "HLB-001",
};

describe("recordPayment", () => {
  beforeEach(() => api.post.mockReset().mockResolvedValue({ id: "p1" }));

  it("sends the JSON it always did when no file is chosen", async () => {
    await recordPayment("s1", PAYLOAD);
    await recordPayment("s1", PAYLOAD, null);
    for (const call of api.post.mock.calls) {
      expect(call[0]).toBe("/api/settlements/s1/record_payment/");
      expect(call[1]).toEqual(PAYLOAD);
    }
  });

  it("sends a form carrying the file and every field when one is", async () => {
    const slip = new File(["%PDF"], "slip.pdf", { type: "application/pdf" });
    await recordPayment("s1", PAYLOAD, slip);
    const body = api.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("document")).toBeInstanceOf(File);
    expect((body.get("document") as File).name).toBe("slip.pdf");
    expect(body.get("amount")).toBe("1000.00");
    expect(body.get("paid_on")).toBe("2026-11-16");
    expect(body.get("method")).toBe("BANK_TRANSFER");
    expect(body.get("reference")).toBe("HLB-001");
  });
});

describe("the 记录付款 dialog", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/settlements/view-settlement.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("has an optional 凭证文件 input whose file goes with the payment", () => {
    expect(source).toMatch(/label=\{t\("settlements\.payment\.document"\)\}\n\s+optional=/);
    expect(source).toMatch(/type="file"\n\s+accept="application\/pdf,image\/png,image\/jpeg"/);
    expect(source).toMatch(/setProofFile\(event\.target\.files\?\.\[0\] \?\? null\)/);
    expect(source).toMatch(/\},\n\s+proofFile,\n\s+\),/);
  });
});
