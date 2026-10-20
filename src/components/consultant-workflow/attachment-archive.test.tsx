/**
 * 「从文件管理选择」 on a consultant application (J22, JB7, Q22).
 *
 * The files come from the application's own project through the application
 * (no 查看文件 permission), a file that holds only system photographs is
 * offered too and names the record it brings, and picking is by file.
 */
import { describe, expect, it, vi } from "vitest";

import type { ConsultantApplication } from "@/interfaces/consultant-workflow";
import type { ApplicationDocumentCandidate } from "@/services/consultant-workflow.service";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/consultant-applications/a1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => false }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { AttachmentDialog } = await import("@/components/consultant-workflow/attachment-slots");

const application = { id: "a1", project: "p1", attachments: [] } as unknown as ConsultantApplication;

const candidates: ApplicationDocumentCandidate[] = [
  {
    id: "d1",
    document_no: "DOC-001",
    title: "Structural IFC",
    category_name: "图纸",
    subcategory_name: "",
    latest_version: { id: "v1", original_name: "ifc.pdf" },
    system_files: [],
  },
  {
    id: "d2",
    document_no: "DOC-002",
    title: "Rebar delivery",
    category_name: "现场记录",
    subcategory_name: "",
    latest_version: null,
    system_files: [
      { record: { kind: "MATERIAL_RECEIPT", id: "r1", reference: "MI-P1-001", deleted: false } },
    ] as unknown as ApplicationDocumentCandidate["system_files"],
  },
];

describe("the consultant application's archive picker (J22)", () => {
  it("lists the project's files, system-photo-only ones too, naming the record they bring", () => {
    const html = renderDetail(
      <AttachmentDialog
        application={application}
        openArchive
        canArchive
        onClose={() => {}}
        onChanged={() => {}}
        onSaved={() => {}}
      />,
      (client) => client.setQueryData(["application-document-candidates", "a1", ""], { results: candidates, count: 2 }),
    );
    expect(html).toContain("DOC-001 · Structural IFC");
    expect(html).toContain("DOC-002 · Rebar delivery");
    expect(html).toContain("整条记录：MI-P1-001（附完整证据 PDF）");
  });
});

describe("the PIN dialog names the J22 action", () => {
  it("in every language", async () => {
    for (const locale of ["en", "ms", "zh", "zh-TW"]) {
      const words = (await import(`@/messages/${locale}.json`)).default;
      expect(words.signOff.action.consultant_link_document, locale).toBeTruthy();
    }
  });
});
