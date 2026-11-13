/**
 * JB192: every request the rain records make, against the contract in
 * `docs/DEV_SPEC_2026-11-06.md` 第二十五轮 「接口和资料」 - the paths, the
 * parameter names and the field names, exactly.
 */
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn() }));
const fetchAsFile = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("@/services/api-client", () => ({ api, fetchAsFile, toastSuccess }));

const service = await import("@/services/rain-records.service");

describe("the rain records service (接口 1-6)", () => {
  it("sends both photos, both moments and whole fixes in one form (create_rain_record)", async () => {
    api.post.mockResolvedValueOnce({ id: "r-1", record_no: "PG-A-001" });
    const start = new File(["a"], "start.jpg", { type: "image/jpeg" });
    const end = new File(["b"], "end.jpg", { type: "image/jpeg" });

    await service.createRainRecord({
      project: "p-1",
      client_event_id: "rain-1",
      start_captured_at: "2026-11-13T06:05:00.000Z",
      end_captured_at: "2026-11-13T07:10:00.000Z",
      start_latitude: "3.1000000",
      start_longitude: "101.6000000",
      // Half a fix is no fix: not sent.
      end_latitude: "3.2000000",
      device_id: "device-1",
      start_photo: start,
      end_photo: end,
    });

    const [url, body, options] = api.post.mock.calls[0];
    expect(url).toBe("/api/site-progress/create_rain_record/");
    expect(options).toEqual({ silent: true });
    const form = body as FormData;
    expect([...form.keys()].sort()).toEqual(
      [
        "project",
        "client_event_id",
        "start_captured_at",
        "end_captured_at",
        "start_latitude",
        "start_longitude",
        "device_id",
        "start_photo",
        "end_photo",
      ].sort(),
    );
    expect(form.get("client_event_id")).toBe("rain-1");
    expect((form.get("start_photo") as File).name).toBe("start.jpg");
    expect((form.get("end_photo") as File).name).toBe("end.jpg");
    expect(form.has("end_latitude")).toBe(false);
  });

  it("reads the rain records with rain=1 and the list's own filters (get_records)", () => {
    service.getRainRecords({ page: 1, project: "p-1", month: "2026-11", voided: "0" });
    expect(api.list).toHaveBeenCalledWith("/api/site-progress/get_records/", {
      page: 1,
      project: "p-1",
      month: "2026-11",
      voided: "0",
      rain: "1",
    });
  });

  it("reads one project's statistics by month or by range (rain_summary)", () => {
    service.getRainSummary({ project: "p-1", month: "2026-11" });
    expect(api.get).toHaveBeenLastCalledWith("/api/site-progress/rain_summary/", {
      project: "p-1",
      month: "2026-11",
    });
    service.getRainSummary({ project: "p-1", date_from: "2026-11-01", date_to: "2026-11-09" });
    expect(api.get).toHaveBeenLastCalledWith("/api/site-progress/rain_summary/", {
      project: "p-1",
      date_from: "2026-11-01",
      date_to: "2026-11-09",
    });
  });

  it("reads and sets the rules (rain_rules, set_rain_rules)", async () => {
    service.getRainRules();
    expect(api.get).toHaveBeenLastCalledWith("/api/site-progress/rain_rules/");
    api.post.mockResolvedValueOnce({ limit: 6, minutes: 45, can_change: true });
    await service.setRainRules({ limit: 6, minutes: 45 });
    expect(api.post).toHaveBeenLastCalledWith("/api/site-progress/set_rain_rules/", { limit: 6, minutes: 45 });
    expect(toastSuccess).toHaveBeenLastCalledWith("rainRecords.rules.saved");
  });

  it("voids one with its reason (void_rain_record; the PIN is the API client's)", async () => {
    api.post.mockResolvedValueOnce({ id: "r-1", record_no: "PG-A-001", is_voided: true });
    await service.voidRainRecord("r-1", "  拍错了 ");
    expect(api.post).toHaveBeenLastCalledWith("/api/site-progress/r-1/void_rain_record/", { reason: "拍错了" });
    expect(toastSuccess).toHaveBeenLastCalledWith("rainRecords.void.done", { number: "PG-A-001" });
  });

  it("fetches the month's PDF in the reader's language (rain_report_pdf)", () => {
    service.rainReportPdfFile("p-1", "2026-11", "zh-TW");
    expect(fetchAsFile).toHaveBeenCalledWith("/api/site-progress/rain_report_pdf/", {
      method: "GET",
      query: { project: "p-1", month: "2026-11", lang: "zh-TW" },
      fallbackFilename: "Rainy-Weather-2026-11.pdf",
    });
  });
});
