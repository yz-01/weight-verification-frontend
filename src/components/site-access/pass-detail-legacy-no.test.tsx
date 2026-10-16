/**
 * The gate pass detail shows 「旧编号」 when the pass was renumbered (I6, ID35),
 * and nothing when it was not.
 */
import { describe, expect, it, vi } from "vitest";

import type { SiteAccessPass } from "@/interfaces/site-access";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/site-access",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useProjectBoxShown: () => true,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PassDetail } = await import("@/components/site-access/site-access-workspace");

const pass = {
  id: "pass-1",
  pass_no: "AP-P1-261008-001",
  project: "p1",
  project_name: "Tower A",
  subject_name: "Lorry WXY 1234",
  effective_status: "ACTIVE",
  valid_from: "2026-10-01T00:00:00Z",
  valid_until: "2026-10-31T00:00:00Z",
  events: [],
  credentials: [],
} as unknown as SiteAccessPass;

describe("the gate pass detail (I6, ID35)", () => {
  it("shows 旧编号 when the pass kept its old number", () => {
    const html = renderDetail(<PassDetail row={{ ...pass, legacy_no: "AP-0042" }} onClose={() => {}} />);
    expect(html).toContain("AP-P1-261008-001");
    expect(html).toContain("旧编号");
    expect(html).toContain("AP-0042");
  });

  it("shows nothing extra on a pass numbered since", () => {
    const html = renderDetail(<PassDetail row={pass} onClose={() => {}} />);
    expect(html).not.toContain("旧编号");
  });
});
