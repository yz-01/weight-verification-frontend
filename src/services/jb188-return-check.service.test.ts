/**
 * JB188: 【确认核对】 is one request - the ticked returns of one supplier, the
 * remark and the files, signed by the PIN the API client asks for - and the
 * PDF is 「退货核对单」 in the reader's language (客户 11-13 第 2、3 点).
 */
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn() }));
const fetchAsFile = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("@/services/api-client", () => ({ api, fetchAsFile, toastSuccess }));

const service = await import("@/services/return-check.service");

describe("the return check service", () => {
  it("sends the supplier, every ticked return, the remark and the files in one form", async () => {
    api.post.mockResolvedValueOnce({ id: "c-1", check_no: "MO-RN001" });
    const photo = new File(["x"], "truck.jpg", { type: "image/jpeg" });
    const pdf = new File(["%PDF"], "note.pdf", { type: "application/pdf" });

    const check = await service.createReturnCheck({
      supplier: "s-1",
      returns: ["r-1", "r-2"],
      note: "  两车都对过了 ",
      files: [photo, pdf],
    });

    expect(check.check_no).toBe("MO-RN001");
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/api/material-return-checks/create_check/");
    const form = body as FormData;
    expect(form.get("supplier")).toBe("s-1");
    expect(form.getAll("returns")).toEqual(["r-1", "r-2"]);
    expect(form.get("note")).toBe("两车都对过了");
    expect((form.getAll("files") as File[]).map((file) => file.name)).toEqual(["truck.jpg", "note.pdf"]);
    // 「已核对，编号 MO-RN001」.
    expect(toastSuccess).toHaveBeenCalledWith("returnChecks.saved", { number: "MO-RN001" });
  });

  it("leaves the remark and the files out when there are none (both optional)", async () => {
    api.post.mockResolvedValueOnce({ id: "c-2", check_no: "MO-RN002" });
    await service.createReturnCheck({ supplier: "s-1", returns: ["r-3"], note: " ", files: [] });
    const form = api.post.mock.calls.at(-1)![1] as FormData;
    expect(form.has("note")).toBe(false);
    expect(form.has("files")).toBe(false);
  });

  it("reads 已核对 with the list's query, one check, and the suppliers waiting", () => {
    service.getReturnChecks({ page: 1, project: "p-1" });
    expect(api.list).toHaveBeenCalledWith("/api/material-return-checks/get_checks/", { page: 1, project: "p-1" });
    service.getReturnCheck("c-1");
    expect(api.get).toHaveBeenCalledWith("/api/material-return-checks/c-1/get_check/");
    service.getPendingReturnSuppliers("p-1");
    expect(api.get).toHaveBeenCalledWith("/api/material-return-checks/get_pending_suppliers/", { project: "p-1" });
    service.getPendingReturnSuppliers();
    expect(api.get).toHaveBeenLastCalledWith("/api/material-return-checks/get_pending_suppliers/", {});
  });

  it("fetches 退货核对单 in the reader's language, named by its number", () => {
    service.returnCheckPdfFile("c-1", "zh", "MO-RN001");
    expect(fetchAsFile).toHaveBeenCalledWith("/api/material-return-checks/c-1/get_check_pdf/", {
      method: "GET",
      query: { lang: "zh" },
      fallbackFilename: "MO-RN001.pdf",
    });
  });
});
