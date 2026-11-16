/**
 * JB209-6 / JB209-16 (Lucas 11-16 audit C-F2, C usability): what the CRM and
 * support services send for a 负责人 / 处理人员 and a 下次跟进日期, and where
 * the pickers read the staff from.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  get: vi.fn(async () => []),
  post: vi.fn(async () => ({})),
  patch: vi.fn(async () => ({})),
  list: vi.fn(async () => ({ count: 0, page: 1, page_size: 100, total_pages: 1, results: [] })),
}));
vi.mock("@/services/api-client", () => ({ api, download: vi.fn(), toastSuccess: vi.fn() }));

const crm = await import("@/services/crm.service");
const support = await import("@/services/support.service");

beforeEach(() => {
  api.get.mockClear();
  api.post.mockClear();
  api.patch.mockClear();
});

describe("enquiry 处理 sends the handler and the follow-up date", () => {
  it("adds them to the status change when given", async () => {
    await crm.updateEnquiryStatus("e1", "IN_PROGRESS", "回过电话", "", { assigned_to: "u2", follow_up_date: "2026-11-30" });
    expect(api.post).toHaveBeenCalledWith("/api/customer-enquiries/e1/update_status/", {
      status: "IN_PROGRESS", result: "回过电话", lost_reason: "", assigned_to: "u2", follow_up_date: "2026-11-30",
    });
  });

  it("leaves them out when unchanged, so the server keeps what it has", async () => {
    await crm.updateEnquiryStatus("e1", "WON", "", "");
    expect(api.post).toHaveBeenCalledWith("/api/customer-enquiries/e1/update_status/", { status: "WON", result: "", lost_reason: "" });
  });

  it("clears the handler with null", async () => {
    await crm.updateEnquiryStatus("e1", "NEW", "", "", { assigned_to: null });
    expect(api.post).toHaveBeenCalledWith("/api/customer-enquiries/e1/update_status/", expect.objectContaining({ assigned_to: null }));
  });
});

describe("the pickers read the staff who may do the work", () => {
  it("enquiries ask the customer-enquiry endpoint", async () => {
    await crm.getEnquiryAssigneeOptions();
    expect(api.get).toHaveBeenCalledWith("/api/customer-enquiries/get_assignee_options/");
  });

  it("tickets and Bugs ask the support-ticket endpoint", async () => {
    await support.getSupportAssigneeOptions();
    expect(api.get).toHaveBeenCalledWith("/api/support-tickets/get_assignee_options/");
  });
});

describe("a Bug's 处理 carries its handler", () => {
  it("patches assigned_to with the rest of the Bug", async () => {
    await support.updateBug("b1", { state: "IN_PROGRESS", assigned_to: "u3" });
    expect(api.patch).toHaveBeenCalledWith("/api/bug-reports/b1/update_bug/", { state: "IN_PROGRESS", assigned_to: "u3" });
  });
});
