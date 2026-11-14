/**
 * JB199: the three requests of 「意见 / 备注」, against the spec's 「接口和资料」
 * - the paths, the bodies and the toast, exactly.
 */
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn() }));
const fetchAsFile = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("@/services/api-client", () => ({ api, fetchAsFile, toastSuccess }));

const service = await import("@/services/rain-records.service");

describe("the 「意见 / 备注」 requests (JB199)", () => {
  it("writes a rain record's remark, trimmed, on the void's own base path (set_rain_remark)", async () => {
    api.post.mockResolvedValueOnce({ id: "r-1", rain_remark: "Heavy rain" });
    const fresh = await service.setRainRemark("r-1", "  Heavy rain  ");
    expect(api.post).toHaveBeenLastCalledWith("/api/site-progress/r-1/set_rain_remark/", { remark: "Heavy rain" });
    expect(toastSuccess).toHaveBeenLastCalledWith("rainRecords.remark.saved");
    expect(fresh).toEqual({ id: "r-1", rain_remark: "Heavy rain" });
  });

  it("clears it with an empty one", async () => {
    api.post.mockResolvedValueOnce({ id: "r-1", rain_remark: "" });
    await service.setRainRemark("r-1", "   ");
    expect(api.post).toHaveBeenLastCalledWith("/api/site-progress/r-1/set_rain_remark/", { remark: "" });
  });

  it("reads one project's month (rain_month_remark)", () => {
    service.getRainMonthRemark({ project: "p-1", month: "2026-11" });
    expect(api.get).toHaveBeenLastCalledWith("/api/site-progress/rain_month_remark/", {
      project: "p-1",
      month: "2026-11",
    });
  });

  it("writes the month's remark, trimmed, with its project and month (set_rain_month_remark)", async () => {
    api.post.mockResolvedValueOnce({ project: "p-1", month: "2026-11", remark: "5 days", by_name: "Lucas", at: "x" });
    await service.setRainMonthRemark({ project: "p-1", month: "2026-11", remark: " 5 days " });
    expect(api.post).toHaveBeenLastCalledWith("/api/site-progress/set_rain_month_remark/", {
      project: "p-1",
      month: "2026-11",
      remark: "5 days",
    });
    expect(toastSuccess).toHaveBeenLastCalledWith("rainRecords.remark.saved");
  });

  it("holds the servers' limits", () => {
    expect(service.RAIN_REMARK_MAX).toBe(1000);
    expect(service.RAIN_MONTH_REMARK_MAX).toBe(2000);
  });
});
