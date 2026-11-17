/**
 * JB215B-2 (Lucas 11-17, the JB205-7 sibling): CWE 地磅's row pencil 「管理」
 * opens /scales/<id>/edit, which needs `scale.manage`. A read-only platform
 * role (Support Agent, Finance) was shown it and bounced off the edit page.
 * It shows only with `scale.manage` now, and without it the table has no
 * empty 操作 column.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ codes: new Set<string>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/weighing/admin/scales",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", portal: "MSE_ADMIN", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => reader.codes.has(code),
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { AdminCWEWorkspace } = await import("@/components/weighing/admin-cwe-workspace");

const SCALE = {
  id: "sc-1", company: "c-1", company_code: "REC-01", company_name: "Green Metal", site: "y-1", site_name: "Yard 1",
  code: "WB-01", name: "Main bridge", protocol: "bdi_2001b", unit: "kg", is_active: true, gateway_count: 1,
  created_at: "2026-11-01T00:00:00Z",
};

function render(codes: string[]) {
  reader.codes = new Set(codes);
  return renderDetail(<AdminCWEWorkspace section="scales" />, (client) => {
    client.setQueryData(["companies", "cwe-options"], { count: 0, page: 1, page_size: 250, total_pages: 1, results: [] });
    client.setQueryData(["admin-cwe", "scales", 1, "", ""], { count: 1, page: 1, page_size: 25, total_pages: 1, results: [SCALE] });
  });
}

describe("JB215B-2 the CWE 地磅 row pencil", () => {
  it("is not shown to a read-only role, nor its empty 操作 column", () => {
    const html = render(["cloud_weighing.view"]);
    expect(html).toContain("WB-01");
    expect(html).not.toContain('href="/scales/sc-1/edit"');
    expect(html).not.toContain(`>${zh.adminCwe.field.action}<`);
  });

  it("is shown with scale.manage", () => {
    const html = render(["scale.manage"]);
    expect(html).toContain('href="/scales/sc-1/edit"');
    expect(html).toContain(`>${zh.adminCwe.field.action}<`);
  });
});
