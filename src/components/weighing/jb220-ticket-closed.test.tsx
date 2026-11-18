/**
 * JB220 (客户 11-18) on MSE's weighing screens: the weights, the trace and the
 * chain stay the platform's; the plate, the names, the photos and the ticket are
 * the recycler's. While it has not opened 「允许 MSE 查看」 they read 「客户未开放」
 * and one sentence stands where the photos would be - never 「加载失败」. Open,
 * MSE previews the ticket and nothing else.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/weighing/admin/search",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "mse-1", portal: "MSE_ADMIN", is_platform_staff: true, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => false,
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { DeviceMediaList } = await import("@/components/weighing/view-weigh-session");
const { AdminCWEWorkspace } = await import("@/components/weighing/admin-cwe-workspace");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const MEDIA_KEY = ["device-media", "weighsession", "s-1"];

const failedMedia = (error: unknown, closedShown = false) =>
  renderDetail(<DeviceMediaList sessionId="s-1" platformCompany="c-rec" closedShown={closedShown} />, (client) => {
    client.getQueryCache().build(client, { queryKey: MEDIA_KEY }).setState({ status: "error", error, fetchStatus: "idle" } as never);
  });

describe("the ticket page's photos (JB220)", () => {
  const closed = new ApiError(zh.errors.api.platform_access_closed, 403, {}, "platform_access_closed");

  it("a closed door stands as the sentence, not 「加载失败」", () => {
    const html = failedMedia(closed);
    expect(html).toContain(zh.mseAccess.closed.photos);
    expect(html).not.toContain("无法载入");
  });

  it("is said once when the page already says the customer has not opened", () => {
    expect(failedMedia(closed, true)).toBe("");
  });

  it("any other failure is still the house's 「无法载入…」 with 重试", () => {
    const html = failedMedia(new ApiError("Server error", 500, {}, ""));
    expect(html).toContain("无法载入");
    expect(html).not.toContain(zh.mseAccess.closed.photos);
  });

  it("asks in the recycler's name, quietly, and previews only", () => {
    const source = read("src/components/weighing/view-weigh-session.tsx");
    expect(source).toContain("const platformCompany = mse ? record.company : undefined;");
    expect(source).toContain("platformCompany ? { platformCompany, silent: true } : {}");
    expect(source).toContain('const previewOnly = mse ? t("errors.api.platform_access_view_only") : undefined;');
    expect(source).toMatch(/<PrintTicketButton[\s\S]*?platformCompany=\{platformCompany\}[\s\S]*?blockedReason=\{previewOnly\}[\s\S]*?disabledReason=\{closedReason\}/);
    expect(source).toMatch(/<RecordExportButton[\s\S]*?platformCompany=\{platformCompany\}[\s\S]*?blockedReason=\{closedReason \?\? previewOnly\}/);
    expect(source).toContain("closedValue(record, record.vehicle_plate)");
    expect(source).toContain("{recyclerClosed && <PlatformClosedPhotos />}");
  });

  it("the shared export menu greys all but 预览 with the reason", () => {
    const source = read("src/components/shared/export-button.tsx");
    expect(source).toContain('const blocked = Boolean(blockedReason) && action !== "preview";');
    expect(source).toContain("title={blocked ? blockedReason : undefined}");
  });
});

const ROW = {
  id: "s-1", company: "c-rec", company_code: "REC-01", company_name: "E2E Recycling", session_no: "WS-000123", scale: "sc-1",
  scale_name: "Main bridge", site: "y-1", site_name: "Yard 1", dispatch: null, dispatch_no: null, project: null, project_code: null,
  project_name: null, recycler: "c-rec", recycler_name: "E2E Recycling", vehicle_plate: null, direction: "GROSS", state: "COMPLETED",
  verdict: "VALID", ticket_status: "CONFIRMED", confirmed_at: "2026-11-18T10:00:00+08:00", confirmed_by: null, confirmed_by_name: null,
  confirmation_note: null, voided_at: null, voided_by: null, voided_by_name: null, void_reason: null, reweigh_of: null,
  reweigh_of_session_no: null, attempt_no: 1, requires_review: false, started_at: "2026-11-18T09:55:00+08:00",
  ended_at: "2026-11-18T10:00:00+08:00", stable_weight_kg: "12500", gross_weight_kg: "12500", tare_weight_kg: null,
  net_weight_kg: null, reading_count: 40, anomaly_count: 0,
};

describe("云称重 称重查询 (JB220)", () => {
  const search = (rows: unknown[]) =>
    renderDetail(<AdminCWEWorkspace section="search" />, (client) => {
      client.setQueryData(["admin-cwe", "sessions", 1, "", "", "", "", ""], { count: rows.length, page: 1, page_size: 25, total_pages: 1, results: rows });
    });

  it("a closed recycler's plate reads 「客户未开放」 under one line saying why; the weight stays", () => {
    const html = search([{ ...ROW, platform_closed: true }]);
    expect(html).toContain("客户未开放");
    expect(html).toContain(zh.mseAccess.closed.note);
    expect(html).toContain("WS-000123");
    expect(html).toContain("12,500 kg");
  });

  it("an open recycler's row is whole, with no note", () => {
    const html = search([{ ...ROW, vehicle_plate: "WXY 1234", platform_closed: false }]);
    expect(html).toContain("WXY 1234");
    expect(html).not.toContain(zh.mseAccess.closed.note);
    expect(html).not.toContain("客户未开放");
  });
});
