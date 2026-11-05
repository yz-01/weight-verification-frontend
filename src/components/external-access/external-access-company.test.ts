/**
 * 外部访问链接 issued by MSE for a named contractor (JB99 review F3, 客户 11-05
 * 事项 4 第 5 点 「统一由MSE Admin……管理」): the list and the new link carry
 * the company; a tenant's own calls do not.
 */
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ list: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", () => ({
  api: { ...api, get: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { createExternalAccessGrant, getExternalAccessGrants } = await import("@/services/external-access.service");

describe("external access for a named company", () => {
  it("passes the company through", async () => {
    await getExternalAccessGrants({ page_size: 100, company: "c1" });
    expect(api.list).toHaveBeenCalledWith("/api/external-access-grants/get_grants/", { page_size: 100, company: "c1" });
    await createExternalAccessGrant({ company: "c1", name: "x", project: null, allowed_fields: ["project"], expires_at: "2026-12-01T00:00:00Z" });
    expect(api.post.mock.calls[0][1]).toMatchObject({ company: "c1" });
  });
});
