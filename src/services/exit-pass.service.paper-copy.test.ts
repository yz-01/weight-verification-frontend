/**
 * JB217 audit round 2 (contract v4 §14 F7): 「见附件：…」 is read through the
 * 出门条's own address, `GET /api/exit-passes/get_paper_copy/`, whose read
 * rule is the pass's - so the guard and a safety manager without the
 * record's page open it too. Not `record-attachments/download`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  fetchObjectUrl: vi.fn(async () => "blob:copy"),
  download: vi.fn(async () => {}),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  toastSuccess: vi.fn(),
  fetchObjectUrl: client.fetchObjectUrl,
  download: client.download,
}));

const { downloadExitPassPaperCopy, exitPassPaperCopyObjectUrl } = await import("@/services/exit-pass.service");

describe("the 出门条's signed paper copy (contract v4 F7)", () => {
  beforeEach(() => {
    client.fetchObjectUrl.mockClear();
    client.download.mockClear();
  });

  it("opens in place from get_paper_copy, inline", async () => {
    await expect(exitPassPaperCopyObjectUrl("MATERIAL_OUTGOING", "mo-1")).resolves.toBe("blob:copy");
    expect(client.fetchObjectUrl).toHaveBeenCalledWith("/api/exit-passes/get_paper_copy/", {
      query: { kind: "MATERIAL_OUTGOING", record: "mo-1", inline: "1" },
    });
  });

  it("downloads from get_paper_copy under the file's own name", async () => {
    await downloadExitPassPaperCopy("WASTE_OUTGOING", "wo-1", "signed.pdf");
    expect(client.download).toHaveBeenCalledWith("/api/exit-passes/get_paper_copy/", {
      query: { kind: "WASTE_OUTGOING", record: "wo-1" },
      fallbackFilename: "signed.pdf",
    });
  });
});
