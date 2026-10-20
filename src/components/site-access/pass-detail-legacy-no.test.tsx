/**
 * One number per record (J15-1, Q15): the gate pass detail no longer shows
 * the 「旧编号」 a pass kept when I6 renumbered it.
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

describe("the gate pass detail (J15-1)", () => {
  it("shows its one number even when it kept an old one", () => {
    const html = renderDetail(<PassDetail row={{ ...pass, legacy_no: "AP-0042" }} onClose={() => {}} />);
    expect(html).toContain("AP-P1-261008-001");
    expect(html).not.toContain("旧编号");
    expect(html).not.toContain("AP-0042");
  });

  it("shows nothing extra on a pass numbered since", () => {
    const html = renderDetail(<PassDetail row={pass} onClose={() => {}} />);
    expect(html).not.toContain("旧编号");
  });
});
