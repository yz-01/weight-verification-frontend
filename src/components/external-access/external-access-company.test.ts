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

const { createExternalAccessGrant, getExternalAccessGrants, revokeExternalAccessGrant } = await import(
  "@/services/external-access.service"
);

describe("external access for a named company", () => {
  it("passes the company through", async () => {
    await getExternalAccessGrants({ page_size: 100, company: "c1" });
    expect(api.list).toHaveBeenCalledWith("/api/external-access-grants/get_grants/", { page_size: 100, company: "c1" });
    await createExternalAccessGrant({ company: "c1", name: "x", project: null, allowed_fields: ["project"], expires_at: "2026-12-01T00:00:00Z" });
    expect(api.post.mock.calls[0][1]).toMatchObject({ company: "c1" });
  });

  it("MSE's 撤销 names the company too; a tenant's own does not (walk 11-18 F5)", async () => {
    api.post.mockClear();
    await revokeExternalAccessGrant("g1", "", "c1");
    expect(api.post).toHaveBeenCalledWith("/api/external-access-grants/g1/revoke_grant/", { reason: "" }, { query: { company: "c1" } });
    await revokeExternalAccessGrant("g2", "");
    expect(api.post).toHaveBeenLastCalledWith("/api/external-access-grants/g2/revoke_grant/", { reason: "" }, undefined);
    const source = (await import("node:fs")).readFileSync("src/components/external-access/external-access-management.tsx", "utf8");
    expect(source).toContain("revokeExternalAccessGrant(grant.id, reason, companyId)");
  });
});
